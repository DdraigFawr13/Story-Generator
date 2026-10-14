// The Town room's drawing: a calm Canvas 2D picture of the watched site, made from the same site
// state the old tile view reads (local map, buildings, crops, weather, residents). The ground, paths,
// fields and buildings are painted once into a cached layer and again only when the layout changes;
// each frame blits that layer, lays the time of day over it and draws the dots, which glide between
// places. Frames are scheduled only while something moves, so a paused town costs nothing.

import { siteCodes, type ActiveSite, type Id, type SiteRules, type WorldState } from '../../engine';
import { fieldLabelSpots } from '../site-render';
import {
  BLOCK_TINT,
  frameOf,
  glideAt,
  glideDone,
  townBuildings,
  type Glide,
  type TownBuilding,
} from './scene';

// Colours follow the approved mock-up's Town screen (soft sage ground, cream roads, paper blocks).
const GROUND = '#dfe3cf';
const SNOW = '#eceee6';
const WATER = '#bcd0d6';
const SEA = '#c7d5d7';
const PATH = '#ece4d2';
const WOOD = '#c4d1ad';
const PINE = '#b4c59f';
const BLOCK = '#f8f3e8';
const BLOCK_EDGE = '#cbbd9f';
const COUNTED = '#efe9dc';
const COUNTED_EDGE = '#d8ccb2';
const FOCUS_FILL = '#f3e2c9';
const FOCUS_EDGE = '#c0703a';
const INK = '#24211d';
const SOFT = '#716a5f';
const DOT = '#8d8478';
const FOLLOWED = '#c0703a';
/** Ground tints for terrain other than grass (soft: the picture is calm, not a map key). */
const TERRAIN_TINT: Record<string, string> = {
  scrub: '#d8dfc2',
  marsh: '#cfd9bd',
  shore: '#e7e3c9',
  rock: '#d3cfc0',
};
/** Field bed fill and stripe by crop stage; a bare or unsown field is plain earth. */
const FIELD: Record<string, [string, string]> = {
  bare: ['#e9dcb8', '#d9c999'],
  sown: ['#e9dcb8', '#d9c999'],
  growing: ['#d9deaa', '#bfc98a'],
  ripe: ['#ecd790', '#d9bd62'],
  cut: ['#e4d6ac', '#d2c192'],
  ruined: ['#cfc4a8', '#b9ac8c'],
};
const FROST_FIELD: [string, string] = ['#d8dfd3', '#bccab9'];
/** The ground layer is repainted for a crop or building change at most this often (ms). */
const LOOK_REPAINT_MS = 500;
/** Tiles of map shown around the buildings. */
const FRAME_MARGIN = 5;
const FONT = "'Alegreya', Georgia, serif";

/** A tile hash for small, steady variations in tree size and place. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

interface Dot {
  id: Id;
  name: string;
  g: Glide;
}

export class TownPainter {
  readonly ctx: CanvasRenderingContext2D;
  /** The cached ground layer, at device pixels. */
  private layer = document.createElement('canvas');
  /** What the cached layer was last painted for: the structure, and the crops and burns on it. */
  private layerKey = '';
  private layerLook = '';
  private layerAt = 0;
  private later = 0;
  private dots = new Map<Id, Dot>();
  private buildings: TownBuilding[] = [];
  private active: ActiveSite | null = null;
  private rules: SiteRules;
  private jarl = false;
  private raf = 0;
  private disposed = false;
  private fonts = false;
  /** CSS pixel size of the canvas and its device pixel ratio. */
  w = 0;
  h = 0;
  private dpr = 1;
  /** Space the header and the bar take, so the town sits clear of them. */
  private padTop = 0;
  private padBottom = 0;
  /** Pixels per tile and the pixel position of tile (0, 0). */
  scale = 1;
  private ox = 0;
  private oy = 0;
  private followed: Id | null = null;
  private hover: Id | null = null;
  private block = 'afternoon';
  /** Building the followed person is in. */
  private focus: number | null = null;
  /** Called after the first full paint, and whenever the layer is rebuilt. */
  onPaint: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    rules: SiteRules,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser has no 2D canvas.');
    this.ctx = ctx;
    this.rules = rules;
    // Canvas text only uses a web font once it is loaded; repaint when the fonts arrive.
    void document.fonts?.ready.then(() => {
      if (this.disposed) return;
      this.fonts = true;
      this.layerKey = '';
      this.request();
    });
  }

  dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    window.clearTimeout(this.later);
  }

  /** The site being drawn; `jarl` makes the hall "Jarl's hall". */
  setSite(active: ActiveSite, jarl: boolean) {
    this.active = active;
    this.jarl = jarl;
  }

  setPads(top: number, bottom: number) {
    if (top === this.padTop && bottom === this.padBottom) return;
    this.padTop = top;
    this.padBottom = bottom;
    this.layerKey = '';
    this.request();
  }

  setBlock(block: string) {
    if (block === this.block) return;
    this.block = block;
    this.request();
  }

  setFollowed(id: Id | null, building: number | null) {
    if (this.followed === id && this.focus === building) return;
    this.followed = id;
    this.focus = building;
    this.request();
  }

  setHover(id: Id | null) {
    if (this.hover === id) return;
    this.hover = id;
    this.request();
  }

  /** Match the canvas to its box; true when the size changed. */
  resize(): boolean {
    const box = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.layerKey = '';
    this.request();
    return true;
  }

  /**
   * Re-reads the site after a snapshot: the buildings, and where each resident now is. Dots glide
   * from where they are drawn now to their new place over `duration` ms (0 puts them there).
   */
  refresh(
    world: WorldState,
    duration: number,
    nameOf: (id: Id) => string,
    now = performance.now(),
  ) {
    const active = this.active;
    if (!active) return;
    this.buildings = townBuildings(active.buildings.values(), this.rules.buildings, this.jarl);
    const size = active.map.width;
    const alive = new Set<Id>();
    for (const id of active.residents) {
      const detail = world.people.get(id)?.detail;
      const pos = detail?.pos;
      if (!pos) continue;
      alive.add(id);
      const tx = pos[0] + 0.5;
      const ty = pos[1] + 0.5;
      const dot = this.dots.get(id);
      if (!dot) {
        this.dots.set(id, {
          id,
          name: nameOf(id),
          g: { fx: tx, fy: ty, tx, ty, start: now, duration: 0 },
        });
        continue;
      }
      dot.name = nameOf(id);
      if (dot.g.tx === tx && dot.g.ty === ty) continue;
      const here = glideAt(dot.g, now);
      let path: [number, number][] | undefined;
      const walk = detail?.walk;
      if (walk && walk.length >= 2 && duration > 0) {
        const steps = walk.slice(0, detail.walkTo ?? walk.length);
        const last = steps[steps.length - 1];
        // Use the route only when it ends where the person now is.
        if (last === pos[1] * size + pos[0]) {
          path = steps.map((k) => [(k % size) + 0.5, Math.floor(k / size) + 0.5]);
          if (Math.hypot(path[0]![0] - here.x, path[0]![1] - here.y) > 0.5) {
            path.unshift([here.x, here.y]);
          }
        }
      }
      dot.g = { fx: here.x, fy: here.y, tx, ty, start: now, duration, path };
    }
    for (const id of [...this.dots.keys()]) if (!alive.has(id)) this.dots.delete(id);
    this.request();
  }

  /** The followed person's drawn position, in tile units. */
  positionOf(id: Id, now = performance.now()): { x: number; y: number } | null {
    const dot = this.dots.get(id);
    return dot ? glideAt(dot.g, now) : null;
  }

  /** The person whose dot is nearest a point (CSS pixels from the canvas corner), if one is close. */
  pick(px: number, py: number, now = performance.now()): Id | null {
    let best: Id | null = null;
    let bestD = Math.max(11, this.radius() + 6);
    for (const dot of this.dots.values()) {
      const p = glideAt(dot.g, now);
      const d = Math.hypot(this.ox + p.x * this.scale - px, this.oy + p.y * this.scale - py);
      if (d <= bestD) {
        bestD = d;
        best = dot.id;
      }
    }
    return best;
  }

  request() {
    if (this.raf || this.disposed) return;
    this.raf = window.requestAnimationFrame((t) => {
      this.raf = 0;
      this.frame(t);
    });
  }

  private frame(_t: number) {
    if (this.w === 0 || this.h === 0) return;
    const now = performance.now();
    this.draw(now);
    for (const dot of this.dots.values()) {
      if (!glideDone(dot.g, now)) {
        this.request();
        return;
      }
    }
  }

  private radius(): number {
    return Math.max(3.2, Math.min(6.5, this.scale * 0.5));
  }

  // ---- layout of the picture ----

  private fit() {
    const active = this.active;
    if (!active) return;
    const size = active.map.width;
    const frame = frameOf(this.buildings, size, FRAME_MARGIN);
    const padX = 12;
    const availW = Math.max(40, this.w - padX * 2);
    const availH = Math.max(40, this.h - this.padTop - this.padBottom);
    this.scale = Math.max(2, Math.min(availW / frame.w, availH / frame.h));
    this.ox = padX + (availW - frame.w * this.scale) / 2 - frame.x * this.scale;
    this.oy = this.padTop + (availH - frame.h * this.scale) / 2 - frame.y * this.scale;
  }

  /** What the cached layer's structure depends on; when it changes the layer is painted again at once. */
  private key(): string {
    const a = this.active!;
    return `${this.w}x${this.h}:${this.dpr}:${this.padTop}:${this.padBottom}:${this.fonts}:${a.layoutVersion}:${
      a.weather.snowCover > 0 ? 1 : 0
    }:${this.buildings.length}`;
  }

  /** What changes on the fields and buildings (crops, fire, building work): repainted at most twice a second. */
  private look(): string {
    let s = '';
    for (const b of this.active!.buildings.values()) {
      s += `|${b.id}${b.crop ? b.crop.stage[0]! + (b.crop.frostBitten ? 'f' : '') : ''}${
        b.burnt ? 'b' : ''
      }${b.progress ?? ''}`;
    }
    return s;
  }

  // ---- drawing ----

  draw(now: number) {
    const a = this.active;
    if (!a || this.w === 0) return;
    this.fit();
    const key = this.key();
    const look = this.look();
    const structural = key !== this.layerKey;
    if (structural || (look !== this.layerLook && now - this.layerAt >= LOOK_REPAINT_MS)) {
      this.paintLayer(a);
      this.layerKey = key;
      this.layerLook = look;
      this.layerAt = now;
      this.onPaint?.();
    } else if (look !== this.layerLook && !this.later) {
      // Crops changed a moment after the last paint: show it when the pause is up.
      this.later = window.setTimeout(
        () => {
          this.later = 0;
          this.request();
        },
        LOOK_REPAINT_MS - (now - this.layerAt),
      );
    }
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.drawImage(this.layer, 0, 0, this.w, this.h);
    const tint = BLOCK_TINT[this.block];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    this.drawFocus(ctx);
    this.drawDots(ctx, now);
  }

  private drawFocus(ctx: CanvasRenderingContext2D) {
    if (this.focus === null) return;
    const b = this.buildings.find((x) => x.id === this.focus);
    if (!b || b.defId === 'field') return;
    const s = this.scale;
    ctx.beginPath();
    ctx.roundRect(this.ox + b.x * s, this.oy + b.y * s, b.w * s, b.h * s, Math.min(4, s * 0.5));
    ctx.fillStyle = FOCUS_FILL;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = FOCUS_EDGE;
    ctx.stroke();
  }

  private drawDots(ctx: CanvasRenderingContext2D, now: number) {
    const r = this.radius();
    const s = this.scale;
    let followed: { dot: Dot; x: number; y: number } | null = null;
    let hovered: { dot: Dot; x: number; y: number } | null = null;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = DOT;
    for (const dot of this.dots.values()) {
      const p = glideAt(dot.g, now);
      const x = this.ox + p.x * s;
      const y = this.oy + p.y * s;
      if (dot.id === this.followed) {
        followed = { dot, x, y };
        continue;
      }
      if (dot.id === this.hover) hovered = { dot, x, y };
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (hovered) this.tag(ctx, hovered.dot.name, hovered.x, hovered.y + r + 4, false);
    if (followed) {
      ctx.lineWidth = 2;
      ctx.fillStyle = FOLLOWED;
      ctx.beginPath();
      ctx.arc(followed.x, followed.y, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.tag(ctx, followed.dot.name, followed.x, followed.y + r + 6, true);
    }
  }

  /** A pill with a name, centred under a dot and kept inside the canvas. */
  private tag(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    top: number,
    strong: boolean,
  ) {
    ctx.font = `${strong ? 600 : 500} 13px ${FONT}`;
    const w = ctx.measureText(text).width + 18;
    const h = 22;
    const x = Math.max(4, Math.min(this.w - w - 4, cx - w / 2));
    const y = Math.max(4, Math.min(this.h - h - 4, top));
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = strong ? INK : 'rgba(255, 253, 248, 0.95)';
    ctx.fill();
    if (!strong) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = BLOCK_EDGE;
      ctx.stroke();
    }
    ctx.fillStyle = strong ? '#fffdf8' : INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }

  /** Paints ground, water, paths, trees, fields, buildings and their names into the cached layer. */
  private paintLayer(a: ActiveSite) {
    const layer = this.layer;
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const snow = a.weather.snowCover > 0;
    ctx.fillStyle = snow ? SNOW : GROUND;
    ctx.fillRect(0, 0, this.w, this.h);
    const map = a.map;
    const size = map.width;
    const s = this.scale;
    const codes = siteCodes(this.rules);
    const x0 = Math.max(0, Math.floor(-this.ox / s));
    const x1 = Math.min(size, Math.ceil((this.w - this.ox) / s));
    const y0 = Math.max(0, Math.floor(-this.oy / s));
    const y1 = Math.min(size, Math.ceil((this.h - this.oy) / s));
    const bridges = new Set(map.bridges);
    const terrainName = (k: number) => this.rules.terrains[map.terrain[k]!]?.id ?? 'grass';

    // Ground tints, water and wet shores.
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const k = y * size + x;
        const water = map.water[k]!;
        let fill: string | null = null;
        if (water !== 0 && !bridges.has(k)) fill = water === codes.sea ? SEA : WATER;
        else if (!snow) fill = TERRAIN_TINT[terrainName(k)] ?? null;
        if (fill) {
          ctx.fillStyle = fill;
          ctx.fillRect(this.ox + x * s - 0.4, this.oy + y * s - 0.4, s + 0.8, s + 0.8);
        }
      }
    }
    // Paths: soft cream, a round blob on each tile so corners join smoothly.
    ctx.fillStyle = PATH;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const k = y * size + x;
        if (map.building[k] !== 0 && map.building[k] !== undefined) continue;
        if (map.terrain[k] === codes.path || bridges.has(k)) {
          ctx.beginPath();
          ctx.arc(this.ox + (x + 0.5) * s, this.oy + (y + 0.5) * s, s * 0.78, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Trees: soft round crowns, a little larger and shifted by the tile's hash.
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const k = y * size + x;
        const tree = map.tree[k]!;
        if (tree === 0 || map.building[k]) continue;
        const h = hash(x, y);
        ctx.fillStyle = tree === codes.conifer ? PINE : WOOD;
        ctx.beginPath();
        ctx.arc(
          this.ox + (x + 0.25 + ((h & 7) / 7) * 0.5) * s,
          this.oy + (y + 0.25 + (((h >> 3) & 7) / 7) * 0.5) * s,
          s * (0.5 + ((h >> 6) & 3) * 0.1),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    // Fields first (they lie under everything), then the blocks.
    const raw = a.buildings;
    for (const b of this.buildings) {
      if (b.defId !== 'field') continue;
      const crop = raw.get(b.id)?.crop;
      const [fill, stripe] = crop?.frostBitten
        ? FROST_FIELD
        : (FIELD[crop?.stage ?? 'bare'] ?? FIELD.bare!);
      const bx = this.ox + b.x * s;
      const by = this.oy + b.y * s;
      ctx.beginPath();
      ctx.roundRect(bx, by, b.w * s, b.h * s, Math.min(5, s * 0.6));
      ctx.fillStyle = b.state === 'burnt' ? '#8a8277' : fill;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = b.state === 'burnt' ? '#6f685e' : stripe;
      ctx.lineWidth = Math.max(1, s * 0.16);
      ctx.beginPath();
      for (let row = 0; row < b.h; row += 1) {
        const yy = by + (row + 0.5) * s;
        ctx.moveTo(bx + s * 0.3, yy);
        ctx.lineTo(bx + b.w * s - s * 0.3, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    for (const b of this.buildings) {
      if (b.defId === 'field' || b.defId === 'wall') continue;
      this.paintBlock(ctx, b);
    }
    // Walls are single tiles; paint them as a thin ink line of blocks.
    ctx.fillStyle = BLOCK_EDGE;
    for (const b of this.buildings) {
      if (b.defId !== 'wall') continue;
      ctx.fillRect(this.ox + b.x * s, this.oy + b.y * s, b.w * s, b.h * s);
    }

    // Names. A halo in the ground colour keeps them readable over paths and trees.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const halo = snow ? SNOW : GROUND;
    const text = (label: string, cx: number, y: number, font: string, colour: string) => {
      ctx.font = font;
      ctx.lineWidth = 4;
      ctx.strokeStyle = halo;
      ctx.strokeText(label, cx, y);
      ctx.fillStyle = colour;
      ctx.fillText(label, cx, y);
    };
    const size1 = Math.max(12, Math.min(15, s * 1.7));
    for (const b of this.buildings) {
      if (!b.label) continue;
      const strong = b.defId === 'hall';
      text(
        b.label,
        this.ox + (b.x + b.w / 2) * s,
        this.oy + (b.y + b.h) * s + size1 + 1,
        `${strong ? 700 : 500} ${strong ? size1 + 1 : size1}px ${FONT}`,
        strong ? INK : SOFT,
      );
    }
    // "Fields", once on the largest few clusters.
    const spots = fieldLabelSpots([...raw.values()].filter((b) => b.defId === 'field'));
    for (const spot of spots.slice(0, 3)) {
      text(
        'Fields',
        this.ox + spot.x * s,
        this.oy + spot.y * s - 3,
        `italic 500 ${size1 - 1}px ${FONT}`,
        SOFT,
      );
    }
  }

  private paintBlock(ctx: CanvasRenderingContext2D, b: TownBuilding) {
    const s = this.scale;
    const x = this.ox + b.x * s;
    const y = this.oy + b.y * s;
    if (b.defId === 'well') {
      ctx.beginPath();
      ctx.arc(x + (b.w * s) / 2, y + (b.h * s) / 2, Math.max(s * 0.9, 5), 0, Math.PI * 2);
      ctx.fillStyle = WATER;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#9fb5bc';
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, b.w * s, b.h * s, Math.min(4, s * 0.5));
    if (b.state === 'raising') {
      ctx.fillStyle = 'rgba(248, 243, 232, 0.45)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = BLOCK_EDGE;
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const counted = b.defId === 'home' && !b.followed;
    ctx.fillStyle = b.state === 'burnt' ? '#8f877b' : counted ? COUNTED : BLOCK;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = b.state === 'burnt' ? '#6f685e' : counted ? COUNTED_EDGE : BLOCK_EDGE;
    ctx.stroke();
  }
}
