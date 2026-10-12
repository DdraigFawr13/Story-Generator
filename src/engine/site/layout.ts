// Starting layout (M3.1): stamps the hall, well, stockpile, shrine, homes, fields and dock into a
// local map, and carves paths. Buildings are placed in rings around an origin near the map centre.

import type { SiteRules } from '../core/content-types';
import type { Building, LocalMap } from '../core/types';
import { hash2 } from '../worldgen/noise';
import { buildingDef, siteCodes } from './defs';

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
/** The first ring a home, shrine or field may use, so the green and the well stay open. */
const HOME_MIN_RING = 4;
const FIELD_MIN_RING = 14;
/** Rings searched before giving up on a building. */
const MAX_RING = 60;

export function layoutSite(
  map: LocalMap,
  rules: SiteRules,
  input: LayoutInput,
): { buildings: Building[]; origin: [number, number] } {
  const code = siteCodes(rules);
  const size = map.width;
  const total = size * size;
  const { terrain, tree, building, mineral, water } = map;
  const seed = hash2(map.cellX, map.cellY, size);
  const buildings: Building[] = [];
  const isLand = (k: number) =>
    water[k] === 0 &&
    (terrain[k] === code.grass ||
      terrain[k] === code.scrub ||
      terrain[k] === code.marsh ||
      terrain[k] === code.shore);
  const free = (x: number, y: number, w: number, h: number, pad: number) => {
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
  };

  // Origin: the free land tile near the map centre, about 10 steps from water and at least 6.
  const waterDist = new Int16Array(total).fill(999);
  const queue: number[] = [];
  for (let k = 0; k < total; k += 1) {
    if (water[k] !== 0) {
      waterDist[k] = 0;
      queue.push(k);
    }
  }
  const ORTHO: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
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
  const stamp = (defId: string, x: number, y: number, w: number, h: number, followed = true) => {
    const cells: number[] = [];
    const id = nextId++;
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        const k = yy * size + xx;
        cells.push(k);
        building[k] = id;
        tree[k] = 0;
        const edge = yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1;
        if (defId === 'field') terrain[k] = code.field;
        else if (defId === 'home' || defId === 'hall') terrain[k] = edge ? code.wall : code.floor;
        else terrain[k] = code.floor;
      }
    }
    const built: Building = {
      id,
      defId,
      cells,
      owner: null,
      condition: 100,
      x,
      y,
      w,
      h,
      followed,
    };
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
  const placeNear = (defId: string, minRing: number, pad: number): [number, number] | null => {
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
      for (const [x, y] of ring) if (free(x, y, w, h, pad)) return [x, y];
    }
    return null;
  };
  const place = (defId: string, minRing: number, pad = 1, followed = true) => {
    const at = placeNear(defId, minRing, pad);
    if (!at) return null;
    const { w, h } = buildingDef(rules, defId);
    return stamp(defId, at[0], at[1], w, h, followed);
  };

  // The central green, with paths.
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const k = (oy + dy) * size + ox + dx;
      if (water[k] !== 0) continue;
      terrain[k] = code.path;
      tree[k] = 0;
    }
  }
  if (input.isCapital) place('hall', 4);
  place('well', 1);
  place('stockpile', 3);
  place('shrine', 6);
  const homeCount = Math.ceil(input.pop / rules.peoplePerHome);
  for (let h = 0; h < homeCount; h += 1) {
    if (!place('home', HOME_MIN_RING, 1, h < input.followedHouseholds)) break;
  }
  // Paths run from each building's door toward the green and stop where they meet another path.
  const carve = (x0: number, y0: number, x1: number, y1: number, stopAtPath: boolean) => {
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
  };
  for (const b of buildings) {
    if (b.defId === 'home' || b.defId === 'hall') carve(b.x + (b.w >> 1), b.y + b.h, ox, oy, true);
  }
  // A road toward the world road: up to the north edge.
  carve(ox, oy, Math.min(size - 1, ox + 6), 0, false);
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
      const { w, h } = buildingDef(rules, 'dock');
      stamp('dock', x, y, w, h);
      carve(x, y, ox, oy, true);
    }
  }
  return { buildings, origin: [ox, oy] };
}
