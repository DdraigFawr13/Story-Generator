// Walking (M3.2): grid A* over the local map, 4-neighbour (people keep to rows and columns, which
// also keeps door tiles single-file) with a Manhattan heuristic. Cost per tile entered is its
// terrain's `walkCost` plus `treeCost` for a tree. Water blocks except at bridges; walls block
// except a home or hall's door. One expansion budget is shared by everyone in a block; once spent,
// routes are straight lines. The grid and route cache are derived data kept off the saved state.

import type { ActiveSite, Building, LocalMap } from '../core/types';
import type { LifeRules, SiteRules } from '../core/content-types';
import { doorOf } from './defs';

/** Cost of a blocked tile in the grid. */
const BLOCKED = 0;
/** Largest tile cost the grid stores (a Uint8). */
const MAX_COST = 255;

interface PathCache {
  /** Cost to enter each tile; 0 blocks. */
  cost: Uint8Array;
  routes: Map<number, number[] | null>;
  /** Scratch per search; `seen` and `closed` mark tiles by search number so nothing is cleared. */
  g: Float64Array;
  from: Int32Array;
  seen: Int32Array;
  closed: Int32Array;
  search: number;
  /** Open set of the running search. */
  heap: Heap;
  /** Nodes expanded since the site started (for tests and tuning). */
  expanded: number;
  /** Tiles changed since the grid was built; null when it is current. */
  changed: number[] | null;
}

const caches = new WeakMap<ActiveSite, PathCache>();

/**
 * Call after buildings or map tiles change. With the tiles that were blocked or made dearer, only
 * the routes through them are dropped; without, everything is rebuilt. Tiles only made cheaper
 * (a new path) pass an empty list: old routes still work.
 */
export function invalidatePaths(active: ActiveSite, changed?: readonly number[]): void {
  const cache = caches.get(active);
  if (!cache) return;
  if (changed) cache.changed = [...(cache.changed ?? []), ...changed];
  else caches.delete(active);
}

function buildCost(
  map: LocalMap,
  buildings: Iterable<Building>,
  rules: SiteRules,
  life: LifeRules,
) {
  const cost = new Uint8Array(map.width * map.height);
  const bridges = new Set(map.bridges);
  for (let k = 0; k < cost.length; k += 1) {
    if (map.water[k] !== 0 && !bridges.has(k)) continue;
    const base = life.walkCost[rules.terrains[map.terrain[k]!]!.id];
    if (base === undefined) continue;
    cost[k] = Math.min(MAX_COST, base + (map.tree[k] ? life.treeCost : 0));
  }
  const floor = life.walkCost['floor'] ?? 1;
  const walled = new Set(rules.buildings.filter((d) => d.walled).map((d) => d.id));
  for (const b of buildings) if (walled.has(b.defId)) cost[doorOf(b, map.width)] = floor;
  return cost;
}

function cacheOf(active: ActiveSite, rules: SiteRules, life: LifeRules): PathCache {
  let cache = caches.get(active);
  if (!cache) {
    const n = active.map.width * active.map.height;
    cache = {
      cost: buildCost(active.map, active.buildings.values(), rules, life),
      routes: new Map(),
      g: new Float64Array(n),
      from: new Int32Array(n),
      seen: new Int32Array(n),
      closed: new Int32Array(n),
      search: 0,
      heap: { prio: new Float64Array(1024), tile: new Int32Array(1024), size: 0 },
      expanded: 0,
      changed: null,
    };
    caches.set(active, cache);
  } else if (cache.changed) {
    // Rebuild the cost grid and drop only the routes the change can have broken.
    const changed = new Set(cache.changed);
    cache.cost = buildCost(active.map, active.buildings.values(), rules, life);
    cache.changed = null;
    for (const [key, route] of cache.routes) {
      if (route === null || route.some((k) => changed.has(k))) cache.routes.delete(key);
    }
  }
  return cache;
}

/** Cost to enter tile `k` (0 = blocked). */
/**
 * The last tile of `route` reachable within `limit` walking cost (each step costs its tile's cost,
 * at least 1), or -1 when not even the first step is.
 */
export function walkAlong(
  active: ActiveSite,
  rules: SiteRules,
  life: LifeRules,
  route: number[],
  limit: number,
): number {
  const steps = walkSteps(active, rules, life, route, limit);
  return steps === 0 ? -1 : route[steps - 1]!;
}

/** How many tiles of `route` are reachable within `limit` walking cost (see `walkAlong`). */
export function walkSteps(
  active: ActiveSite,
  rules: SiteRules,
  life: LifeRules,
  route: number[],
  limit: number,
): number {
  const cost = cacheOf(active, rules, life).cost;
  // A block's walk is short against the route cache, so a scan beats keeping running sums.
  let total = 0;
  for (let i = 0; i < route.length; i += 1) {
    total += Math.max(1, cost[route[i]!]!);
    if (total > limit) return i;
  }
  return route.length;
}

/** The whole cost grid (0 blocks); read it, do not write it. */
export function pathCosts(active: ActiveSite, rules: SiteRules, life: LifeRules): Uint8Array {
  return cacheOf(active, rules, life).cost;
}

export function tileCost(active: ActiveSite, rules: SiteRules, life: LifeRules, k: number) {
  return cacheOf(active, rules, life).cost[k]!;
}

/** Total A* node expansions on this site since it started. */
export function nodesExpanded(active: ActiveSite): number {
  return caches.get(active)?.expanded ?? 0;
}

/** Tiles on the straight line from `from` (excluded) to `to` (included), Bresenham. */
export function straightLine(width: number, from: number, to: number): number[] {
  let x = from % width;
  let y = (from - x) / width;
  const tx = to % width;
  const ty = (to - tx) / width;
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  const line: number[] = [];
  while (x !== tx || y !== ty) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    line.push(y * width + x);
  }
  return line;
}

/** Binary min-heap of (priority, tile) pairs in typed arrays (grown by doubling, never shrunk). */
interface Heap {
  prio: Float64Array;
  tile: Int32Array;
  size: number;
}

function push(heap: Heap, priority: number, tile: number) {
  if (heap.size === heap.prio.length) {
    const prio = new Float64Array(heap.size * 2);
    const tiles = new Int32Array(heap.size * 2);
    prio.set(heap.prio);
    tiles.set(heap.tile);
    heap.prio = prio;
    heap.tile = tiles;
  }
  const { prio, tile: tiles } = heap;
  let i = heap.size;
  heap.size += 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (prio[parent]! <= priority) break;
    prio[i] = prio[parent]!;
    tiles[i] = tiles[parent]!;
    i = parent;
  }
  prio[i] = priority;
  tiles[i] = tile;
}

/** Removes the lowest priority entry and returns its tile. */
function pop(heap: Heap): number {
  const { prio, tile: tiles } = heap;
  const top = tiles[0]!;
  heap.size -= 1;
  const n = heap.size;
  if (n > 0) {
    const priority = prio[n]!;
    const tile = tiles[n]!;
    let i = 0;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= n) break;
      if (child + 1 < n && prio[child + 1]! < prio[child]!) child += 1;
      if (prio[child]! >= priority) break;
      prio[i] = prio[child]!;
      tiles[i] = tiles[child]!;
      i = child;
    }
    prio[i] = priority;
    tiles[i] = tile;
  }
  return top;
}

/**
 * The tiles to walk from `from` (excluded) to `to` (included). Null when `to` cannot be reached.
 * Cached routes cost nothing; a search spends `budget.left` per node expanded, and when that runs
 * out the route is a straight line (not cached, and not checked for walls). A larger `weight` than
 * `life.pathWeight` searches fewer tiles for a looser route (strolls, not errands).
 */
export function findRoute(
  active: ActiveSite,
  rules: SiteRules,
  life: LifeRules,
  from: number,
  to: number,
  budget: { left: number },
  weight = life.pathWeight,
): number[] | null {
  if (from === to) return [];
  const c = cacheOf(active, rules, life);
  const width = active.map.width;
  const height = active.map.height;
  const key = from * c.cost.length + to;
  const cached = c.routes.get(key);
  if (cached !== undefined) return cached;
  if (c.cost[to] === BLOCKED) return null;
  c.search += 1;
  const { search, heap, cost, g, seen, closed } = c;
  const tx = to % width;
  const ty = (to - tx) / width;
  const h = (k: number) => {
    const x = k % width;
    return weight * (Math.abs(x - tx) + Math.abs((k - x) / width - ty));
  };
  heap.size = 0;
  g[from] = 0;
  seen[from] = search;
  c.from[from] = -1;
  push(heap, h(from), from);
  let found = false;
  while (heap.size > 0) {
    const k = pop(heap);
    if (closed[k] === search) continue;
    if (k === to) {
      found = true;
      break;
    }
    if (budget.left <= 0) return straightLine(width, from, to);
    budget.left -= 1;
    c.expanded += 1;
    closed[k] = search;
    const x = k % width;
    const y = (k - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = d === 0 ? x - 1 : d === 1 ? x + 1 : x;
      const ny = d === 2 ? y - 1 : d === 3 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      const step = cost[n]!;
      if (step === BLOCKED || closed[n] === search) continue;
      const next = g[k]! + step;
      if (seen[n] === search && g[n]! <= next) continue;
      seen[n] = search;
      g[n] = next;
      c.from[n] = k;
      push(heap, next + weight * (Math.abs(nx - tx) + Math.abs(ny - ty)), n);
    }
  }
  let route: number[] | null = null;
  if (found) {
    route = [];
    for (let k = to; k !== from; k = c.from[k]!) route.push(k);
    route.reverse();
  }
  if (c.routes.size >= life.pathCache) c.routes.clear();
  c.routes.set(key, route);
  // The way back is the same road: people go out and return along it (work and home, shrine and home).
  const back = to * c.cost.length + from;
  if (route && !c.routes.has(back)) {
    c.routes.set(back, [...route.slice(0, -1).reverse(), from]);
  }
  return route;
}
