// The Town room's scene model: pure functions over the watched site's buildings and people. It
// decides which buildings carry a name, who shares a room, where the picture is framed and how a
// dot eases between two tiles. The drawing (TownRoom.tsx) only paints what this returns, and the
// words come from the engine's own data: nothing here is written for the room.

import type { Building, Id, SimEvent } from '../../engine';

/** Buildings that are drawn plain, with no name: homes and walls. Fields are named once per cluster. */
const UNNAMED = new Set(['home', 'field', 'wall']);

/** A building as the town drawing sees it. */
export interface TownBuilding {
  id: Id;
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The name written on it, or null for the plain ones (homes, fields, walls). */
  label: string | null;
  /** False for the homes of counted (unfollowed) households. */
  followed: boolean;
  /** Being raised, burnt down or neither. */
  state: 'built' | 'raising' | 'burnt';
}

/** A culture's hall is the jarl's hall where the ruler is a jarl; every other name is the content's. */
export function placeName(
  buildings: readonly { id: string; name: string }[],
  defId: string,
  jarl: boolean,
): string {
  const name = buildings.find((d) => d.id === defId)?.name ?? defId;
  const text = defId === 'hall' && jarl ? "jarl's hall" : name;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whether a building with this definition id carries a name on the drawing. */
export function isLabelled(defId: string): boolean {
  return !UNNAMED.has(defId);
}

/** Every building of the site as the drawing sees it, in id order. */
export function townBuildings(
  buildings: Iterable<Building>,
  defs: readonly { id: string; name: string }[],
  jarl: boolean,
): TownBuilding[] {
  const list: TownBuilding[] = [];
  for (const b of buildings) {
    list.push({
      id: b.id,
      defId: b.defId,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      label:
        isLabelled(b.defId) && b.progress === undefined ? placeName(defs, b.defId, jarl) : null,
      followed: b.followed,
      state: b.burnt ? 'burnt' : b.progress !== undefined ? 'raising' : 'built',
    });
  }
  return list.sort((a, b) => a.id - b.id);
}

/** The picture's frame, in tiles: every building with a margin, kept inside the map. */
export function frameOf(
  buildings: readonly Pick<TownBuilding, 'x' | 'y' | 'w' | 'h'>[],
  size: number,
  margin: number,
): { x: number; y: number; w: number; h: number } {
  if (buildings.length === 0) return { x: 0, y: 0, w: size, h: size };
  const x0 = Math.max(0, Math.min(...buildings.map((b) => b.x)) - margin);
  const y0 = Math.max(0, Math.min(...buildings.map((b) => b.y)) - margin);
  const x1 = Math.min(size, Math.max(...buildings.map((b) => b.x + b.w)) + margin);
  const y1 = Math.min(size, Math.max(...buildings.map((b) => b.y + b.h)) + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** What the room needs to know about one resident: where they are and which building they are in. */
export interface Resident {
  id: Id;
  /** Tile coordinates. */
  pos: readonly [number, number] | undefined;
  /** The building of the last block, or null when they were outdoors. */
  placeId: Id | null | undefined;
}

/** The building a resident is in: the engine's place, else the building whose footprint holds them. */
export function buildingOf(
  r: Resident,
  buildings: readonly TownBuilding[],
): TownBuilding | undefined {
  if (r.placeId != null) {
    const found = buildings.find((b) => b.id === r.placeId);
    if (found) return found;
  }
  if (!r.pos) return undefined;
  const [x, y] = r.pos;
  // Walkable ground between buildings is outdoors; a field counts as a place only by the engine.
  return buildings.find(
    (b) => b.defId !== 'field' && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h,
  );
}

/** Tiles within which two people outdoors count as "nearby". */
export const NEARBY_TILES = 4;

/**
 * The people who share a room with `id`: the others in the same building, or, when they are
 * outdoors, the others outdoors within `NEARBY_TILES`. `building` is null for the outdoor case.
 */
export function sharedRoom(
  residents: readonly Resident[],
  buildings: readonly TownBuilding[],
  id: Id,
): { building: TownBuilding | null; ids: Id[] } {
  const me = residents.find((r) => r.id === id);
  if (!me) return { building: null, ids: [] };
  const mine = buildingOf(me, buildings);
  const ids: Id[] = [];
  for (const r of residents) {
    if (r.id === id) continue;
    const there = buildingOf(r, buildings);
    if (mine) {
      if (there?.id === mine.id) ids.push(r.id);
    } else if (!there && me.pos && r.pos) {
      if (Math.max(Math.abs(me.pos[0] - r.pos[0]), Math.abs(me.pos[1] - r.pos[1])) <= NEARBY_TILES)
        ids.push(r.id);
    }
  }
  return { building: mine ?? null, ids: ids.sort((a, b) => a - b) };
}

/** Who to follow when no one is named: the ruler if they live here, else the first resident. */
export function defaultFollow(residents: readonly Id[], rulerId: Id | null | undefined): Id | null {
  if (rulerId != null && residents.includes(rulerId)) return rulerId;
  return residents[0] ?? null;
}

// ---- easing ----

/** Smooth in and out between 0 and 1. */
export function ease(t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** A dot's journey between two points over `duration` ms starting at `start` ms. */
export interface Glide {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  start: number;
  duration: number;
  /** The route walked, as tile-centre points from `fx, fy` to `tx, ty`; absent for a straight glide. */
  path?: readonly (readonly [number, number])[] | undefined;
  /** At fast speeds the dot dims where it was and returns where it is going, instead of racing there. */
  fade?: boolean | undefined;
}

/** The point a share `t` (0-1) of the way along a polyline, by length. */
export function alongPath(
  path: readonly (readonly [number, number])[],
  t: number,
): { x: number; y: number } {
  const first = path[0]!;
  if (path.length < 2 || t <= 0) return { x: first[0], y: first[1] };
  const last = path[path.length - 1]!;
  if (t >= 1) return { x: last[0], y: last[1] };
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  }
  if (total === 0) return { x: last[0], y: last[1] };
  let left = t * total;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len) {
      const u = len === 0 ? 0 : left / len;
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u };
    }
    left -= len;
  }
  return { x: last[0], y: last[1] };
}

/** Where the dot is at time `now`: eased along its route, never jumping past the end. */
export function glideAt(g: Glide, now: number): { x: number; y: number } {
  if (g.duration <= 0) return { x: g.tx, y: g.ty };
  if (g.fade) return now - g.start < g.duration / 2 ? { x: g.fx, y: g.fy } : { x: g.tx, y: g.ty };
  const t = ease((now - g.start) / g.duration);
  if (g.path && g.path.length >= 2) return alongPath(g.path, t);
  return { x: g.fx + (g.tx - g.fx) * t, y: g.fy + (g.ty - g.fy) * t };
}

/** How solid a dot is drawn: 1, except for a fading dot, which dims half way and comes back. */
export function glideAlpha(g: Glide, now: number): number {
  if (!g.fade || g.duration <= 0) return 1;
  const t = Math.max(0, Math.min(1, (now - g.start) / g.duration));
  return 0.2 + 0.8 * Math.abs(2 * t - 1);
}

/** The length of a route in tiles. */
export function pathLength(path: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  }
  return total;
}

/** Whether the glide has reached its end by `now`. */
export const glideDone = (g: Glide, now: number): boolean => now - g.start >= g.duration;

// ---- tales told here ----

/**
 * The recent world events that reached a town, newest first: events the legend index files under
 * the town, important enough to be told, and from before the watch began (the live chronicle has
 * its own lines). `limit` caps the list.
 */
export function recentTales(
  ids: readonly Id[],
  eventOf: (id: Id) => SimEvent | undefined,
  before: number,
  minImportance: number,
  limit: number,
): SimEvent[] {
  const found: SimEvent[] = [];
  for (const id of ids) {
    const event = eventOf(id);
    if (event && event.day < before && event.importance >= minImportance) found.push(event);
  }
  return found.sort((a, b) => b.day - a.day || b.id - a.id).slice(0, limit);
}

// ---- time of day ----

/** The tint laid over the ground for a block of the day: none by day, blue at night, warm at dusk. */
export const BLOCK_TINT: Record<string, string | null> = {
  night: 'rgba(40, 52, 90, 0.26)',
  morning: 'rgba(255, 236, 190, 0.1)',
  afternoon: null,
  evening: 'rgba(196, 112, 58, 0.12)',
};

// ---- counts ----

/**
 * The header's people line. `total` is the town's people by the world's record and `drawn` the
 * simulated residents on the map; the town has at least as many people as it draws, so a count
 * can never promise more people to follow than there are.
 */
export function peopleLine(
  total: number,
  drawn: number,
): { people: number; followed: number; all: boolean } {
  const followed = Math.max(0, Math.round(drawn));
  const people = Math.max(Math.round(total), followed);
  return { people, followed, all: followed >= people };
}

// ---- pace and stagger ----

/** Days a second at or above which dots fade between places instead of walking. */
export const FADE_FROM_SPEED = 4;
/** The fastest a dot may walk on the screen, in pixels a second. */
export const MAX_WALK_PX_S = 200;
/** The slowest and fastest a walk takes at the slow speeds (ms). */
const GLIDE_MIN_MS = 260;
const GLIDE_MAX_MS = 1400;

/** How long one block of the day lasts on the screen at a speed, in ms (four blocks a day). */
export function blockMs(speed: number): number {
  return speed > 0 ? 250 / speed : 250;
}

/**
 * How dots move at a speed: the walk's base time, the span over which people leave for their next
 * place (each after a personal delay), and whether to fade instead of walk. People spread across
 * part of a block so no one moves on the beat; at fast speeds there is no room, so they fade.
 */
export function pacing(speed: number): { glideMs: number; spreadMs: number; fade: boolean } {
  if (speed >= FADE_FROM_SPEED) return { glideMs: 240, spreadMs: 0, fade: true };
  if (speed <= 0) return { glideMs: GLIDE_MIN_MS, spreadMs: 0, fade: false };
  const block = blockMs(speed);
  return {
    glideMs: Math.max(GLIDE_MIN_MS, Math.min(GLIDE_MAX_MS, block * 0.45)),
    spreadMs: block * 0.4,
    fade: false,
  };
}

/** A steady number from 0 up to but not including 1 for an id. */
export function unitHash(id: number): number {
  let h = Math.imul(id | 0, 0x9e3779b1) ^ 0x85ebca6b;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The engine's latest leave time, as a share of the block (content `routines.leave.max`). */
const LEAVE_SHARE_MAX = 0.75;

/**
 * How long after the block's beat a person sets off, in ms. With the engine's own leave time
 * (`leaveAt`, a share of the block, 0 to 0.75) it is that share of `spreadMs`; without it, a share
 * from their id.
 */
export function leaveDelay(id: number, spreadMs: number, leaveAt?: number): number {
  if (leaveAt === undefined) return Math.round(unitHash(id) * spreadMs);
  return Math.round(Math.min(1, Math.max(0, leaveAt / LEAVE_SHARE_MAX)) * spreadMs);
}

/** A walk's duration: at least the base time, and long enough that the dot never exceeds the speed cap. */
export function walkMs(baseMs: number, tiles: number, pixelsPerTile: number): number {
  return Math.max(baseMs, (tiles * pixelsPerTile * 1000) / MAX_WALK_PX_S);
}

// ---- crowds ----

/** A house with more people than this draws a count instead of their dots. */
export const CROWD_OVER = 3;

/** The buildings holding more than `CROWD_OVER` of the given (arrived) people, with their counts. */
export function crowds(inside: readonly (Id | null)[]): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const b of inside) if (b !== null) counts.set(b, (counts.get(b) ?? 0) + 1);
  for (const [b, n] of [...counts]) if (n <= CROWD_OVER) counts.delete(b);
  return counts;
}

// ---- labels ----

/** A box on the screen, in pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether two boxes overlap (touching edges do not count). */
export const boxesHit = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Label order: the hall first, then the alehouse, inn, shrine and mine head, then the rest. */
const LABEL_FIRST = ['hall', 'alehouse', 'inn', 'shrine', 'mine'];

/** The rank of a building's name when two would overlap: lower is placed first. */
export function labelRank(defId: string): number {
  const i = LABEL_FIRST.indexOf(defId);
  return i === -1 ? LABEL_FIRST.length : i;
}

export interface LabelAsk extends Box {
  key: Id | string;
  rank: number;
}

/**
 * One pass over the labels in rank order (ties by order given): a label is kept unless its box
 * hits one already kept. Returns the keys kept, in the order they were placed, and the keys skipped.
 */
export function placeLabels(asks: readonly LabelAsk[]): {
  kept: (Id | string)[];
  skipped: (Id | string)[];
} {
  const order = asks.map((a, i) => ({ a, i })).sort((p, q) => p.a.rank - q.a.rank || p.i - q.i);
  const placed: LabelAsk[] = [];
  const skipped: (Id | string)[] = [];
  for (const { a } of order) {
    if (placed.some((p) => boxesHit(p, a))) skipped.push(a.key);
    else placed.push(a);
  }
  return { kept: placed.map((p) => p.key), skipped };
}

/** Moves a box sideways and up or down so it lies inside a `w` by `h` canvas with `margin` to spare. */
export function keepInside(box: Box, w: number, h: number, margin: number): Box {
  const x = Math.max(margin, Math.min(w - margin - box.w, box.x));
  const y = Math.max(margin, Math.min(h - margin - box.h, box.y));
  return { ...box, x, y };
}

// ---- zoom and pan ----

/** The picture's zoom (1 is the whole town) and shift in pixels, applied on top of the fitted view. */
export interface View {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY_VIEW: View = { k: 1, x: 0, y: 0 };
export const MAX_ZOOM = 5;

/**
 * Keeps the view inside the town: `frame` is the town's box on the screen at zoom 1 and `w`, `h`
 * the canvas. A zoomed town never leaves a gap at the canvas edge on an axis where it is bigger
 * than the canvas, and stays on the canvas on an axis where it is smaller.
 */
export function clampView(view: View, frame: Box, w: number, h: number): View {
  const k = Math.max(1, Math.min(MAX_ZOOM, view.k));
  if (k < 1.001) return IDENTITY_VIEW;
  const axis = (shift: number, from: number, size: number, extent: number) => {
    // Left edge `from * k + shift` and right edge `(from + size) * k + shift` stay on the canvas's
    // sides (bigger than the canvas) or inside it (smaller).
    const a = -from * k;
    const b = extent - (from + size) * k;
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), shift));
  };
  return { k, x: axis(view.x, frame.x, frame.w, w), y: axis(view.y, frame.y, frame.h, h) };
}

/** Zooms by `factor` keeping the point (`px`, `py`) of the canvas where it is. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = Math.max(1, Math.min(MAX_ZOOM, view.k * factor));
  const f = k / view.k;
  return { k, x: px - (px - view.x) * f, y: py - (py - view.y) * f };
}

/** Whether the view differs from the whole-town fit. */
export const isZoomed = (v: View): boolean =>
  v.k > 1.001 || Math.abs(v.x) > 0.5 || Math.abs(v.y) > 0.5;

// ---- the sheet ----

/** Where a dragged sheet settles: open when pulled past half way or flicked up, else peek. */
export function snapSheet(
  height: number,
  peek: number,
  open: number,
  velocity: number,
): 'peek' | 'open' {
  if (Math.abs(velocity) > 0.5) return velocity < 0 ? 'open' : 'peek';
  return height > (peek + open) / 2 ? 'open' : 'peek';
}
