// Starting layout (M3.1): stamps the hall, well, stockpile, shrine, homes, fields and dock into a
// local map, and carves paths. Buildings are placed in rings around an origin near the map centre.

import { ORTHO } from '../core/math';
import type { SiteRules } from '../core/content-types';
import type { Building, LocalMap } from '../core/types';
import { hash2 } from '../worldgen/noise';
import { buildingDef, doorstep, siteCodes, type SiteCodes } from './defs';

export interface LayoutInput {
  /** Whole site population, followed or counted: sets the number of homes and fields. */
  pop: number;
  /** Homes nearest the origin that belong to followed households. */
  followedHouseholds: number;
  /** Capital sites get a hall. */
  isCapital: boolean;
  /** The site is on the coast: add a dock. */
  coast: boolean;
}

// Layout tuning (tiles).
/** Nothing is built closer than this (Manhattan steps) to water. */
const MIN_WATER_DISTANCE = 6;
/** The origin prefers land this far from water. */
const IDEAL_WATER_DISTANCE = 10;
/** Trees within this radius of the origin are cleared... */
const CLEAR_RADIUS = 22;
/** ...with this chance in percent. */
const CLEAR_PERCENT = 85;
/** The first ring a field may use, beyond the square and the first homes. */
const FIELD_MIN_RING = 14;
/** Village life: the market square's half size (along, across the main street). */
const SQUARE_HALF: readonly [number, number] = [5, 3];
/** Streets reach this far (tiles) from the square... */
const STREET_REACH = 34;
/** ...lanes run parallel to the main street this far apart (two home depths, a yard row, the lane)... */
const STREET_GAP = 10;
/** ...and a row of homes is this many long before a gap. */
const TERRACE = 5;
/** Share of street plots (percent) left open as gardens. */
const OPEN_PLOT_PERCENT = 12;
/** Rings searched before giving up on a building. */
const MAX_RING = 60;

/** True when a w x h footprint at (x, y), padded by `pad`, is clear building land. */
function isFree(
  map: LocalMap,
  code: SiteCodes,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
) {
  const size = map.width;
  const { terrain, building, mineral, water } = map;
  for (let yy = y - pad; yy < y + h + pad; yy += 1) {
    for (let xx = x - pad; xx < x + w + pad; xx += 1) {
      if (xx < 1 || yy < 1 || xx >= size - 1 || yy >= size - 1) return false;
      const k = yy * size + xx;
      const inside = yy >= y && yy < y + h && xx >= x && xx < x + w;
      // A path may run along the padding but not under the building.
      if (terrain[k] === code.path && !inside && water[k] === 0) continue;
      if (building[k] || water[k] !== 0 || mineral[k]) return false;
      if (terrain[k] !== code.grass && terrain[k] !== code.scrub) return false;
    }
  }
  return true;
}

/**
 * The top-left corner for a building, searched in rings around `origin` from `minRing` outward
 * (positions within a ring in a fixed hashed order); null when the map has no room.
 */
export function findSpot(
  map: LocalMap,
  rules: SiteRules,
  defId: string,
  origin: readonly [number, number],
  minRing: number,
  pad: number,
): [number, number] | null {
  const code = siteCodes(rules);
  const seed = hash2(map.cellX, map.cellY, map.width);
  const [ox, oy] = origin;
  const { w, h } = buildingDef(rules, defId);
  for (let r = minRing; r < MAX_RING; r += 1) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) {
          ring.push([ox + dx - (w >> 1), oy + dy - (h >> 1)]);
        }
      }
    }
    ring.sort((a, b) => hash2(seed + 71 + r, a[0], a[1]) - hash2(seed + 71 + r, b[0], b[1]));
    for (const [x, y] of ring) if (isFree(map, code, x, y, w, h, pad)) return [x, y];
  }
  return null;
}

/** A home's place in a row: its rectangle and door (a wall tile on the street side). */
export interface RowSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  door: number;
}

/**
 * Village life: a spot for a new home at the end of an existing row, sharing the end home's wall
 * and facing the same street; rows stop at TERRACE homes. Homes nearest `origin` are tried first.
 */
export function findRowSpot(
  map: LocalMap,
  rules: SiteRules,
  buildings: Iterable<Building>,
  origin: readonly [number, number],
): RowSpot | null {
  const code = siteCodes(rules);
  const size = map.width;
  const homes = [...buildings].filter((b) => b.defId === 'home' && b.door !== undefined);
  const byCorner = new Map<number, Building>();
  for (const b of homes) byCorner.set(b.y * size + b.x, b);
  const [ox, oy] = origin;
  const centre = (b: Building) => Math.abs(b.x + (b.w >> 1) - ox) + Math.abs(b.y + (b.h >> 1) - oy);
  homes.sort((a, b) => centre(a) - centre(b) || a.id - b.id);
  for (const b of homes) {
    const door = b.door!;
    const dy = Math.floor(door / size);
    // A door in the top or bottom wall: the row runs along x.
    const alongX = dy === b.y || dy === b.y + b.h - 1;
    const pitch = (alongX ? b.w : b.h) - 1;
    for (const dir of [1, -1]) {
      const sx = alongX ? dir * pitch : 0;
      const sy = alongX ? 0 : dir * pitch;
      // The row's length counting back from b.
      let length = 1;
      for (let n = byCorner.get((b.y - sy) * size + b.x - sx); n; length += 1) {
        n = byCorner.get((n.y - sy) * size + n.x - sx);
      }
      if (length >= TERRACE || byCorner.has((b.y + sy) * size + b.x + sx)) continue;
      const spot: RowSpot = {
        x: b.x + sx,
        y: b.y + sy,
        w: b.w,
        h: b.h,
        door: door + sy * size + sx,
      };
      if (!rowFree(map, code, spot, new Set(b.cells))) continue;
      const step = doorstep(spot, size);
      if (map.building[step] || map.water[step] === code.sea || map.water[step] === code.lake)
        continue;
      return spot;
    }
  }
  return null;
}

/** Free for a home in a row, allowing the wall the neighbour already stands on. */
function rowFree(map: LocalMap, code: SiteCodes, r: RowSpot, shared: Set<number>): boolean {
  const size = map.width;
  for (let yy = r.y; yy < r.y + r.h; yy += 1) {
    for (let xx = r.x; xx < r.x + r.w; xx += 1) {
      if (xx < 1 || yy < 1 || xx >= size - 1 || yy >= size - 1) return false;
      const k = yy * size + xx;
      if (shared.has(k)) continue;
      if (map.building[k] || map.water[k] !== 0 || map.mineral[k]) return false;
      if (map.terrain[k] !== code.grass && map.terrain[k] !== code.scrub) return false;
    }
  }
  return true;
}

/** Writes a building into the map (terrain, building ids, trees cleared) and returns it. */
export function stampBuilding(
  map: LocalMap,
  rules: SiteRules,
  id: number,
  defId: string,
  x: number,
  y: number,
  followed = true,
  size2?: readonly [number, number],
): Building {
  const code = siteCodes(rules);
  const def = buildingDef(rules, defId);
  const { walled } = def;
  // A street plot may turn a building a quarter turn (w and h swapped).
  const [w, h] = size2 ?? [def.w, def.h];
  const size = map.width;
  const cells: number[] = [];
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const k = yy * size + xx;
      cells.push(k);
      // A wall shared with a neighbour in the row stays the neighbour's tile.
      if (!map.building[k]) map.building[k] = id;
      map.tree[k] = 0;
      const edge = yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1;
      if (defId === 'field') map.terrain[k] = code.field;
      else if (walled) map.terrain[k] = edge ? code.wall : code.floor;
      else if (defId === 'wall') map.terrain[k] = code.wall;
      else map.terrain[k] = code.floor;
    }
  }
  return { id, defId, cells, owner: null, condition: 100, x, y, w, h, followed };
}

/**
 * Carves a path from (x0, y0) toward (x1, y1), one step at a time, bridging rivers; with
 * `stopAtPath` it ends where it meets another path.
 */
export function carvePath(
  map: LocalMap,
  rules: SiteRules,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stopAtPath: boolean,
) {
  const code = siteCodes(rules);
  const size = map.width;
  const { terrain, tree, building, water } = map;
  const seed = hash2(map.cellX, map.cellY, size);
  let x = x0;
  let y = y0;
  let guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 400) {
    if (x !== x1 && (y === y1 || hash2(seed + 81, x, y) % 2)) x += Math.sign(x1 - x);
    else y += Math.sign(y1 - y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const k = y * size + x;
    if (building[k]) continue;
    if (water[k] === code.sea || water[k] === code.lake) continue;
    if (stopAtPath && terrain[k] === code.path && guard > 2) return;
    if (water[k] === code.river) {
      terrain[k] = code.path;
      map.bridges.push(k);
      continue;
    }
    terrain[k] = code.path;
    tree[k] = 0;
  }
}

export function layoutSite(
  map: LocalMap,
  rules: SiteRules,
  input: LayoutInput,
): { buildings: Building[]; origin: [number, number] } {
  const code = siteCodes(rules);
  const size = map.width;
  const total = size * size;
  const { terrain, tree, building, water } = map;
  const seed = hash2(map.cellX, map.cellY, size);
  const buildings: Building[] = [];
  const isLand = (k: number) =>
    water[k] === 0 &&
    (terrain[k] === code.grass ||
      terrain[k] === code.scrub ||
      terrain[k] === code.marsh ||
      terrain[k] === code.shore);
  // Origin: the free land tile near the map centre, about 10 steps from water and at least 6.
  const waterDist = new Int16Array(total).fill(999);
  const queue: number[] = [];
  for (let k = 0; k < total; k += 1) {
    if (water[k] !== 0) {
      waterDist[k] = 0;
      queue.push(k);
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const k = queue[head]!;
    const x = k % size;
    const y = (k - x) / size;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (waterDist[n]! > waterDist[k]! + 1) {
        waterDist[n] = waterDist[k]! + 1;
        queue.push(n);
      }
    }
  }
  const centre = size >> 1;
  let best = -1;
  let bestScore = Infinity;
  for (let k = 0; k < total; k += 1) {
    if (!isLand(k) || terrain[k] === code.shore || waterDist[k]! < MIN_WATER_DISTANCE) continue;
    const x = k % size;
    const y = (k - x) / size;
    if (x < 6 || y < 6 || x >= size - 6 || y >= size - 6) continue;
    const score =
      Math.abs(x - centre) +
      Math.abs(y - centre) +
      Math.abs(waterDist[k]! - IDEAL_WATER_DISTANCE) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best < 0) best = centre * size + centre;
  const ox = best % size;
  const oy = (best - ox) / size;

  let nextId = 1;
  const stamp = (defId: string, x: number, y: number, followed = true) => {
    const built = stampBuilding(map, rules, nextId++, defId, x, y, followed);
    buildings.push(built);
    return built;
  };
  for (let k = 0; k < total; k += 1) {
    if (!tree[k]) continue;
    const x = k % size;
    const y = (k - x) / size;
    const dx = x - ox;
    const dy = y - oy;
    if (
      dx * dx + dy * dy < CLEAR_RADIUS * CLEAR_RADIUS &&
      hash2(seed + 61, x, y) % 100 < CLEAR_PERCENT
    ) {
      tree[k] = 0;
    }
  }
  const place = (defId: string, minRing: number, pad = 1, followed = true) => {
    const at = findSpot(map, rules, defId, [ox, oy], minRing, pad);
    return at ? stamp(defId, at[0], at[1], followed) : null;
  };

  // Village life: a street village. A market square at the origin, a main street along the axis
  // with the most land, and back lanes parallel to it every STREET_GAP tiles; homes stand in rows
  // facing the streets, sharing side walls, with yards behind them.
  const axisLand = (alongX: boolean) => {
    let n = 0;
    for (let u = -STREET_REACH; u <= STREET_REACH; u += 1) {
      for (let v = -8; v <= 8; v += 1) {
        const x = alongX ? ox + u : ox + v;
        const y = alongX ? oy + v : oy + u;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const k = y * size + x;
        if (isLand(k) && waterDist[k]! >= MIN_WATER_DISTANCE) n += 1;
      }
    }
    return n;
  };
  const alongX = axisLand(true) >= axisLand(false);
  /** Street coordinates (u along the street, v across it) to a tile. */
  const at = (u: number, v: number): [number, number] =>
    alongX ? [ox + u, oy + v] : [ox + v, oy + u];
  const inMap = (x: number, y: number) => x >= 1 && y >= 1 && x < size - 1 && y < size - 1;

  // The market square.
  for (let v = -SQUARE_HALF[1]; v <= SQUARE_HALF[1]; v += 1) {
    for (let u = -SQUARE_HALF[0]; u <= SQUARE_HALF[0]; u += 1) {
      const [x, y] = at(u, v);
      if (!inMap(x, y)) continue;
      const k = y * size + x;
      if (water[k] !== 0) continue;
      terrain[k] = code.path;
      tree[k] = 0;
    }
  }
  // The main street, its whole length, so nothing is built across it.
  for (let u = -STREET_REACH; u <= STREET_REACH; u += 1) {
    const [x, y] = at(u, 0);
    if (!inMap(x, y)) continue;
    const k = y * size + x;
    if (water[k] === code.sea || water[k] === code.lake) continue;
    if (water[k] === code.river && terrain[k] !== code.path) map.bridges.push(k);
    terrain[k] = code.path;
    tree[k] = 0;
  }
  /** The door of a building placed around the square: on the wall facing the origin. */
  const faceOrigin = (b: Building) => {
    const cx = b.x + (b.w >> 1);
    const cy = b.y + (b.h >> 1);
    const dx = ox - cx;
    const dy = oy - cy;
    const door =
      Math.abs(dx) > Math.abs(dy)
        ? (b.y + (b.h >> 1)) * size + (dx > 0 ? b.x + b.w - 1 : b.x)
        : (dy > 0 ? b.y + b.h - 1 : b.y) * size + b.x + (b.w >> 1);
    b.door = door;
    const step = doorstep(b, size);
    carvePath(map, rules, step % size, Math.floor(step / size), ox, oy, true);
    const sk = step;
    if (map.building[sk] === 0 && water[sk] === 0) terrain[sk] = code.path;
  };
  // Public buildings face the square.
  const civic = (defId: string, ring: number) => {
    const b = place(defId, ring);
    if (b && buildingDef(rules, defId).walled) faceOrigin(b);
    return b;
  };
  if (input.isCapital) civic('hall', 6);
  place('well', 2);
  for (const def of rules.buildings) {
    if (def.minPop !== undefined && input.pop >= def.minPop) civic(def.id, 6);
  }
  civic('stockpile', 6);
  civic('shrine', 7);

  // Street plots: every STREET_GAP tiles across, homes on both sides of each street, back to back
  // with a yard row between. Along a street, plot i starts at u = i * (homeLong - 1): neighbours
  // share a wall, and every TERRACE + 1th plot is left open as a lane through the row.
  const homeDef = buildingDef(rules, 'home');
  const along = homeDef.w;
  const deep = homeDef.h;
  const pitch = along - 1;
  interface Plot {
    street: number;
    side: number;
    i: number;
    d: number;
  }
  const plots: Plot[] = [];
  const streets = Math.floor(STREET_REACH / STREET_GAP);
  for (let street = -streets; street <= streets; street += 1) {
    for (const side of [-1, 1]) {
      for (let i = -Math.ceil(STREET_REACH / pitch); i <= Math.ceil(STREET_REACH / pitch); i += 1) {
        if (((i % (TERRACE + 1)) + TERRACE + 1) % (TERRACE + 1) === TERRACE) continue;
        // Some plots stay open (a garden, a paddock), so rows are not all one length.
        if (hash2(seed + 91 + street, side, i) % 100 < OPEN_PLOT_PERCENT) continue;
        const u = i * pitch + (pitch >> 1);
        const v = street * STREET_GAP + side * (deep >> 1);
        // The main street fills first, then the lanes nearest it.
        plots.push({ street, side, i, d: Math.abs(u) + Math.abs(v) * 2 + Math.abs(street) * 6 });
      }
    }
  }
  plots.sort((a, b) => a.d - b.d || a.street - b.street || a.side - b.side || a.i - b.i);
  const placed = new Map<string, Building>();
  const key = (p: Plot, di = 0) => `${p.street},${p.side},${p.i + di}`;
  /** The plot's top-left tile, size and door (on the street side, in the middle). */
  const plotRect = (p: Plot) => {
    const u0 = p.i * pitch;
    const vStreet = p.street * STREET_GAP;
    const v0 = p.side > 0 ? vStreet + 1 : vStreet - deep;
    const [ax, ay] = at(u0, v0);
    const [bx, by] = at(u0 + along - 1, v0 + deep - 1);
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    const [dx, dy] = at(u0 + (along >> 1), p.side > 0 ? v0 : v0 + deep - 1);
    return { x, y, w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1, door: dy * size + dx };
  };
  /** Free for a home, allowing the wall a neighbour in the row already stands on. */
  const plotFree = (r: { x: number; y: number; w: number; h: number }, shared: Set<number>) => {
    for (let yy = r.y; yy < r.y + r.h; yy += 1) {
      for (let xx = r.x; xx < r.x + r.w; xx += 1) {
        if (!inMap(xx, yy)) return false;
        const k = yy * size + xx;
        if (shared.has(k)) continue;
        if (building[k] || water[k] !== 0 || map.mineral[k]) return false;
        if (terrain[k] !== code.grass && terrain[k] !== code.scrub) return false;
        if (waterDist[k]! < MIN_WATER_DISTANCE - 2) return false;
      }
    }
    return true;
  };
  const homeCount = Math.ceil(input.pop / rules.peoplePerHome);
  let homes = 0;
  for (const p of plots) {
    if (homes >= homeCount) break;
    const r = plotRect(p);
    const shared = new Set<number>();
    for (const di of [-1, 1]) {
      const n = placed.get(key(p, di));
      if (!n) continue;
      for (const k of n.cells) shared.add(k);
    }
    if (!plotFree(r, shared)) continue;
    // The street in front must be walkable land.
    const [sx, sy] = at(p.i * pitch + (along >> 1), p.street * STREET_GAP);
    const sk = sy * size + sx;
    if (!inMap(sx, sy) || building[sk] || (water[sk] !== 0 && water[sk] !== code.river)) continue;
    const b = stampBuilding(
      map,
      rules,
      nextId++,
      'home',
      r.x,
      r.y,
      homes < input.followedHouseholds,
      [r.w, r.h],
    );
    b.door = r.door;
    buildings.push(b);
    placed.set(key(p), b);
    homes += 1;
    // The street along the home's front.
    for (let u = p.i * pitch - 1; u <= p.i * pitch + along; u += 1) {
      const [x, y] = at(u, p.street * STREET_GAP);
      if (!inMap(x, y)) continue;
      const k = y * size + x;
      if (building[k] || water[k] === code.sea || water[k] === code.lake) continue;
      if (water[k] === code.river) {
        if (terrain[k] !== code.path) map.bridges.push(k);
      }
      terrain[k] = code.path;
      tree[k] = 0;
    }
  }
  // Lanes join the main street: through the open plot at each row's end, else straight to the square.
  for (let street = -streets; street <= streets; street += 1) {
    if (street === 0) continue;
    let near: [number, number] | null = null;
    let best = Infinity;
    for (const b of placed.values()) {
      const step = doorstep(b, size);
      const x = step % size;
      const y = (step - x) / size;
      const v = alongX ? y - oy : x - ox;
      if (v !== street * STREET_GAP) continue;
      const d = Math.abs(x - ox) + Math.abs(y - oy);
      if (d < best) {
        best = d;
        near = [x, y];
      }
    }
    if (near) carvePath(map, rules, near[0], near[1], ox, oy, true);
  }
  // A road toward the world road: up to the north edge.
  carvePath(map, rules, ox, oy, Math.min(size - 1, ox + 6), 0, false);
  // Fields: plots beyond the homes.
  const fieldCount = Math.ceil(input.pop / rules.peoplePerField);
  for (let f = 0; f < fieldCount; f += 1) if (!place('field', FIELD_MIN_RING, 0)) break;
  if (input.coast) {
    // The dock: the shore tile nearest the origin.
    let bestShore = -1;
    let bestD = Infinity;
    for (let k = 0; k < total; k += 1) {
      if (terrain[k] !== code.shore || building[k] || water[k] !== 0) continue;
      const x = k % size;
      const y = (k - x) / size;
      if (x >= size - 2 || y >= size - 2) continue;
      if (building[k + 1] || building[k + size] || building[k + size + 1]) continue;
      const d = (x - ox) * (x - ox) + (y - oy) * (y - oy);
      if (d < bestD) {
        bestD = d;
        bestShore = k;
      }
    }
    if (bestShore >= 0) {
      const x = bestShore % size;
      const y = (bestShore - x) / size;
      stamp('dock', x, y);
      carvePath(map, rules, x, y, ox, oy, true);
    }
  }
  return { buildings, origin: [ox, oy] };
}
