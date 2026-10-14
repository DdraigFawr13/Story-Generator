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
  const t = ease((now - g.start) / g.duration);
  if (g.path && g.path.length >= 2) return alongPath(g.path, t);
  return { x: g.fx + (g.tx - g.fx) * t, y: g.fy + (g.ty - g.fy) * t };
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
