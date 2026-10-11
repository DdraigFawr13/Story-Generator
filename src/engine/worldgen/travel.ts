// Travel cost and the route graph (Phase 1, M1.6): a per-cell cost to cross ground on foot, a
// coarse graph between the best site candidates (harbours, fords, passes, fertile river mouths)
// found by budgeted A*, and a per-cell count of routes ("likely roads"). Pure and deterministic;
// no RNG is drawn. Phase 2 reads it for migration, trade and war reach.

import { CellHeap, D8_DX, D8_DY } from './grid';
import { landmasses } from './regions';
import type { WorldgenContent } from './index';
import type { Id, Region, RouteEdge, RouteGraph, RouteNode, WorldCells } from '../core/types';

/** Tunable numbers for travel costs and routes. */
export const TRAVEL_RULES = {
  /** Cell cost value meaning "cannot be entered". */
  blocked: 255,
  /** Highest cost a passable land cell may have. */
  maxCost: 254,
  /** Metres of height difference to a neighbour that add one point of cost. */
  metresPerPoint: 100,
  /** Extra cost of wading a river cell that is not a ford. */
  riverCrossing: 12,
  /** Cost of a sea cell; only sea lanes use it. */
  sea: 2,
  /** A candidate this close (cells, either axis) to an earlier one is dropped. */
  mergeRadius: 3,
  /** A river mouth is a candidate when a beside-it land cell has at least this fertility. */
  mouthFertility: 50,
  /** Each node tries to link to this many nearest nodes on its landmass. */
  landLinks: 4,
  /** Each harbour tries to link by sea to this many nearest harbours within `seaReach` cells. */
  seaLinks: 2,
  seaReach: 60,
  /** A search stops after this many expansions, or past this cost per cell of straight line. */
  budget: { expansions: 30000, costPerDistance: 40 },
  /** Joining the pieces of a landmass: tries per landmass and the bigger budget. */
  rescue: { tries: 10, budget: { expansions: 80000, costPerDistance: 40 } },
} as const;

type Shape = Pick<WorldCells, 'width' | 'height' | 'elevation' | 'water' | 'biome'>;
interface Budget {
  expansions: number;
  costPerDistance: number;
}
const SQRT2 = 1.414;
/** Octile distance weight of the shorter axis (SQRT2 − 1). */
const DIAGONAL_EXTRA = SQRT2 - 1;

/**
 * Cost to enter each cell: land is its biome's travel cost plus a slope term, rivers add a
 * crossing cost except at fords, passes halve the slope term, lakes are blocked, sea is cheap.
 */
export function travelCosts(
  cells: Shape,
  content: Pick<WorldgenContent, 'biomes'>,
  regions: Iterable<Region>,
): Uint8Array<ArrayBuffer> {
  const { width, height, elevation, water, biome } = cells;
  const rules = TRAVEL_RULES;
  const isPass = new Uint8Array(width * height);
  const isFord = new Uint8Array(width * height);
  for (const region of regions) {
    if (region.kind === 'pass') for (const c of region.cells) isPass[c] = 1;
    else if (region.kind === 'ford') for (const c of region.cells) isFord[c] = 1;
  }
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i += 1) {
    if (water[i] === 3) {
      out[i] = rules.sea;
      continue;
    }
    if (water[i] === 2) {
      out[i] = rules.blocked;
      continue;
    }
    const x = i % width;
    const y = (i - x) / width;
    let steepest = 0;
    for (let d = 0; d < 8; d += 2) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      steepest = Math.max(steepest, Math.abs(elevation[i]! - elevation[ny * width + nx]!));
    }
    let slope = Math.round(steepest / rules.metresPerPoint);
    if (isPass[i]) slope = Math.round(slope / 2);
    let cost = Math.max(1, content.biomes[biome[i]!]?.travel ?? 1) + slope;
    if (water[i] === 1 && !isFord[i]) cost += rules.riverCrossing;
    out[i] = Math.min(rules.maxCost, cost);
  }
  return out;
}

/** A* over a grid with per-cell costs. One instance reuses its buffers for many searches. */
export class PathSearch {
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly seen: Int32Array;
  private readonly closed: Int32Array;
  private readonly heap: CellHeap;
  private readonly minCost: number;
  private stamp = 0;

  /** `passable` is non-zero where the path may step; the two endpoints are always allowed. */
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly cost: ArrayLike<number>,
    private readonly passable: ArrayLike<number>,
    private readonly maxExpansions: number,
  ) {
    const size = width * height;
    this.g = new Float64Array(size);
    this.parent = new Int32Array(size);
    this.seen = new Int32Array(size);
    this.closed = new Int32Array(size);
    this.heap = new CellHeap(maxExpansions * 8 + 8);
    // The cheapest passable cell sets the heuristic's scale, so it never overestimates.
    let lowest = Infinity;
    for (let i = 0; i < size; i += 1) {
      if (passable[i] && cost[i]! < TRAVEL_RULES.blocked) lowest = Math.min(lowest, cost[i]!);
    }
    this.minCost = Number.isFinite(lowest) ? Math.max(1, lowest) : 1;
  }

  /** The cheapest path from `from` to `to` (both included) and its cost, or null over budget. */
  find(from: number, to: number, budget: Budget): { path: number[]; cost: number } | null {
    if (from === to) return { path: [from], cost: 0 };
    const { width, height, g, parent, seen, closed, heap, cost, passable } = this;
    const tx = to % width;
    const ty = (to - tx) / width;
    const fx = from % width;
    const fy = (from - fx) / width;
    const limit = budget.costPerDistance * Math.sqrt((tx - fx) * (tx - fx) + (ty - fy) * (ty - fy));
    const maxExpansions = Math.min(budget.expansions, this.maxExpansions);
    const stamp = (this.stamp += 1);
    const guess = (x: number, y: number): number => {
      const dx = Math.abs(x - tx);
      const dy = Math.abs(y - ty);
      return (Math.max(dx, dy) + DIAGONAL_EXTRA * Math.min(dx, dy)) * this.minCost;
    };
    heap.clear();
    g[from] = 0;
    seen[from] = stamp;
    parent[from] = -1;
    heap.push(from, guess(fx, fy));
    let expansions = 0;
    while (heap.size > 0) {
      const at = heap.pop();
      if (closed[at] === stamp) continue;
      closed[at] = stamp;
      if (at === to) {
        const path: number[] = [];
        for (let c = at; c >= 0; c = parent[c]!) path.push(c);
        return { path: path.reverse(), cost: g[at]! };
      }
      expansions += 1;
      if (expansions > maxExpansions) return null;
      const x = at % width;
      const y = (at - x) / width;
      for (let d = 0; d < 8; d += 1) {
        const nx = x + D8_DX[d]!;
        const ny = y + D8_DY[d]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (closed[n] === stamp || (n !== to && !passable[n])) continue;
        const step = cost[n]!;
        if (step >= TRAVEL_RULES.blocked) continue;
        const total = g[at]! + (d & 1 ? step * SQRT2 : step);
        if (total > limit || (seen[n] === stamp && total >= g[n]!)) continue;
        seen[n] = stamp;
        g[n] = total;
        parent[n] = at;
        heap.push(n, total + guess(nx, ny));
      }
    }
    return null;
  }
}

interface Candidate {
  cell: number;
  kind: RouteNode['kind'];
  region: Id | null;
}

/** Harbours, fords, passes and fertile river mouths, thinned so no two sit close together. */
function candidates(
  cells: Pick<WorldCells, 'width' | 'height' | 'water' | 'flowDir' | 'fertility'>,
  regions: readonly Region[],
): Candidate[] {
  const { width, height, water, flowDir, fertility } = cells;
  const rules = TRAVEL_RULES;
  const groups: Record<RouteNode['kind'], Candidate[]> = {
    harbour: [],
    ford: [],
    pass: [],
    'river-mouth': [],
  };
  for (const region of regions) {
    if (region.kind === 'harbour' || region.kind === 'ford' || region.kind === 'pass') {
      groups[region.kind].push({ cell: region.anchor, kind: region.kind, region: region.id });
    } else if (region.kind === 'river') {
      for (const mouth of region.cells) {
        const d = flowDir[mouth]!;
        if (d < 0 || water[mouth] !== 1) continue;
        const x = mouth % width;
        const y = (mouth - x) / width;
        const sx = x + D8_DX[d]!;
        const sy = y + D8_DY[d]!;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        if (water[sy * width + sx] !== 3) continue;
        // The most fertile land cell beside the mouth (lowest index on ties).
        let best = -1;
        for (let k = 0; k < 8; k += 1) {
          const nx = x + D8_DX[k]!;
          const ny = y + D8_DY[k]!;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (water[n] !== 0 || fertility[n]! < rules.mouthFertility) continue;
          if (
            best < 0 ||
            fertility[n]! > fertility[best]! ||
            (fertility[n] === fertility[best] && n < best)
          ) {
            best = n;
          }
        }
        if (best >= 0)
          groups['river-mouth'].push({ cell: best, kind: 'river-mouth', region: region.id });
      }
    }
  }
  const kept: Candidate[] = [];
  for (const kind of ['harbour', 'ford', 'pass', 'river-mouth'] as const) {
    groups[kind].sort((a, b) => a.cell - b.cell);
    for (const c of groups[kind]) {
      // A pass or ford anchor can sit in a lake or on the sea; routes only join dry ground.
      if (water[c.cell] !== 0 && water[c.cell] !== 1) continue;
      const x = c.cell % width;
      const y = (c.cell - x) / width;
      const crowded = kept.some((k) => {
        const kx = k.cell % width;
        return (
          Math.abs(kx - x) <= rules.mergeRadius &&
          Math.abs((k.cell - kx) / width - y) <= rules.mergeRadius
        );
      });
      if (!crowded) kept.push(c);
    }
  }
  return kept;
}

/** Routes, roads and travel costs of a world whose regions are built. */
export function planRoutes(
  cells: Shape & Pick<WorldCells, 'flowDir' | 'fertility'>,
  content: Pick<WorldgenContent, 'biomes'>,
  regions: readonly Region[],
): { travelCost: Uint8Array<ArrayBuffer>; roads: Uint8Array<ArrayBuffer>; routes: RouteGraph } {
  const { width, height, water } = cells;
  const size = width * height;
  const rules = TRAVEL_RULES;
  const travelCost = travelCosts(cells, content, regions);
  const roads = new Uint8Array(size);
  const landmass = landmasses(cells);
  const nodes: RouteNode[] = candidates(cells, regions).map((c, id) => ({
    id,
    cell: c.cell,
    kind: c.kind,
    region: c.region,
    landmass: landmass[c.cell]!,
  }));
  const edges: RouteEdge[] = [];
  if (nodes.length < 2) return { travelCost, roads, routes: { nodes, edges } };

  const landMask = new Uint8Array(size);
  const seaMask = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    if (water[i] === 0 || water[i] === 1) landMask[i] = 1;
    else if (water[i] === 3) seaMask[i] = 1;
  }
  const bigBudget = Math.max(rules.budget.expansions, rules.rescue.budget.expansions);
  const land = new PathSearch(width, height, travelCost, landMask, bigBudget);
  const hasHarbours = nodes.some((n) => n.kind === 'harbour');
  const sea = hasHarbours
    ? new PathSearch(width, height, travelCost, seaMask, rules.budget.expansions)
    : null;

  const distance2 = (p: RouteNode, q: RouteNode): number => {
    const dx = (p.cell % width) - (q.cell % width);
    const dy = Math.floor(p.cell / width) - Math.floor(q.cell / width);
    return dx * dx + dy * dy;
  };
  const nearest = (from: RouteNode, pool: readonly RouteNode[], count: number, reach2: number) =>
    pool
      .filter((n) => n.id !== from.id && distance2(from, n) <= reach2)
      .sort((p, q) => distance2(from, p) - distance2(from, q) || p.id - q.id)
      .slice(0, count);

  const link = (
    search: PathSearch,
    p: RouteNode,
    q: RouteNode,
    budget: Budget,
    isSea: boolean,
  ): boolean => {
    const found = search.find(p.cell, q.cell, budget);
    if (!found) return false;
    const [a, b] = p.id < q.id ? [p, q] : [q, p];
    const path = p.id < q.id ? found.path : found.path.reverse();
    edges.push({ a: a.id, b: b.id, cost: Math.round(found.cost), path, sea: isSea });
    return true;
  };

  // Land edges: each node to its nearest few on the same landmass.
  const tried = new Set<number>();
  const pairKey = (p: number, q: number) => Math.min(p, q) * nodes.length + Math.max(p, q);
  for (const node of nodes) {
    const pool = nodes.filter((n) => n.landmass === node.landmass);
    for (const other of nearest(node, pool, rules.landLinks, Infinity)) {
      const key = pairKey(node.id, other.id);
      if (tried.has(key)) continue;
      tried.add(key);
      link(land, node, other, rules.budget, false);
    }
  }

  // Sea edges: harbours to their nearest harbours.
  if (sea) {
    const harbours = nodes.filter((n) => n.kind === 'harbour');
    const seaTried = new Set<number>();
    for (const node of harbours) {
      const reach = rules.seaReach * rules.seaReach;
      for (const other of nearest(node, harbours, rules.seaLinks, reach)) {
        const key = pairKey(node.id, other.id);
        if (seaTried.has(key)) continue;
        seaTried.add(key);
        link(sea, node, other, rules.budget, true);
      }
    }
  }

  // Safety net: join the separate pieces of each landmass where a longer search can.
  const root = nodes.map((n) => n.id);
  const find = (n: number): number => {
    while (root[n] !== n) {
      root[n] = root[root[n]!]!;
      n = root[n]!;
    }
    return n;
  };
  for (const e of edges) if (!e.sea) root[find(e.a)] = find(e.b);
  const rescued = new Set<number>();
  for (const mass of new Set(nodes.map((n) => n.landmass))) {
    const members = nodes.filter((n) => n.landmass === mass);
    for (let attempt = 0; attempt < rules.rescue.tries; attempt += 1) {
      let best: [RouteNode, RouteNode] | null = null;
      let bestD = Infinity;
      for (const p of members) {
        for (const q of members) {
          if (p.id >= q.id || find(p.id) === find(q.id) || rescued.has(pairKey(p.id, q.id)))
            continue;
          const d = distance2(p, q);
          if (d < bestD) {
            bestD = d;
            best = [p, q];
          }
        }
      }
      if (!best) break;
      rescued.add(pairKey(best[0].id, best[1].id));
      if (link(land, best[0], best[1], rules.rescue.budget, false)) {
        root[find(best[0].id)] = find(best[1].id);
      }
    }
  }

  edges.sort((p, q) => p.a - q.a || p.b - q.b || Number(p.sea) - Number(q.sea));
  for (const e of edges) {
    if (e.sea) continue;
    for (const c of e.path) roads[c] = Math.min(255, roads[c]! + 1);
  }
  return { travelCost, roads, routes: { nodes, edges } };
}
