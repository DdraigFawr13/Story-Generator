// The Town room's drawing: a calm Canvas 2D picture of the watched site, made from the same site
// state the old tile view reads (local map, buildings, crops, weather, residents). The ground, paths,
// fields and buildings are painted once into a cached layer and again only when the layout changes;
// each frame blits that layer, lays the time of day over it and draws the dots, which glide between
// places. Frames are scheduled only while something moves, so a paused town costs nothing.

import { siteCodes, type ActiveSite, type Id, type SiteRules, type WorldState } from '../../engine';
import { fieldLabelSpots } from '../site-render';
import {
  BLOCK_TINT,
  IDENTITY_VIEW,
  clampView,
  crowds,
  frameOf,
  glideAlpha,
  glideAt,
  glideDone,
  isZoomed,
  keepInside,
  labelRank,
  leaveDelay,
  pathLength,
  placeLabels,
  townBuildings,
  walkMs,
  zoomAt,
  type Box,
  type Glide,
  type TownBuilding,
  type View,
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
/** The soft paper halo behind a name, so it reads over paths, trees and dots. */
const HALO = 'rgba(250, 246, 236, 0.9)';
/** The building highlight fades in and out over this long (ms). */
const FOCUS_FADE_MS = 200;
/** While only slow glides run, frames come at most this often (ms): about 30 a second. */
const SLOW_FRAME_MS = 30;
/** A touch or click that moves less than this many pixels is a tap, not a drag. */
const TAP_SLOP = 6;
/** How long a tapped building's name stays up (ms). */
const NAME_MS = 2500;

/** A tile hash for small, steady variations in tree size and place. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** How a refresh moves the dots (see `pacing`). */
export interface Pace {
  glideMs: number;
  spreadMs: number;
  fade: boolean;
}

interface Dot {
  id: Id;
  name: string;
  g: Glide;
  /** The building the dot is going to (null outdoors or in a field). */
  inside: Id | null;
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
  /** Zoom and pan on top of the fit (pinch, wheel and drag). */
  private view: View = IDENTITY_VIEW;
  private wasZoomed = false;
  private followed: Id | null = null;
  private hover: Id | null = null;
  private block = 'afternoon';
  /** The highlight of each building the followed dot is in or has just left: opacity 0-1. */
  private glow = new Map<Id, number>();
  private glowAt = 0;
  /** People hidden in a crowded building's count in the last frame (not pickable). */
  private hidden = new Set<Id>();
  /** Names that did not fit, by building; shown on hover or tap. */
  private skipped = new Map<Id, string>();
  private plan: { text: string; box: Box; strong: boolean; italic: boolean }[] = [];
  private planKey = '';
  private hoverBuilding: Id | null = null;
  private tapBuilding: Id | null = null;
  private tapTimer = 0;
  /** Only slow glides run: frames are held to about 30 a second. */
  private slow = false;
  private looping = false;
  private drawnAt = 0;
  /** Pointers down on the canvas, for drag and pinch. */
  private pointers = new Map<number, { x: number; y: number }>();
  private tap: { x: number; y: number; moved: boolean } | null = null;
  /** Called after the first full paint, and whenever the layer is rebuilt. */
  onPaint: (() => void) | null = null;
  /** A tap or click on the canvas (CSS pixels from its corner). */
  onTap: ((x: number, y: number) => void) | null = null;
  /** The mouse over the canvas, or null when it leaves. */
  onHover: ((x: number | null, y: number) => void) | null = null;
  /** The view moved off or back to the whole-town fit. */
  onZoomed: ((zoomed: boolean) => void) | null = null;

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
      this.planKey = '';
      this.request();
    });
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointerleave', this.leave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
  }

  dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    window.clearTimeout(this.later);
    window.clearTimeout(this.tapTimer);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.down);
    c.removeEventListener('pointermove', this.move);
    c.removeEventListener('pointerup', this.up);
    c.removeEventListener('pointercancel', this.cancel);
    c.removeEventListener('pointerleave', this.leave);
    c.removeEventListener('wheel', this.wheel);
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

  setFollowed(id: Id | null) {
    if (this.followed === id) return;
    this.followed = id;
    this.request();
  }

  setHover(id: Id | null) {
    if (this.hover === id) return;
    this.hover = id;
    this.request();
  }

  /** Slow speeds hold frames to about 30 a second. */
  setSlow(slow: boolean) {
    this.slow = slow;
  }

  /** The name of a building whose label was left off, shown while the mouse is over it. */
  setHoverBuilding(id: Id | null) {
    if (this.hoverBuilding === id) return;
    this.hoverBuilding = id;
    this.request();
  }

  /** The block (not a field or wall) under a canvas point, if any. */
  buildingAt(px: number, py: number): TownBuilding | undefined {
    const s = this.scale;
    const tx = (px - this.ox) / s;
    const ty = (py - this.oy) / s;
    for (let i = this.buildings.length - 1; i >= 0; i -= 1) {
      const b = this.buildings[i]!;
      if (b.defId === 'field' || b.defId === 'wall') continue;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
    }
    return undefined;
  }

  /** A tap on a building: its name shows for a moment, even if it did not fit on the map. */
  showName(id: Id | null) {
    window.clearTimeout(this.tapTimer);
    this.tapBuilding = id;
    if (id !== null) {
      this.tapTimer = window.setTimeout(() => {
        this.tapBuilding = null;
        this.request();
      }, NAME_MS);
    }
    this.request();
  }

  /** Back to the whole-town fit. */
  resetView() {
    this.view = IDENTITY_VIEW;
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

  /** The building a tile lies in (a block, not a field, wall or well), if any. */
  private insideAt(tx: number, ty: number): Id | null {
    for (const b of this.buildings) {
      if (b.defId === 'field' || b.defId === 'wall' || b.defId === 'well') continue;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b.id;
    }
    return null;
  }

  /**
   * Re-reads the site after a snapshot: the buildings, and where each resident now is. Each dot
   * sets off after its own delay (a share of `pace.spreadMs` from its engine leave time, so no one moves on the
   * beat) and walks, or fades at fast speeds, to its new place. A zero `glideMs` puts it there.
   */
  refresh(world: WorldState, pace: Pace, nameOf: (id: Id) => string, now = performance.now()) {
    const active = this.active;
    if (!active) return;
    this.buildings = townBuildings(active.buildings.values(), this.rules.buildings, this.jarl);
    this.planKey = '';
    const size = active.map.width;
    const alive = new Set<Id>();
    for (const id of active.residents) {
      const detail = world.people.get(id)?.detail;
      const pos = detail?.pos;
      if (!pos) continue;
      alive.add(id);
      const tx = pos[0] + 0.5;
      const ty = pos[1] + 0.5;
      const inside = this.insideAt(pos[0], pos[1]);
      const dot = this.dots.get(id);
      if (!dot) {
        this.dots.set(id, {
          id,
          name: nameOf(id),
          g: { fx: tx, fy: ty, tx, ty, start: now, duration: 0 },
          inside,
        });
        continue;
      }
      dot.name = nameOf(id);
      dot.inside = inside;
      if (dot.g.tx === tx && dot.g.ty === ty) continue;
      const here = glideAt(dot.g, now);
      let path: [number, number][] | undefined;
      const walk = detail?.walk;
      if (walk && walk.length >= 2 && pace.glideMs > 0 && !pace.fade) {
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
      const tiles = path ? pathLength(path) : Math.hypot(tx - here.x, ty - here.y);
      const duration =
        pace.glideMs <= 0 ? 0 : pace.fade ? pace.glideMs : walkMs(pace.glideMs, tiles, this.scale);
      dot.g = {
        fx: here.x,
        fy: here.y,
        tx,
        ty,
        start: now + (duration > 0 ? leaveDelay(id, pace.spreadMs, detail?.leaveAt) : 0),
        duration,
        path,
        fade: pace.fade,
      };
    }
    for (const id of [...this.dots.keys()]) if (!alive.has(id)) this.dots.delete(id);
    this.request();
  }

  /** The followed person's drawn position, in tile units. */
  positionOf(id: Id, now = performance.now()): { x: number; y: number } | null {
    const dot = this.dots.get(id);
    return dot ? glideAt(dot.g, now) : null;
  }

  /** How many dots are on the map (the residents the room draws). */
  get drawn(): number {
    return this.dots.size;
  }

  /** The person whose dot is nearest a point (CSS pixels from the canvas corner), if one is close. */
  pick(px: number, py: number, now = performance.now()): Id | null {
    let best: Id | null = null;
    let bestD = Math.max(11, this.radius() + 6);
    for (const dot of this.dots.values()) {
      if (this.hidden.has(dot.id)) continue;
      const p = glideAt(dot.g, now);
      const d = Math.hypot(this.ox + p.x * this.scale - px, this.oy + p.y * this.scale - py);
      if (d <= bestD) {
        bestD = d;
        best = dot.id;
      }
    }
    return best;
  }

  /** Asks for a frame; `loop` marks the next frame of a running glide (held to 30 a second when slow). */
  request(loop = false) {
    if (this.disposed) return;
    if (this.raf) {
      if (!loop) this.looping = false;
      return;
    }
    this.looping = loop;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = 0;
      this.frame();
    });
  }

  private frame() {
    if (this.w === 0 || this.h === 0) return;
    const now = performance.now();
    if (this.slow && this.looping && now - this.drawnAt < SLOW_FRAME_MS) {
      this.request(true);
      return;
    }
    this.draw(now);
    this.drawnAt = now;
    let again = this.glowing;
    for (const dot of this.dots.values()) {
      if (!glideDone(dot.g, now)) again = true;
    }
    if (again) this.request(true);
  }

  private get glowing(): boolean {
    for (const [id, a] of this.glow) if (a > 0 && (a < 1 || id !== this.focusNow)) return true;
    return false;
  }

  private radius(): number {
    return Math.max(3.2, Math.min(6.5, this.scale * 0.5));
  }

  // ---- zoom and pan ----

  private local(event: { clientX: number; clientY: number }) {
    const box = this.canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  private moveView(next: View) {
    this.view = next;
    this.request();
  }

  private readonly down = (event: PointerEvent) => {
    const at = this.local(event);
    this.pointers.set(event.pointerId, at);
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer cannot be captured; dragging still works while it stays on the canvas.
    }
    this.tap =
      this.pointers.size === 1 ? { x: at.x, y: at.y, moved: false } : { x: 0, y: 0, moved: true };
  };

  private readonly move = (event: PointerEvent) => {
    const at = this.local(event);
    const last = this.pointers.get(event.pointerId);
    if (!last) {
      if (event.pointerType === 'mouse') this.onHover?.(at.x, at.y);
      return;
    }
    if (this.pointers.size === 1) {
      const tap = this.tap;
      if (tap && !tap.moved && Math.hypot(at.x - tap.x, at.y - tap.y) > TAP_SLOP) tap.moved = true;
      if (tap?.moved) {
        this.moveView({
          ...this.view,
          x: this.view.x + at.x - last.x,
          y: this.view.y + at.y - last.y,
        });
      }
    } else if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)![1];
      const before = Math.hypot(last.x - other.x, last.y - other.y) || 1;
      const after = Math.hypot(at.x - other.x, at.y - other.y);
      const mid = { x: (at.x + other.x) / 2, y: (at.y + other.y) / 2 };
      const was = { x: (last.x + other.x) / 2, y: (last.y + other.y) / 2 };
      const zoomed = zoomAt(this.view, after / before, mid.x, mid.y);
      this.moveView({ ...zoomed, x: zoomed.x + mid.x - was.x, y: zoomed.y + mid.y - was.y });
    }
    this.pointers.set(event.pointerId, at);
  };

  private readonly up = (event: PointerEvent) => {
    const at = this.local(event);
    const tap = this.tap;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) {
      this.tap = null;
      if (tap && !tap.moved && this.pointers.size === 0) this.onTap?.(at.x, at.y);
    } else if (this.tap) this.tap.moved = true;
  };

  private readonly cancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size === 0) this.tap = null;
  };

  private readonly leave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.onHover?.(null, 0);
  };

  private readonly wheel = (event: WheelEvent) => {
    event.preventDefault();
    const at = this.local(event);
    const lines = event.deltaMode === 1 ? 16 : 1;
    // A trackpad pinch arrives as a wheel with ctrlKey and small deltas; it zooms faster.
    const rate = event.ctrlKey ? 0.01 : 0.0018;
    this.moveView(zoomAt(this.view, Math.exp(-event.deltaY * lines * rate), at.x, at.y));
  };

  // ---- layout of the picture ----

  private fit() {
    const active = this.active;
    if (!active) return;
    const size = active.map.width;
    const frame = frameOf(this.buildings, size, FRAME_MARGIN);
    const padX = 12;
    const availW = Math.max(40, this.w - padX * 2);
    const availH = Math.max(40, this.h - this.padTop - this.padBottom);
    const base = Math.max(1, Math.min(availW / frame.w, availH / frame.h));
    const bx = padX + (availW - frame.w * base) / 2 - frame.x * base;
    const by = this.padTop + (availH - frame.h * base) / 2 - frame.y * base;
    // The town's box on the screen at zoom 1; zoom and pan never leave a gap at the canvas edge.
    const town = {
      x: bx + frame.x * base,
      y: by + frame.y * base,
      w: frame.w * base,
      h: frame.h * base,
    };
    this.view = clampView(this.view, town, this.w, this.h);
    this.scale = base * this.view.k;
    this.ox = bx * this.view.k + this.view.x;
    this.oy = by * this.view.k + this.view.y;
    const zoomed = isZoomed(this.view);
    if (zoomed !== this.wasZoomed) {
      this.wasZoomed = zoomed;
      this.onZoomed?.(zoomed);
    }
  }

  /** What the cached layer's structure depends on; when it changes the layer is painted again at once. */
  private key(): string {
    const a = this.active!;
    return `${this.w}x${this.h}:${this.dpr}:${this.padTop}:${this.padBottom}:${this.fonts}:${a.layoutVersion}:${
      a.weather.snowCover > 0 ? 1 : 0
    }:${this.buildings.length}:${this.scale.toFixed(2)}:${this.ox.toFixed(1)}:${this.oy.toFixed(1)}`;
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
    this.drawFocus(ctx, now);
    const tags = this.drawDots(ctx, now);
    this.drawLabels(ctx, a.weather.snowCover > 0);
    for (const t of tags) this.tag(ctx, t.text, t.x, t.y, t.strong);
    this.drawName(ctx);
  }

  /** The block the followed dot is drawn inside right now, so the highlight goes with the dot. */
  private focusNow: Id | null = null;

  private drawFocus(ctx: CanvasRenderingContext2D, now: number) {
    const dot = this.followed === null ? undefined : this.dots.get(this.followed);
    if (dot) {
      const p = glideAt(dot.g, now);
      this.focusNow = this.insideAt(Math.floor(p.x), Math.floor(p.y));
    } else this.focusNow = null;
    const dt = Math.min(100, Math.max(0, now - this.glowAt));
    this.glowAt = now;
    if (this.focusNow !== null && !this.glow.has(this.focusNow)) this.glow.set(this.focusNow, 0);
    for (const [id, a] of [...this.glow]) {
      const next =
        id === this.focusNow ? Math.min(1, a + dt / FOCUS_FADE_MS) : a - dt / FOCUS_FADE_MS;
      if (next <= 0 && id !== this.focusNow) {
        this.glow.delete(id);
        continue;
      }
      this.glow.set(id, next);
      const b = this.buildings.find((x) => x.id === id);
      if (!b) continue;
      const s = this.scale;
      ctx.globalAlpha = Math.max(0, next);
      ctx.beginPath();
      ctx.roundRect(this.ox + b.x * s, this.oy + b.y * s, b.w * s, b.h * s, Math.min(4, s * 0.5));
      ctx.fillStyle = FOCUS_FILL;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = FOCUS_EDGE;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Draws the dots and the count badges; returns the name tags to lay over the labels. */
  private drawDots(ctx: CanvasRenderingContext2D, now: number) {
    const r = this.radius();
    const s = this.scale;
    const tags: { text: string; x: number; y: number; strong: boolean }[] = [];
    let followed: { dot: Dot; x: number; y: number } | null = null;
    // People who have arrived in a crowded building show as one count, not a pile of dots.
    const arrived = [...this.dots.values()].map((d) => (glideDone(d.g, now) ? d.inside : null));
    const crowded = crowds(arrived);
    this.hidden.clear();
    let i = 0;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = DOT;
    for (const dot of this.dots.values()) {
      const inCrowd = arrived[i]! !== null && crowded.has(arrived[i]!);
      i += 1;
      const p = glideAt(dot.g, now);
      const x = this.ox + p.x * s;
      const y = this.oy + p.y * s;
      if (dot.id === this.followed) {
        followed = { dot, x, y };
        continue;
      }
      if (inCrowd && dot.id !== this.hover) {
        this.hidden.add(dot.id);
        continue;
      }
      if (dot.id === this.hover) tags.push({ text: dot.name, x, y: y + r + 4, strong: false });
      ctx.globalAlpha = glideAlpha(dot.g, now);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const [id, n] of crowded) {
      const b = this.buildings.find((x) => x.id === id);
      if (!b) continue;
      const cx = this.ox + (b.x + b.w / 2) * s;
      const cy = this.oy + (b.y + b.h / 2) * s;
      // A badge wider than its building (a shrunken map) would bury its neighbours: one dot instead.
      if (b.w * s >= 30) this.badge(ctx, `×${n}`, cx, cy);
      else {
        ctx.fillStyle = DOT;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (followed) {
      ctx.globalAlpha = glideAlpha(followed.dot.g, now);
      ctx.lineWidth = 2;
      ctx.fillStyle = FOLLOWED;
      ctx.beginPath();
      ctx.arc(followed.x, followed.y, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      tags.push({ text: followed.dot.name, x: followed.x, y: followed.y + r + 6, strong: true });
    }
    return tags;
  }

  /** A small count in a paper pill, centred on a point. */
  private badge(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number) {
    ctx.font = `600 12px ${FONT}`;
    const w = ctx.measureText(text).width + 12;
    const h = 18;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fillStyle = '#6f685e';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fffdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
  }

  /** The names of the buildings (and "Fields"), placed hall first and skipping any that would overlap. */
  private makePlan(ctx: CanvasRenderingContext2D) {
    const key = `${this.scale.toFixed(2)}|${this.ox.toFixed(1)}|${this.oy.toFixed(1)}|${this.w}x${this.h}|${this.fonts}|${this.buildings.length}`;
    if (key === this.planKey) return;
    this.planKey = key;
    const s = this.scale;
    const size1 = Math.max(12, Math.min(15, s * 1.7));
    const asks: { key: Id | string; rank: number; x: number; y: number; w: number; h: number }[] =
      [];
    const info = new Map<Id | string, { text: string; strong: boolean; italic: boolean }>();
    const onScreen = (b: Box) => b.x < this.w && b.x + b.w > 0 && b.y < this.h && b.y + b.h > 0;
    const ask = (
      id: Id | string,
      rank: number,
      text: string,
      cx: number,
      top: number,
      strong: boolean,
      italic: boolean,
    ) => {
      ctx.font = `${italic ? 'italic ' : ''}${strong ? 700 : 500} ${strong ? size1 + 1 : size1}px ${FONT}`;
      const w = ctx.measureText(text).width + 8;
      const h = size1 + 6;
      const box = keepInside({ x: cx - w / 2, y: top, w, h }, this.w, this.h, 3);
      asks.push({ key: id, rank, ...box });
      info.set(id, { text, strong, italic });
    };
    for (const b of this.buildings) {
      if (!b.label) continue;
      const rect = { x: this.ox + b.x * s, y: this.oy + b.y * s, w: b.w * s, h: b.h * s };
      if (!onScreen(rect)) continue;
      ask(
        b.id,
        labelRank(b.defId),
        b.label,
        rect.x + rect.w / 2,
        rect.y + rect.h + 1,
        b.defId === 'hall',
        false,
      );
    }
    const spots = fieldLabelSpots(
      [...this.active!.buildings.values()].filter((b) => b.defId === 'field'),
    );
    spots.slice(0, 3).forEach((spot, n) => {
      const cx = this.ox + spot.x * s;
      const top = this.oy + spot.y * s - 3 - size1;
      if (cx > 0 && cx < this.w && top > 0 && top < this.h) {
        ask(`fields${n}`, 99, 'Fields', cx, top, false, true);
      }
    });
    const placed = placeLabels(asks);
    const box = new Map(asks.map((a) => [a.key, a as Box]));
    this.plan = placed.kept.map((k) => ({ ...info.get(k)!, box: box.get(k)! }));
    this.skipped = new Map();
    for (const k of placed.skipped) {
      if (typeof k === 'number') this.skipped.set(k, info.get(k)!.text);
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D, snow: boolean) {
    this.makePlan(ctx);
    const size1 = Math.max(12, Math.min(15, this.scale * 1.7));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const l of this.plan) {
      ctx.font = `${l.italic ? 'italic ' : ''}${l.strong ? 700 : 500} ${l.strong ? size1 + 1 : size1}px ${FONT}`;
      const x = l.box.x + l.box.w / 2;
      const y = l.box.y + l.box.h / 2;
      ctx.lineWidth = 4;
      ctx.strokeStyle = snow ? 'rgba(236, 238, 230, 0.9)' : HALO;
      ctx.strokeText(l.text, x, y);
      ctx.fillStyle = l.strong ? INK : SOFT;
      ctx.fillText(l.text, x, y);
    }
  }

  /** The name of a building whose label did not fit, while the mouse is over it or it was tapped. */
  private drawName(ctx: CanvasRenderingContext2D) {
    for (const id of new Set([this.hoverBuilding, this.tapBuilding])) {
      if (id === null) continue;
      const text = this.skipped.get(id);
      const b = this.buildings.find((x) => x.id === id);
      if (!text || !b) continue;
      const s = this.scale;
      this.tag(ctx, text, this.ox + (b.x + b.w / 2) * s, this.oy + (b.y + b.h) * s + 2, false);
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
