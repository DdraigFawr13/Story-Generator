// The history playback player: a float clock over the finished history, drawn on a canvas with
// animated effects, banners, a captions feed and trade threads. It is drawing only: every fact it
// shows was logged by the history (see data.ts). Ported from the approved mock-up.

import {
  PLAYBACK_COLOURS,
  PLAYBACK_COST,
  PLAYBACK_MAX_ON_MAP,
  PLAYBACK_TAGS,
  PLAYBACK_EFFECTS,
  PLAYBACK_POOL,
  PLAYBACK_RED_TYPES,
  PLAYBACK_STORY,
  type PlaybackEffect,
  type PlaybackFx,
} from '../../content';
import type { Id, Rgb } from '../../engine';
import {
  census,
  isBig,
  isRare,
  realmTitle,
  shortRealm,
  type PlaybackData,
  type PlaybackEvent,
} from './data';

/** Years a second the player can run at. */
export const SPEEDS = [0.5, 1, 2, 4, 8, 15, 30, 60] as const;
export const DEFAULT_SPEED = 4;

/** The checkboxes under the map. */
export interface PlayerOptions {
  trade: boolean;
  follow: boolean;
  hold: boolean;
}
/** What the controls show; sent to the page when it changes. */
export interface PlayerState {
  playing: boolean;
  speed: number;
  /** Paused short of the present, or playing: Skip to the present is offered. */
  canSkip: boolean;
  /** The end card is showing. */
  ended: boolean;
}
/** The elements the player draws into and updates; the page owns their markup. */
export interface PlayerElements {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  strip: HTMLCanvasElement;
  bigYear: HTMLElement;
  census: HTMLElement;
  yearLabel: HTMLElement;
  range: HTMLInputElement;
  banner: HTMLElement;
  bannerKind: HTMLElement;
  bannerTitle: HTMLElement;
  bannerStory: HTMLElement;
  bannerMore: HTMLElement;
  feed: HTMLElement;
  tip: HTMLElement;
}

type Pt = [number, number];
type Project = (x: number, y: number) => Pt;
type Layer = HTMLCanvasElement | null;

/** One effect on the map. Optional fields are set by the kinds that use them. */
interface Fx {
  kind: PlaybackFx;
  x: number;
  y: number;
  col: Rgb;
  born: number;
  life: number;
  cost: number;
  e: PlaybackEvent;
  x2?: number;
  y2?: number;
  img?: Layer;
  reach?: number;
  r?: number;
  tag?: string;
  disputed?: boolean;
}
interface Spell {
  cell: number;
  kind: 'c' | 'd';
  from: number;
  until: number;
}
interface Scar {
  cell: number;
  y: number;
}
interface Stain {
  cell: number;
  y: number;
  img: HTMLCanvasElement;
  r: number;
}
interface BannerGroup {
  y: number;
  items: PlaybackEvent[];
}

const TAU = 6.283;
const { war: C_WAR, gold: C_GOLD, cold: C_COLD, dry: C_DRY } = PLAYBACK_COLOURS;
const FALLBACK: Rgb = [230, 230, 230];

const rgb = (c: readonly number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (p: number) => 1 - (1 - p) * (1 - p);
const hash = (i: number) => (((i * 2654435761) >>> 0) % 1000) / 1000;
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
const lighten = (c: Rgb, by: number): Rgb => [
  Math.min(255, c[0] + by),
  Math.min(255, c[1] + by),
  Math.min(255, c[2] + by),
];
const arcCtrl = (x1: number, y1: number, x2: number, y2: number, bend: number): Pt => [
  (x1 + x2) / 2 - (y2 - y1) * bend,
  (y1 + y2) / 2 + (x2 - x1) * bend,
];
const lru = <K, V>(map: Map<K, V>, max: number) => {
  while (map.size > max) map.delete(map.keys().next().value as K);
};

/** The longest an engine frame gap may count, so a hidden tab does not leap years on return. */
const MAX_FRAME_MS = 100;
/** The simulated year jumps by hundredths only; this is the beat of the banner and camera. */
const BANNER_MIN_MS = 1200;

/** Filled in a banner: `{key}` or `{key|fallback}`; realm names lose their title. */
function fill(template: string, data: PlaybackEvent['data']): string {
  return template.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_m, key: string, fallback?: string) => {
    const raw = data[key];
    if (raw === undefined) return fallback ?? '';
    return key === 'civ' || key === 'enemy' ? shortRealm(String(raw)) : String(raw);
  });
}

/** One line in story voice under a banner title; the choice is fixed by the event. */
export function storyLine(e: PlaybackEvent): string {
  const list = PLAYBACK_STORY[e.type];
  if (!list || list.length === 0) return '';
  const pick = list[Math.floor(hash(e.y * 31 + e.importance) * list.length)]!;
  return fill(pick, e.data);
}

/** Estimated wall time of the whole history at a speed: the plain rate plus the dips. */
export function estimate(speed: number, last: number, beats: number[]): string {
  let secs = last / speed;
  if (speed <= 8 && speed > 2) {
    const hold = (Math.max(1200, 2200 * Math.min(1, Math.sqrt(4 / speed))) * 0.8 + 400) / 1000;
    let chain = { n: 0, y: -99 };
    let count = 0;
    for (const y of beats) {
      chain = y - chain.y <= 6 ? { n: chain.n + 1, y } : { n: 1, y };
      if (chain.n <= 2) count += 1;
    }
    secs += count * hold * (1 - 0.7 / speed);
  }
  secs = Math.round(secs);
  return secs >= 90 ? `about ${Math.round(secs / 60)} min` : `about ${secs} s`;
}

export class HistoryPlayer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly W: number;
  private readonly H: number;
  private readonly N: number;
  private readonly last: number;
  private readonly reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly base: HTMLCanvasElement;
  private readonly blank: Uint16Array;

  // Canvas size: CSS size times device pixels. Effects are sized in "u": about one CSS pixel on a
  // desktop map, a little more on a small one, scaled with the camera zoom.
  private C = 1024;
  private PX = 1;
  private CSS = 800;

  private phase: 'paused' | 'playing' = 'paused';
  private ended = false;
  private t = 0;
  private speed = DEFAULT_SPEED;
  private beat: { start: number; hold: number } | null = null;
  private chain = { n: 0, y: -99 };
  private cam = { x: 0, y: 0, z: 1 };
  private camTarget = { x: 0, y: 0, z: 1 };
  private camBackAt = 0;
  private fx: Fx[] = [];
  private pending: Fx[] = [];
  private wars = new Map<string, [string, string]>();
  private spells: Spell[] = [];
  private scars: Scar[] = [];
  private stains: Stain[] = [];
  private hudYear = -1;
  private opts: PlayerOptions = { trade: false, follow: true, hold: false };
  private banner: { shown: BannerGroup | null; since: number; queue: BannerGroup[] } = {
    shown: null,
    since: 0,
    queue: [],
  };
  private prev = performance.now();
  private raf = 0;
  private sent = '';
  private dead = false;
  private resize: ResizeObserver;

  private readonly staticCache = new Map<string, HTMLCanvasElement>();
  private readonly washCache = new Map<number, Layer>();
  private readonly freshCache = new Map<number, Layer>();
  private readonly borderCache = new Map<number, Map<number, Path2D>>();
  private readonly frontCache = new Map<string, Path2D | null>();
  private readonly realmCache = new Map<
    number,
    { id: number; x: number; y: number; n: number }[]
  >();

  constructor(
    private readonly data: PlaybackData,
    private readonly els: PlayerElements,
    private readonly onState: (state: PlayerState) => void,
  ) {
    this.ctx = els.canvas.getContext('2d')!;
    this.W = data.width;
    this.H = data.height;
    this.N = this.W * this.H;
    this.last = data.last;
    this.blank = new Uint16Array(this.N);
    this.cam = { x: this.W / 2, y: this.H / 2, z: 1 };
    this.camTarget = { ...this.cam };
    this.base = document.createElement('canvas');
    this.base.width = this.W;
    this.base.height = this.H;
    this.base
      .getContext('2d')!
      .putImageData(
        new ImageData(data.basePixels as Uint8ClampedArray<ArrayBuffer>, this.W, this.H),
        0,
        0,
      );
    this.fit();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(els.canvas);
    els.range.max = String(this.last);
    this.drawStrip();
    els.canvas.addEventListener('mousemove', this.onMove);
    els.canvas.addEventListener('mouseleave', this.onLeave);
    document.addEventListener('keydown', this.onKey);
    this.prev = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---- control

  setOptions(opts: PlayerOptions) {
    this.opts = opts;
  }
  /** The year shown, as a whole number. */
  year(): number {
    return Math.floor(this.t);
  }
  /** Starts at a year (0 gives the founding captions and wipes) and plays. */
  start(from: number) {
    this.seek(from);
    if (from === 0) this.opening(performance.now());
    this.play();
  }
  play() {
    if (this.t >= this.last) {
      this.seek(0);
      this.opening(performance.now());
    }
    this.ended = false;
    this.phase = 'playing';
    this.pushState();
  }
  pause() {
    if (this.phase === 'playing') this.phase = 'paused';
    this.pushState();
  }
  toggle() {
    if (this.phase === 'playing') this.pause();
    else this.play();
  }
  replay() {
    this.seek(0);
    this.opening(performance.now());
    this.play();
  }
  skip() {
    this.seek(this.last);
    this.phase = 'paused';
    this.showEnd();
  }
  /** A slider drag or key step: pauses, and rebuilds the lasting state at that year. */
  scrub(year: number) {
    this.pause();
    this.seek(year);
  }
  setSpeed(speed: number) {
    this.speed = speed;
    this.pushState();
  }
  stepSpeed(by: number) {
    const k = SPEEDS.indexOf(this.speed as (typeof SPEEDS)[number]);
    this.setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, k + by))]!);
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.els.canvas.removeEventListener('mousemove', this.onMove);
    this.els.canvas.removeEventListener('mouseleave', this.onLeave);
    document.removeEventListener('keydown', this.onKey);
  }

  private pushState() {
    const state: PlayerState = {
      playing: this.phase === 'playing',
      speed: this.speed,
      canSkip: this.phase === 'playing' || (this.phase === 'paused' && this.t < this.last),
      ended: this.ended,
    };
    const key = JSON.stringify(state);
    if (key === this.sent) return;
    this.sent = key;
    this.onState(state);
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    // A focused button or link already acts on Space and Enter.
    if ((tag === 'BUTTON' || tag === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === ' ') this.toggle();
    else if (e.key === 'ArrowRight') this.scrub(Math.min(this.last, this.year() + step));
    else if (e.key === 'ArrowLeft') this.scrub(Math.max(0, this.year() - step));
    else if (e.key === ']') this.stepSpeed(1);
    else if (e.key === '[') this.stepSpeed(-1);
    else return;
    e.preventDefault();
  };

  // ---- canvas size and theme

  private fit() {
    this.CSS = this.els.canvas.clientWidth || 800;
    this.PX = Math.min(3, window.devicePixelRatio || 1);
    const size = Math.round(this.CSS * this.PX);
    if (size !== this.C || this.els.canvas.width !== size) {
      this.C = this.els.canvas.width = this.els.canvas.height = size;
      this.staticCache.clear();
    }
  }
  private unit() {
    return this.PX * Math.max(0.85, Math.min(1.1, this.CSS / 700)) * Math.sqrt(this.cam.z);
  }
  private isDark() {
    return this.darkQuery.matches;
  }
  private tier(): 'full' | 'fast' | 'lapse' {
    return this.speed >= 30 ? 'lapse' : this.speed >= 15 ? 'fast' : 'full';
  }

  // ---- data helpers

  private cellXY(cell: number): Pt {
    return [(cell % this.W) + 0.5, Math.floor(cell / this.W) + 0.5];
  }
  private colourOf(e: PlaybackEvent): Rgb {
    return this.data.civByName.get(text(e.data.civ))?.colour ?? FALLBACK;
  }
  private capitalCell(civName: string, year: number): number | null {
    const civ = this.data.civByName.get(civName);
    if (!civ) return null;
    const seat = this.data.seatsAt(year).get(civ.id) ?? civ.capital;
    return this.data.sites.get(seat)?.cell ?? null;
  }
  private cellOfSite(name: string): number | null {
    return this.data.siteByName.get(name)?.cell ?? null;
  }
  private territoryOf(year: number) {
    return this.data.bordersAt(year);
  }
  private keyOf(year: number) {
    return this.data.borderYear(year);
  }

  // ---- offscreen layers

  private cellCanvas(fill: (i: number) => number[] | null): Layer {
    const img = new ImageData(this.W, this.H);
    let any = false;
    for (let i = 0; i < this.N; i += 1) {
      const c = fill(i);
      if (!c) continue;
      any = true;
      img.data.set(c, i * 4);
    }
    if (!any) return null;
    const cv = document.createElement('canvas');
    cv.width = this.W;
    cv.height = this.H;
    cv.getContext('2d')!.putImageData(img, 0, 0);
    return cv;
  }
  private wash(year: number): Layer {
    const key = this.keyOf(year);
    if (this.washCache.has(key)) return this.washCache.get(key)!;
    const t = this.territoryOf(year);
    const cv = this.cellCanvas((i) =>
      t[i] ? [...(this.data.civById.get(t[i]!)?.colour ?? [200, 200, 200]), 92] : null,
    );
    this.washCache.set(key, cv);
    lru(this.washCache, 6);
    return cv;
  }
  /** Land that changed hands this year, as a gentle flash. */
  private fresh(year: number): Layer {
    if (this.freshCache.has(year)) return this.freshCache.get(year)!;
    let cv: Layer = null;
    if (this.keyOf(year - 1) !== this.keyOf(year)) {
      const a = this.territoryOf(year - 1);
      const b = this.territoryOf(year);
      cv = this.cellCanvas((i) => {
        if (!b[i] || b[i] === a[i]) return null;
        const c = this.data.civById.get(b[i]!)?.colour ?? [255, 255, 255];
        return [...lighten(c, 40), 255];
      });
    }
    this.freshCache.set(year, cv);
    lru(this.freshCache, 6);
    return cv;
  }
  /** Cells one realm gained in a year, in its colour, for the conquest and founding wipe. */
  private gained(year: number, civId: number): Layer {
    const a = year > 0 ? this.territoryOf(year - 1) : this.blank;
    const b = this.territoryOf(year);
    const col = this.data.civById.get(civId)?.colour ?? [255, 255, 255];
    return this.cellCanvas((i) =>
      b[i] === civId && a[i] !== civId ? [...lighten(col, 25), 200] : null,
    );
  }
  private borders(year: number): Map<number, Path2D> {
    const key = this.keyOf(year);
    const hit = this.borderCache.get(key);
    if (hit) return hit;
    const t = this.territoryOf(year);
    const { W, H, N } = this;
    const paths = new Map<number, Path2D>();
    const add = (v: number, x1: number, y1: number, x2: number, y2: number) => {
      if (!v) return;
      let p = paths.get(v);
      if (!p) paths.set(v, (p = new Path2D()));
      p.moveTo(x1, y1);
      p.lineTo(x2, y2);
    };
    for (let i = 0; i < N; i += 1) {
      const x = i % W;
      const y = (i / W) | 0;
      const v = t[i]!;
      if (x < W - 1 && t[i + 1] !== v) {
        add(v, x + 1, y, x + 1, y + 1);
        add(t[i + 1]!, x + 1, y, x + 1, y + 1);
      }
      if (y < H - 1 && t[i + W] !== v) {
        add(v, x, y + 1, x + 1, y + 1);
        add(t[i + W]!, x, y + 1, x + 1, y + 1);
      }
    }
    this.borderCache.set(key, paths);
    lru(this.borderCache, 6);
    return paths;
  }
  /** The shared border of two realms (the front while they are at war), or null if they do not touch. */
  private front(year: number, a: number, b: number): Path2D | null {
    const key = `${this.keyOf(year)}|${a}|${b}`;
    if (this.frontCache.has(key)) return this.frontCache.get(key)!;
    const t = this.territoryOf(year);
    const { W, N } = this;
    const p = new Path2D();
    let n = 0;
    for (let i = 0; i < N; i += 1) {
      const x = i % W;
      const y = (i / W) | 0;
      const v = t[i]!;
      if (v !== a && v !== b) continue;
      const other = v === a ? b : a;
      if (x < W - 1 && t[i + 1] === other) {
        p.moveTo(x + 1, y);
        p.lineTo(x + 1, y + 1);
        n += 1;
      }
      if (y < this.H - 1 && t[i + W] === other) {
        p.moveTo(x, y + 1);
        p.lineTo(x + 1, y + 1);
        n += 1;
      }
    }
    const out = n ? p : null;
    this.frontCache.set(key, out);
    lru(this.frontCache, 12);
    return out;
  }
  private realms(year: number) {
    const key = this.keyOf(year);
    const hit = this.realmCache.get(key);
    if (hit) return hit;
    const t = this.territoryOf(year);
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (let i = 0; i < this.N; i += 1) {
      const v = t[i]!;
      if (!v) continue;
      let a = acc.get(v);
      if (!a) acc.set(v, (a = { x: 0, y: 0, n: 0 }));
      a.x += i % this.W;
      a.y += (i / this.W) | 0;
      a.n += 1;
    }
    const out = [...acc].map(([id, a]) => ({ id, x: a.x / a.n + 0.5, y: a.y / a.n + 0.5, n: a.n }));
    this.realmCache.set(key, out);
    lru(this.realmCache, 8);
    return out;
  }

  // ---- effects: a shared pool of at most PLAYBACK_POOL sprites; effects wait when it is full

  private liveCost() {
    return this.fx.reduce((n, f) => n + f.cost, 0);
  }
  private addFx(f: Fx) {
    const tag = PLAYBACK_TAGS[f.e.type];
    if (tag) f.tag = this.tagText(f.e, tag);
    if (this.fx.length >= PLAYBACK_MAX_ON_MAP && f.kind !== 'wonder' && !isBig(f.e)) return;
    if (this.liveCost() + f.cost > PLAYBACK_POOL) this.pending.push(f);
    else this.fx.push(f);
  }
  private tagText(e: PlaybackEvent, tag: { text: string; plain?: string }): string {
    const missing = [...tag.text.matchAll(/\{(\w+)/g)].some((m) => e.data[m[1]!] === undefined);
    return missing && tag.plain !== undefined ? tag.plain : fill(tag.text, e.data).trim();
  }
  private lifeFor(base: number) {
    if (this.tier() === 'fast') return base * 0.4;
    return base * Math.max(0.8, Math.min(1.4, Math.sqrt(4 / this.speed)));
  }

  /** Lasting state an event sets (wars, spells, scars), shared by playing and seeking. */
  private note(e: PlaybackEvent) {
    if (e.type === 'war_declared') {
      this.wars.set(text(e.data.war), [text(e.data.civ), text(e.data.enemy)]);
    }
    if (e.type === 'peace_made') this.wars.delete(text(e.data.war));
    if (e.type === 'cold_years_began' || e.type === 'dry_years_began') {
      if (e.place !== null) {
        this.spells.push({
          cell: e.place,
          kind: e.type === 'cold_years_began' ? 'c' : 'd',
          from: e.y,
          until: e.y + (Number(e.data.years) || 5),
        });
      }
    }
    if (e.type === 'site_razed' && e.place !== null) this.scars.push({ cell: e.place, y: e.y });
  }

  private enterYear(y: number, now: number) {
    const list = this.data.eventsByYear.get(y) ?? [];
    const t = this.tier();
    const bigs: PlaybackEvent[] = [];
    for (const e of list) {
      const v = PLAYBACK_EFFECTS[e.type];
      this.note(e);
      if (!v || e.importance < (v.minImportance ?? 0)) continue;
      if (t === 'full' && !this.reduce) this.spawn(e, v, now);
      else if (t === 'fast' && !this.reduce && v.fast && e.importance >= 6) this.spawn(e, v, now);
      if (t !== 'lapse' && (e.importance >= (t === 'fast' ? 9 : 6) || isBig(e))) {
        this.caption(e.y, e.title, v.colour ?? this.colourOf(e));
      }
      if (t === 'lapse' && e.importance >= 10)
        this.caption(e.y, e.title, v.colour ?? this.colourOf(e));
      if (isBig(e)) bigs.push(e);
    }
    if (bigs.length && y > 0 && t === 'full') this.bigEvent(y, bigs, now);
  }

  private spawn(e: PlaybackEvent, v: PlaybackEffect, now: number) {
    if (e.place === null) return;
    const [x, y] = this.cellXY(e.place);
    const f: Fx = {
      kind: v.fx,
      x,
      y,
      col: v.colour ?? this.colourOf(e),
      born: now,
      life: 0,
      cost: PLAYBACK_COST[v.fx],
      e,
    };
    switch (v.fx) {
      case 'shock':
        f.life = this.lifeFor(1600);
        break;
      case 'battle':
        f.life = this.lifeFor(900);
        break;
      case 'wipe': {
        const civ = this.data.civByName.get(text(e.data.civ));
        if (!civ) return;
        f.img = this.gained(e.y, civ.id);
        f.col = civ.colour;
        f.life = this.lifeFor(e.type === 'civ_founded' ? 2000 : 1400);
        f.reach = e.type === 'civ_founded' ? 40 : 18;
        break;
      }
      case 'fire':
        f.life = this.lifeFor(2400);
        break;
      case 'stain': {
        const famine = e.type === 'famine';
        f.life = this.lifeFor(famine ? 1600 : 2000);
        f.r = e.importance >= 6 ? Math.round(2 + e.importance / 3) : 1;
        f.img = this.stainImage(e.place, f.r, f.col, famine);
        this.stains.push({ cell: e.place, y: e.y, img: f.img, r: f.r });
        const from = e.data.from !== undefined ? this.cellOfSite(text(e.data.from)) : null;
        if (from !== null) [f.x2, f.y2] = this.cellXY(from);
        break;
      }
      case 'crown':
        f.life = this.lifeFor(1200);
        f.disputed = e.type === 'succession_disputed';
        break;
      case 'wonder':
        f.life = this.lifeFor(2200) * (isRare(e) ? 1.4 : 1);
        break;
      default:
        f.life = this.lifeFor(1400);
    }
    this.addFx(f);
  }

  /** A stain: land cells near the site, every cell (plague) or every other cell (famine), in a tiny canvas. */
  private stainImage(cell: number, r: number, col: Rgb, hatched: boolean): HTMLCanvasElement {
    const size = 2 * r + 1;
    const img = new ImageData(size, size);
    const cx = cell % this.W;
    const cy = (cell / this.W) | 0;
    const px = this.data.basePixels;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
        if (dx * dx + dy * dy > r * r + r) continue;
        const i = y * this.W + x;
        if (px[i * 4 + 2]! > 150 && px[i * 4]! < 80) continue; // sea and lakes stay clear
        if (hatched && (x + y) % 2) continue;
        if (hash(i) < 0.15) continue;
        img.data.set([...col, 255], ((dy + r) * size + dx + r) * 4);
      }
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d')!.putImageData(img, 0, 0);
    return cv;
  }

  // ---- captions and banners

  private caption(y: number, title: string, colour: Rgb) {
    const feed = this.els.feed;
    const key = `${y}${title}`;
    const lastChild = feed.lastElementChild as HTMLElement | null;
    if (lastChild && lastChild.dataset.k === key) return;
    const div = document.createElement('div');
    div.dataset.k = key;
    div.style.setProperty('--c', rgb(colour));
    const b = document.createElement('b');
    b.textContent = String(y);
    div.append(b, document.createTextNode(title));
    feed.append(div);
    while (feed.children.length > 4) feed.firstElementChild!.remove();
    [...feed.children].forEach((el, k, all) => {
      (el as HTMLElement).style.opacity = String(0.45 + (0.55 * (k + 1)) / all.length);
    });
  }
  private holdMs() {
    return Math.max(1200, 2200 * Math.min(1, Math.sqrt(4 / this.speed)));
  }
  private renderBanner(group: BannerGroup, now: number) {
    const b = this.banner;
    b.shown = group;
    b.since = now;
    const [first, ...rest] = group.items as [PlaybackEvent, ...PlaybackEvent[]];
    const v = PLAYBACK_EFFECTS[first.type];
    const els = this.els;
    els.bannerKind.textContent = rest.length
      ? `Year ${group.y} · ${group.items.length} big events`
      : `Year ${group.y} · ${v?.big ?? v?.label ?? ''}`;
    els.bannerTitle.textContent = first.title;
    els.bannerStory.textContent = storyLine(first);
    els.bannerMore.replaceChildren(
      ...rest
        .slice(0, 3)
        .map((e) => Object.assign(document.createElement('div'), { textContent: e.title })),
    );
    const war = group.items.some((e) => PLAYBACK_RED_TYPES.includes(e.type));
    els.banner.className =
      'hp-banner on' + (war ? ' war' : group.items.some(isRare) ? ' rare' : '');
  }
  private tickBanner(now: number) {
    const b = this.banner;
    if (!b.shown) return;
    const age = now - b.since;
    const stale = this.t - b.shown.y > 6;
    if (age < BANNER_MIN_MS && !stale) return;
    if (b.queue.length) this.renderBanner(b.queue.shift()!, now);
    else if (age > this.holdMs() * (b.shown.items.some(isRare) ? 1.6 : 1) || stale) {
      this.clearBanner();
    }
  }
  private clearBanner() {
    this.banner.shown = null;
    this.banner.queue.length = 0;
    this.els.banner.className = 'hp-banner';
  }
  private bigEvent(y: number, items: PlaybackEvent[], now: number) {
    items.sort((a, b) => Number(isRare(b)) - Number(isRare(a)) || b.importance - a.importance);
    const group = { y, items };
    if (!this.banner.shown) this.renderBanner(group, now);
    else if (this.banner.queue.length < 2) this.banner.queue.push(group);
    if (this.opts.hold) return this.pause();
    // A run of big events gets at most two dips in six years; a rare moment counts as two beats.
    this.chain = y - this.chain.y <= 6 ? { n: this.chain.n + 1, y } : { n: 1, y };
    const rare = items.some(isRare);
    if (this.speed > 2 && (this.chain.n <= 2 || rare)) {
      this.beat = { start: now, hold: this.holdMs() * 0.8 * (rare ? 2 : 1) };
    }
    const top = items[0]!;
    if (this.opts.follow && !this.reduce && top.place !== null) {
      const [x, ey] = this.cellXY(top.place);
      const z = this.camTarget.z > 1.2 ? this.camTarget.z : 1.9;
      // Place the event at about 64% of the height, below the banner.
      this.camTarget = { x, y: ey - (0.14 * this.H) / z, z };
      this.camBackAt = now + 2200 + (rare ? this.holdMs() : 0);
    }
  }
  /** Eased dip: ease down over 300 ms, hold, ease back over 500 ms. */
  private speedNow(now: number) {
    const b = this.beat;
    if (!b) return this.speed;
    const t = now - b.start;
    const slow = Math.min(this.speed, 0.7);
    let f: number;
    if (t < 300) f = ease(t / 300);
    else if (t < 300 + b.hold) f = 1;
    else if (t < 800 + b.hold) f = 1 - ease((t - 300 - b.hold) / 500);
    else {
      this.beat = null;
      return this.speed;
    }
    return this.speed + (slow - this.speed) * f;
  }

  // ---- static layer: wash, borders and realm names for one year at the current camera, cached

  private staticLayer(year: number, scale: number, ox: number, oy: number): HTMLCanvasElement {
    const { C, PX, CSS } = this;
    const key = `${this.keyOf(year)}|${C}|${scale.toFixed(3)}|${ox.toFixed(1)}|${oy.toFixed(1)}`;
    const hit = this.staticCache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = cv.height = C;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const w = this.wash(year);
    if (w) g.drawImage(w, ox, oy, this.W * scale, this.H * scale);
    g.setTransform(scale, 0, 0, scale, ox, oy);
    g.lineCap = 'round';
    const paths = this.borders(year);
    g.strokeStyle = 'rgba(20,24,20,0.78)';
    g.lineWidth = (2.6 * PX) / scale;
    for (const p of paths.values()) g.stroke(p);
    for (const [v, p] of paths) {
      const c = this.data.civById.get(v)?.colour ?? [220, 220, 220];
      g.strokeStyle = rgb(lighten(c as Rgb, 30));
      g.lineWidth = (1.4 * PX) / scale;
      g.stroke(p);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Nation names: the only names on the map; capitals get a double ring instead.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const zr = Math.sqrt(scale / (C / this.W));
    for (const r of this.realms(year)) {
      if (r.n < 60) continue;
      const civ = this.data.civById.get(r.id);
      if (!civ) continue;
      const x = ox + r.x * scale;
      const y = oy + r.y * scale;
      const size = Math.max(
        11 * PX,
        Math.max(13, Math.min(30, 7 + Math.sqrt(r.n) * 0.42)) * zr * PX * Math.max(0.7, CSS / 820),
      );
      g.font = `600 ${size}px Georgia, serif`;
      g.letterSpacing = `${Math.round(size * 0.16)}px`;
      const name = shortRealm(civ.name).toUpperCase();
      g.lineWidth = 3 * PX;
      g.strokeStyle = 'rgba(15,20,16,0.4)';
      g.strokeText(name, x, y);
      g.fillStyle = 'rgba(255,250,235,0.7)';
      g.fillText(name, x, y);
      // The title ("Thanedom of") sits small above the name, so the label reads as a nation.
      const title = realmTitle(civ.name);
      if (title) {
        const ts = size * 0.42;
        g.font = `600 ${ts}px Georgia, serif`;
        g.letterSpacing = `${Math.round(ts * 0.2)}px`;
        g.lineWidth = 2 * PX;
        g.strokeText(title.toUpperCase(), x, y - size * 0.78);
        g.fillText(title.toUpperCase(), x, y - size * 0.78);
      }
    }
    this.staticCache.set(key, cv);
    lru(this.staticCache, 4);
    return cv;
  }

  // ---- trade threads

  private drawTrade(P: Project, u: number) {
    if (!this.opts.trade) return;
    const { ctx, PX } = this;
    const d = Math.floor(this.t / 10) * 10;
    const sites = this.data.sitesAt(d);
    const here = this.data.trade.get(d) ?? [];
    const layers = [
      { rows: here, grow: clamp01(this.t - d), current: true },
      { rows: this.data.trade.get(d - 10) ?? [], grow: 1 - clamp01(this.t - d), current: false },
    ];
    ctx.save();
    ctx.lineCap = 'round';
    for (const { rows, grow, current } of layers) {
      if (grow <= 0.01) continue;
      for (const r of rows) {
        const sa = this.data.sites.get(r.a);
        const sb = this.data.sites.get(r.b);
        if (!sa || !sb) continue;
        const cross = (sites.get(r.a)?.civ ?? 0) !== (sites.get(r.b)?.civ ?? 0);
        const [x1, y1] = P(...this.cellXY(sa.cell));
        const [x2, y2] = P(...this.cellXY(sb.cell));
        const [mx, my] = arcCtrl(x1, y1, x2, y2, 0.12);
        const width = (1.5 + 1.5 * r.w) * u * (cross ? 1.4 : 1);
        // Drawn on from the first site over the decade's first year; the old decade's thread fades.
        const len = Math.hypot(x2 - x1, y2 - y1) * 1.1 + 1;
        const on = current ? grow : 1;
        const alpha = current ? 1 : grow;
        ctx.setLineDash([len * on, len]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.strokeStyle = `rgba(20,24,20,${0.5 * alpha})`;
        ctx.lineWidth = width + 2 * PX;
        ctx.stroke();
        ctx.strokeStyle = cross
          ? `rgba(255,214,110,${(0.6 + 0.4 * r.w) * alpha})`
          : `rgba(255,248,228,${(0.35 + 0.45 * r.w) * alpha})`;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---- drawing

  private draw(now: number) {
    const { ctx, C, PX, W, H, data } = this;
    const year = Math.floor(this.t);
    const frac = this.t - year;
    const cam = this.cam;
    const scale = (C / W) * cam.z;
    const ox = C / 2 - cam.x * scale;
    const oy = C / 2 - cam.y * scale;
    const P: Project = (x, y) => [ox + x * scale, oy + y * scale];
    const u = this.unit();
    const lapse = this.tier() === 'lapse';
    const more = year < this.last;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d3f6e';
    ctx.fillRect(0, 0, C, C);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, ox, oy, W * scale, H * scale);
    if (more || this.phase === 'playing') {
      ctx.fillStyle = this.isDark() ? 'rgba(4,8,6,0.26)' : 'rgba(22,30,25,0.16)';
      ctx.fillRect(0, 0, C, C);
    }
    // Seasons: a faint cool-warm tint once a year, only at 2 years a second or slower.
    if (this.speed <= 2 && this.phase === 'playing' && !this.reduce) {
      const s = Math.cos(frac * TAU);
      ctx.fillStyle = s > 0 ? `rgba(150,190,255,${0.03 * s})` : `rgba(255,200,120,${-0.03 * s})`;
      ctx.fillRect(0, 0, C, C);
    }
    // Cold and dry spells: a haze while they last.
    for (const sp of this.spells) {
      if (year < sp.from || year > sp.until) continue;
      const [x, y] = P(...this.cellXY(sp.cell));
      const r = 26 * scale;
      const c = sp.kind === 'c' ? C_COLD : C_DRY;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgb(c, 0.3));
      g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // Wash, borders and nation names: this year's layer cross-fading into next year's. Years whose
    // borders did not move share one layer.
    const moves = more && data.borderYear(year) !== data.borderYear(year + 1);
    if (lapse) {
      ctx.drawImage(this.staticLayer(year, scale, ox, oy), 0, 0);
      const fr = more ? this.fresh(year + 1) : null;
      if (fr) {
        ctx.globalAlpha = 0.45;
        ctx.drawImage(fr, ox, oy, W * scale, H * scale);
      }
    } else {
      ctx.globalAlpha = 1 - (moves ? frac : 0);
      ctx.drawImage(this.staticLayer(year, scale, ox, oy), 0, 0);
      if (moves && frac > 0) {
        ctx.globalAlpha = frac;
        ctx.drawImage(this.staticLayer(year + 1, scale, ox, oy), 0, 0);
      }
      const fr = more ? this.fresh(year + 1) : null;
      if (fr && !this.reduce) {
        ctx.globalAlpha = Math.sin(Math.PI * frac) * 0.35;
        ctx.drawImage(fr, ox, oy, W * scale, H * scale);
      }
    }
    ctx.globalAlpha = 1;
    // Stains of plague and famine linger one year, then fade.
    for (const st of this.stains) {
      const age = this.t - st.y;
      if (age < 0 || age > 2) continue;
      const [x, y] = P(...this.cellXY(st.cell));
      ctx.globalAlpha = 0.28 * (age < 1 ? 1 : 2 - age);
      ctx.drawImage(
        st.img,
        x - (st.r + 0.5) * scale,
        y - (st.r + 0.5) * scale,
        (2 * st.r + 1) * scale,
        (2 * st.r + 1) * scale,
      );
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    // Scars of razed sites: soot that fades over twelve years of playback.
    for (const sc of this.scars) {
      const age = this.t - sc.y;
      if (age < 0 || age > 12) continue;
      const [x, y] = P(...this.cellXY(sc.cell));
      const r = 12 * u;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(20,14,10,${0.5 * (1 - age / 12)})`);
      g.addColorStop(1, 'rgba(20,14,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    this.drawTrade(P, u);
    // Wars: the shared border becomes a red dashed front; realms that do not touch get the capital arc.
    for (const [civA, civB] of this.wars.values()) {
      const a = data.civByName.get(civA);
      const b = data.civByName.get(civB);
      const fp = a && b ? this.front(year, a.id, b.id) : null;
      ctx.save();
      if (fp) {
        ctx.setTransform(scale, 0, 0, scale, ox, oy);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(20,10,10,0.7)';
        ctx.lineWidth = (5 * PX) / scale;
        ctx.stroke(fp);
        ctx.setLineDash([(6 * PX) / scale, (4 * PX) / scale]);
        ctx.strokeStyle = rgb(C_WAR, 0.85);
        ctx.lineWidth = (3 * PX) / scale;
        ctx.stroke(fp);
      } else {
        const ca = this.capitalCell(civA, year);
        const cb = this.capitalCell(civB, year);
        if (ca === null || cb === null) {
          ctx.restore();
          continue;
        }
        const [x1, y1] = P(...this.cellXY(ca));
        const [x2, y2] = P(...this.cellXY(cb));
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.18;
        ctx.strokeStyle = rgb(C_WAR, 0.85);
        ctx.lineWidth = 2.5 * u;
        ctx.setLineDash([10 * u, 7 * u]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.translate((x1 + 2 * mx + x2) / 4, (y1 + 2 * my + y2) / 4);
        ctx.scale(u, u);
        this.swords(0, 0, 9, rgb(C_WAR));
      }
      ctx.restore();
    }
    this.drawSites(year, frac, P);
    // Effects, with a dark underlay in light mode so they read on sand and snow.
    this.fx = this.fx.filter((f) => now - f.born < f.life);
    while (this.pending.length && this.liveCost() + this.pending[0]!.cost <= PLAYBACK_POOL) {
      const f = this.pending.shift()!;
      f.born = now;
      this.fx.push(f);
    }
    const light = !this.isDark();
    for (const f of this.fx) this.drawFx(f, (now - f.born) / f.life, P, u, light);
    for (const f of this.fx) this.drawTag(f, (now - f.born) / f.life, P, u);
  }

  /** Sites: dots that swell with their people. Capitals: a double ring instead of a name. */
  private drawSites(year: number, frac: number, P: Project) {
    const { ctx, PX, CSS, data } = this;
    const more = year < this.last;
    const A = data.sitesAt(year);
    const B = more ? data.sitesAt(year + 1) : A;
    const seats = new Set(data.seatsAt(year).values());
    const zr = Math.sqrt(this.cam.z);
    const G = PX * 0.8 * Math.max(0.62, Math.min(1, CSS / 820));
    for (const id of new Set([...A.keys(), ...B.keys()])) {
      const s = data.sites.get(id);
      if (!s) continue;
      const a = A.get(id);
      const b = B.get(id) ?? a;
      const cur = (a ?? b)!;
      const pop = (a ? a.pop : 0) * (1 - frac) + (b ? b.pop : 0) * frac;
      const appear = a ? 1 : frac;
      const [x, y] = P(...this.cellXY(s.cell));
      if (cur.ruined || (b && b.ruined && frac > 0.5)) {
        const rr = Math.max(2 * PX, 4 * zr * G);
        ctx.strokeStyle = 'rgba(30,30,30,0.85)';
        ctx.lineWidth = 3 * PX;
        this.cross(x, y, rr);
        ctx.strokeStyle = 'rgba(210,205,195,0.95)';
        ctx.lineWidth = 1.6 * PX;
        this.cross(x, y, rr);
        continue;
      }
      const col = data.civById.get((frac > 0.5 ? b : a)?.civ ?? cur.civ)?.colour ?? [220, 220, 220];
      const r = Math.max(1.5 * PX, (2.2 + Math.sqrt(pop) * 0.42) * zr * G) * (0.4 + 0.6 * appear);
      ctx.globalAlpha = appear;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = rgb(col);
      ctx.fill();
      ctx.lineWidth = Math.max(0.75 * PX, 1.5 * G);
      ctx.strokeStyle = 'rgba(20,24,20,0.9)';
      ctx.stroke();
      if (seats.has(id)) {
        const rings: [number, number, string][] = [
          [2.5, 3, 'rgba(20,24,20,0.85)'],
          [2.5, 1.4, 'rgba(255,240,200,0.95)'],
          [6, 3, 'rgba(20,24,20,0.85)'],
          [6, 1.4, 'rgba(255,240,200,0.95)'],
        ];
        for (const [gap, w, c] of rings) {
          ctx.beginPath();
          ctx.arc(x, y, r + gap * Math.max(PX, G), 0, TAU);
          ctx.strokeStyle = c;
          ctx.lineWidth = w * Math.max(0.7 * PX, G * 0.8);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private cross(x: number, y: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x - r, y - r);
    c.lineTo(x + r, y + r);
    c.moveTo(x + r, y - r);
    c.lineTo(x - r, y + r);
    c.stroke();
  }
  private swords(x: number, y: number, r: number, col: string) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = 'rgba(20,10,10,0.8)';
    c.lineWidth = 4.5;
    this.cross(x, y, r);
    c.strokeStyle = col;
    c.lineWidth = 2.2;
    this.cross(x, y, r);
    c.restore();
  }
  private star(x: number, y: number, r: number, n = 5) {
    const c = this.ctx;
    c.beginPath();
    for (let k = 0; k < n * 2; k += 1) {
      const rr = k % 2 ? r * 0.42 : r;
      const a = (k * Math.PI) / n - Math.PI / 2;
      c.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    c.closePath();
  }
  private crownGlyph(x: number, y: number, r: number, col: string) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x - r, y + r * 0.6);
    c.lineTo(x - r, y - r * 0.3);
    c.lineTo(x - r * 0.5, y + r * 0.1);
    c.lineTo(x, y - r * 0.6);
    c.lineTo(x + r * 0.5, y + r * 0.1);
    c.lineTo(x + r, y - r * 0.3);
    c.lineTo(x + r, y + r * 0.6);
    c.closePath();
    c.fillStyle = col;
    c.strokeStyle = 'rgba(30,20,0,0.85)';
    c.lineWidth = 1.5;
    c.fill();
    c.stroke();
  }
  private ring(x: number, y: number, r: number, col: string, w: number) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.1, r), 0, TAU);
    c.strokeStyle = col;
    c.lineWidth = w;
    c.stroke();
  }
  private label(words: string, x: number, y: number, col: string) {
    const c = this.ctx;
    c.font = '600 12px Georgia, serif';
    c.textAlign = 'center';
    c.lineWidth = 3.5;
    c.strokeStyle = 'rgba(15,20,16,0.85)';
    c.strokeText(words, x, y);
    c.fillStyle = col;
    c.fillText(words, x, y);
  }

  /**
   * Each effect draws in u units around its anchor; other map points are mapped into that frame.
   * Grammar: conflict is red and sharp and marches; disaster is green or amber and creeps cell by
   * cell; growth is the realm colour and swells; wonder is pale gold and rises.
   */
  private drawFx(f: Fx, p: number, Pw: Project, u: number, light: boolean) {
    const ctx = this.ctx;
    const [x, y] = Pw(f.x, f.y);
    const fade = 1 - p;
    ctx.save();
    if (light) {
      ctx.shadowColor = 'rgba(20,24,20,0.65)';
      ctx.shadowBlur = 3 * this.PX;
    }
    if (f.kind === 'wipe' || f.kind === 'stain') {
      this.drawCells(f, p, Pw, u, x, y, fade);
      ctx.restore();
      return;
    }
    ctx.translate(x, y);
    ctx.scale(u, u);
    ctx.translate(-x, -y);
    switch (f.kind) {
      case 'shock': {
        this.ring(x, y, 8 + ease(p) * 80, rgb(f.col, fade * 0.9), 4 * fade + 1);
        this.ring(x, y, 4 + ease(Math.min(1, p * 1.6)) * 40, rgb(f.col, fade * 0.6), 2);
        this.swords(x, y, 12 + 3 * Math.sin(p * 14), rgb(f.col));
        break;
      }
      case 'battle': {
        if (p < 0.12) {
          ctx.fillStyle = `rgba(255,240,220,${1 - p / 0.12})`;
          this.star(x, y, 12 + p * 80, 8);
          ctx.fill();
        }
        this.swords(x, y, 9, rgb(f.col, Math.min(1, fade * 1.8)));
        break;
      }
      case 'peace': {
        this.ring(x, y, 6 + ease(p) * 50, rgb(f.col, fade * 0.8), 2);
        this.ring(x, y, 3 + ease(p) * 26, rgb(f.col, fade * 0.8), 2);
        break;
      }
      case 'fire': {
        if (p < 0.05) {
          ctx.fillStyle = `rgba(255,245,220,${1 - p / 0.05})`;
          ctx.beginPath();
          ctx.arc(x, y, 30, 0, TAU);
          ctx.fill();
        }
        const fireF = clamp01(1 - (p - 0.05) / 0.45);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 40);
        g.addColorStop(0, `rgba(255,190,90,${0.85 * fireF})`);
        g.addColorStop(0.5, `rgba(230,70,20,${0.45 * fireF})`);
        g.addColorStop(1, 'rgba(120,20,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 40, y - 40, 80, 80);
        if (this.tier() === 'full') {
          ctx.fillStyle = `rgba(40,36,34,${0.4 * fade})`;
          for (let k = 0; k < 5; k += 1) {
            ctx.beginPath();
            ctx.arc(
              x + Math.sin(p * 5 + k) * 6 + p * 10 * k,
              y - 18 - k * 14 - p * 26,
              7 + k * 4 + p * 6,
              0,
              TAU,
            );
            ctx.fill();
          }
        }
        break;
      }
      case 'crown': {
        const q = Math.min(1, p / 0.5);
        const rock = f.disputed ? Math.sin(p * 4 * Math.PI) * 0.26 * fade : 0;
        ctx.save();
        ctx.translate(x, y - 16 - 10 * ease(q) + 6 * Math.max(0, p - 0.5));
        ctx.rotate(rock);
        this.crownGlyph(0, 0, 9, rgb(f.col, Math.min(1, fade * 2)));
        ctx.restore();
        if (p > 0.4) this.ring(x, y, 36 * ease((p - 0.4) / 0.6), rgb(f.col, fade * 1.5), 2.5);
        if (f.disputed && p > 0.5) {
          this.ring(x, y, 26 * ease((p - 0.5) / 0.5), rgb(f.col, fade * 1.5), 2);
        }
        break;
      }
      case 'wonder': {
        const rare = isRare(f.e);
        ctx.shadowColor = rgb(f.col);
        ctx.shadowBlur = 18 * this.PX;
        ctx.fillStyle = rgb(f.col, fade);
        this.star(x, y, 8 + Math.sin(Math.min(1, p * 2) * Math.PI) * 16);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (rare) this.ring(x, y, 10 + ease(p) * 60, rgb(f.col, fade * 0.7), 2);
        if (rare && p > 0.15) {
          const d = f.e.data;
          const name = text(d.name ?? d.item ?? d.hero);
          this.label(name, x, y + 26, rgb(f.col, Math.min(1, fade * 2)));
        }
        break;
      }
    }
    ctx.restore();
  }

  /** The few words beside an effect, so every mark says what it is. */
  private drawTag(f: Fx, p: number, P: Project, u: number) {
    if (!f.tag || p < 0.08 || p > 1) return;
    const ctx = this.ctx;
    const [x, y] = P(f.x, f.y);
    const a = Math.min(1, (1 - p) * 3);
    ctx.save();
    ctx.font = `600 ${Math.round(12 * u)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5 * u;
    ctx.strokeStyle = `rgba(15,20,16,${0.85 * a})`;
    ctx.fillStyle = `rgba(255,250,235,${a})`;
    ctx.strokeText(f.tag, x, y + 24 * u);
    ctx.fillText(f.tag, x, y + 24 * u);
    ctx.restore();
  }

  /** Wipes (conquest, founding) and stains (plague, famine) are cell images revealed in a growing circle. */
  private drawCells(f: Fx, p: number, Pw: Project, u: number, x: number, y: number, fade: number) {
    const ctx = this.ctx;
    const [ox, oy] = Pw(0, 0);
    const [ex] = Pw(1, 0);
    const cell = ex - ox;
    ctx.imageSmoothingEnabled = false;
    if (f.kind === 'wipe') {
      if (!f.img) return;
      const r = ease(Math.min(1, p / 0.45)) * (f.reach ?? 18) * cell;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, r), 0, TAU);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, fade * 2) * 0.9;
      ctx.drawImage(f.img, ox, oy, this.W * cell, this.H * cell);
      ctx.restore();
      // the leading edge glows
      if (p < 0.5) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, r), 0, TAU);
        ctx.arc(x, y, Math.max(0.5, r - 3 * cell), 0, TAU, true);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(f.img, ox, oy, this.W * cell, this.H * cell);
        ctx.restore();
      }
      if (f.e.type === 'civ_founded' && this.tier() === 'full') {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(u, u);
        this.ring(0, 0, 10 + ease(p) * 50, rgb(C_GOLD, fade), 3);
        this.crownGlyph(0, -22 - p * 8, 9, rgb(C_GOLD, Math.min(1, fade * 1.6)));
        ctx.restore();
      }
      return;
    }
    // stain: one ring of cells per 250 ms (at 4 a second), peak alpha .45, then fade
    const fr = f.r ?? 1;
    const rings = this.tier() === 'fast' ? 1 : fr;
    const rr = Math.min(rings, 0.5 + (p * f.life) / 250);
    const alpha = 0.45 * (p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6);
    if (f.x2 !== undefined && f.y2 !== undefined && this.tier() === 'full') {
      const [x0, y0] = Pw(f.x2, f.y2);
      const q = ease(Math.min(1, p * 2.5));
      ctx.save();
      ctx.setLineDash([2 * u, 5 * u]);
      ctx.strokeStyle = rgb(f.col, 0.8 * fade);
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (x - x0) * q, y0 + (y - y0) * q);
      ctx.stroke();
      ctx.restore();
    }
    if (!f.img) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, (rr + 0.5) * cell, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      f.img,
      x - (fr + 0.5) * cell,
      y - (fr + 0.5) * cell,
      (2 * fr + 1) * cell,
      (2 * fr + 1) * cell,
    );
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(u, u);
    this.ring(0, 0, 6 + ease(p) * 10, rgb(f.col, fade), 2);
    ctx.restore();
  }

  // ---- HUD

  private hud() {
    const y = Math.floor(this.t);
    const els = this.els;
    const label = `Year ${y}`;
    if (els.bigYear.textContent !== label) els.bigYear.textContent = label;
    if (els.yearLabel.textContent !== label) els.yearLabel.textContent = label;
    els.range.value = String(y);
    if (y !== this.hudYear) {
      this.hudYear = y;
      const c = census(this.data, y);
      const war = this.wars.size ? `${this.wars.size} at war` : 'at peace';
      els.census.textContent = `${c.realms} realms · ${c.settlements} settlements · ${c.people.toLocaleString('en-GB')} people · ${war}`;
    }
    this.pushState();
  }

  // ---- clock

  private readonly frame = (now: number) => {
    if (this.dead) return;
    const dt = Math.max(0, Math.min(MAX_FRAME_MS, now - this.prev)) / 1000;
    this.prev = now;
    if (this.phase === 'playing') {
      const before = Math.floor(this.t);
      this.t = Math.min(this.last, this.t + dt * this.speedNow(now));
      for (let y = before + 1; y <= Math.floor(this.t); y += 1) {
        this.enterYear(y, now);
        if (this.phase !== 'playing') {
          this.t = y;
          break;
        }
      }
      if (this.t >= this.last) {
        this.t = this.last;
        this.phase = 'paused';
        this.showEnd();
      }
    }
    this.tickBanner(now);
    if (this.camBackAt && now > this.camBackAt) {
      this.camTarget = { x: this.W / 2, y: this.H / 2, z: 1 };
      this.camBackAt = 0;
    }
    // Pans are speed-limited to about a third of the map width a second, so a re-target travels.
    const cam = this.cam;
    if (this.reduce) Object.assign(cam, this.camTarget);
    else {
      const k = 1 - Math.pow(0.03, dt);
      const maxStep = ((0.35 * this.W) / cam.z) * dt;
      let dx = (this.camTarget.x - cam.x) * k;
      let dy = (this.camTarget.y - cam.y) * k;
      const d = Math.hypot(dx, dy);
      if (d > maxStep && d > 0) {
        dx *= maxStep / d;
        dy *= maxStep / d;
      }
      cam.x += dx;
      cam.y += dy;
      cam.z += (this.camTarget.z - cam.z) * k;
    }
    const half = this.W / 2 / cam.z;
    cam.x = Math.max(half, Math.min(this.W - half, cam.x));
    cam.y = Math.max(half, Math.min(this.H - half, cam.y));
    this.draw(now);
    this.hud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private showEnd() {
    this.ended = true;
    this.pushState();
  }

  /** Year 0: the founding captions and wipes. */
  private opening(now: number) {
    this.enterYear(0, now);
    this.caption(0, `${this.data.civs.length} peoples settle the land.`, C_GOLD);
  }

  /** A jump rebuilds lasting state (wars, spells, scars, stains) and the captions for that year. */
  private seek(year: number) {
    const to = Math.max(0, Math.min(this.last, Math.floor(year)));
    this.ended = false;
    this.els.feed.replaceChildren();
    this.t = to;
    this.wars.clear();
    this.spells = [];
    this.scars = [];
    this.stains = [];
    this.fx = [];
    this.pending = [];
    this.beat = null;
    this.chain = { n: 0, y: -99 };
    this.hudYear = -1;
    for (let y = 0; y <= to; y += 1)
      for (const e of this.data.eventsByYear.get(y) ?? []) this.note(e);
    this.camTarget = { x: this.W / 2, y: this.H / 2, z: 1 };
    this.clearBanner();
    for (const e of this.data.eventsByYear.get(to) ?? []) {
      const v = PLAYBACK_EFFECTS[e.type];
      if (e.importance >= 6 && v) this.caption(e.y, e.title, v.colour ?? this.colourOf(e));
    }
    this.pushState();
  }

  // ---- realm strip: each realm's share of all people, one column per year

  private drawStrip() {
    const cv = this.els.strip;
    const c = cv.getContext('2d')!;
    const colW = cv.width / (this.last + 1);
    for (let y = 0; y <= this.last; y += 1) {
      const by = new Map<number, number>();
      let total = 0;
      for (const s of this.data.sitesAt(y).values()) {
        if (s.ruined) continue;
        by.set(s.civ, (by.get(s.civ) ?? 0) + s.pop);
        total += s.pop;
      }
      let at = 0;
      for (const civ of this.data.civs) {
        const h = ((by.get(civ.id) ?? 0) / (total || 1)) * cv.height;
        c.fillStyle = rgb(civ.colour);
        c.fillRect(y * colW, at, colW + 0.6, h);
        at += h;
      }
    }
  }

  // ---- hover: a site's name, realm and people in the year shown

  private readonly onLeave = () => {
    this.els.tip.hidden = true;
  };
  private readonly onMove = (ev: MouseEvent) => {
    const { els, data, C, PX } = this;
    const box = els.canvas.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * C;
    const py = ((ev.clientY - box.top) / box.height) * C;
    const scale = (C / this.W) * this.cam.z;
    const wx = this.cam.x + (px - C / 2) / scale;
    const wy = this.cam.y + (py - C / 2) / scale;
    const year = Math.floor(this.t);
    let best: { id: Id; civ: number; pop: number; ruined: boolean } | null = null;
    let bd = (14 * PX) / scale;
    for (const [id, st] of data.sitesAt(year)) {
      const s = data.sites.get(id);
      if (!s) continue;
      const [sx, sy] = this.cellXY(s.cell);
      const d = Math.hypot(sx - wx, sy - wy);
      if (d < bd) {
        bd = d;
        best = { id, ...st };
      }
    }
    const tip = els.tip;
    if (!best) {
      tip.hidden = true;
      return;
    }
    const s = data.sites.get(best.id)!;
    const civ = data.civById.get(best.civ);
    const seat = [...data.seatsAt(year).values()].includes(best.id);
    const kind = s.kind.charAt(0).toUpperCase() + s.kind.slice(1);
    const name = document.createElement('b');
    name.textContent = s.name + (seat ? ' · capital' : '');
    const line = document.createElement('div');
    line.textContent = best.ruined
      ? 'Ruin'
      : `${kind} · ${civ ? shortRealm(civ.name) : 'no realm'} · ${best.pop.toLocaleString('en-GB')} people`;
    tip.replaceChildren(name, line);
    tip.hidden = false;
    const sb = els.stage.getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX - sb.left + 12, sb.width - tip.offsetWidth - 8)}px`;
    tip.style.top = `${ev.clientY - sb.top + 12}px`;
  };
}
