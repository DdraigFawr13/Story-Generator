// Named regions and strategic features (Phase 1, M1.5): ranges, rivers, forests,
// deserts, lakes, seas, islands and volcano clusters found as connected pieces of
// the finished layers, plus passes, fords, harbours, straits and bays. Pure and
// deterministic; only naming draws from the RNG stream.

import type { RngStream } from '../core/rng';
import {
  REGION_KINDS,
  type Id,
  type Region,
  type RegionKind,
  type WorldCells,
} from '../core/types';
import type { NameTables } from '../core/content-types';
import { D8_DX, D8_DY } from './grid';
import type { WorldgenContent } from './index';

/** Tunable thresholds. Minimum sizes are for a 256x256 map and scale with area. */
export const REGION_RULES = {
  /** Cells never get a region smaller than this, however small the map. */
  floorCells: 3,
  range: { minElevation: 800, landPercentile: 85, minCells: 12 },
  river: { minCells: 15 },
  forest: { minCells: 40 },
  desert: { minCells: 30 },
  lake: { minCells: 4 },
  sea: { minCells: 20 },
  /** Islands: land components of at least `minCells` and at most this share of all land. */
  island: { minCells: 3, maxLandShare: 0.03 },
  pass: {
    minElevation: 300,
    /** How far along an axis the ridge and the basin are looked for. */
    steps: 4,
    /** Ridge-rise and basin-drop margins (m), tried in turn until a world has a pass. */
    margins: [150, 100, 60],
    perRange: 3,
    /** A pass belongs to a range when a range cell is within this many cells. */
    rangeReach: 4,
    /** Passes away from every range need a ridge at least this much higher. */
    freeRise: 300,
  },
  ford: { flowPercentile: 60, maxDrop: 20, spacing: 12 },
  harbour: {
    radius: 4,
    shelterMin: 0.3,
    shelterMax: 0.6,
    shelterBest: 0.45,
    spacing: 10,
    cellsPerHarbour: 60,
    minHarbours: 2,
    mouthReach: 2,
    mouthBonus: 0.3,
    fertileAt: 40,
    fertileBonus: 0.1,
  },
  strait: { reach: 3 },
  bay: { radius: 6, landShare: 0.5, minCells: 15 },
  /** Names: tries before a roman numeral is appended, and the longest name kept. */
  nameTries: 20,
  maxNameLength: 24,
} as const;

const AREA_256 = 256 * 256;
/** Axis steps: N-S, E-W, NE-SW, NW-SE. The perpendicular of axis a is a ^ 1. */
const AXIS_DX: readonly number[] = [0, 1, 1, 1];
const AXIS_DY: readonly number[] = [1, 0, 1, -1];
const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

type Shape = Pick<WorldCells, 'width' | 'height'>;

function minCells(base: number, width: number, height: number): number {
  return Math.max(REGION_RULES.floorCells, Math.round((base * width * height) / AREA_256));
}

/** Connected components of `mask` (non-zero), each an ascending cell list, found in cell order. */
function components(shape: Shape, mask: ArrayLike<number>, eight: boolean): number[][] {
  const { width, height } = shape;
  const seen = new Uint8Array(width * height);
  const out: number[][] = [];
  const step = eight ? 1 : 2;
  for (let start = 0; start < seen.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const list: number[] = [start];
    seen[start] = 1;
    for (let k = 0; k < list.length; k += 1) {
      const at = list[k]!;
      const x = at % width;
      const y = (at - x) / width;
      for (let d = 0; d < 8; d += step) {
        const nx = x + D8_DX[d]!;
        const ny = y + D8_DY[d]!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const to = ny * width + nx;
        if (mask[to] && !seen[to]) {
          seen[to] = 1;
          list.push(to);
        }
      }
    }
    list.sort((a, b) => a - b);
    out.push(list);
  }
  return out;
}

/** Landmass number per cell (4-connected non-sea cells, lakes included); −1 on sea. */
export function landmasses(cells: Pick<WorldCells, 'width' | 'height' | 'water'>): Int32Array {
  const land = new Uint8Array(cells.water.length);
  for (let i = 0; i < land.length; i += 1) land[i] = cells.water[i] === 3 ? 0 : 1;
  const out = new Int32Array(land.length).fill(-1);
  components(cells, land, false).forEach((list, n) => {
    for (const cell of list) out[cell] = n;
  });
  return out;
}

/** The member of `list` nearest its centroid (ties: lowest index). */
function nearestCentroid(width: number, list: readonly number[]): number {
  let sx = 0;
  let sy = 0;
  for (const cell of list) {
    sx += cell % width;
    sy += Math.floor(cell / width);
  }
  const n = list.length;
  let best = list[0]!;
  let bestD = Infinity;
  for (const cell of list) {
    const dx = (cell % width) * n - sx;
    const dy = Math.floor(cell / width) * n - sy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.floor((p / 100) * (sorted.length - 1))]!;
}

/**
 * The axis (0 N-S, 1 E-W, 2 NE-SW, 3 NW-SE) along which `cell` is a saddle, or −1. A saddle is
 * at least `minElevation` high, has ground `margin` m higher within `steps` cells on both sides
 * along the axis (ridge), and ground `drop` m lower on both sides across it (basin).
 */
export function saddleAxis(
  cells: Pick<WorldCells, 'width' | 'height' | 'elevation'>,
  cell: number,
  margin: number,
  drop: number = margin,
): number {
  const { width, height, elevation } = cells;
  const rule = REGION_RULES.pass;
  const e = elevation[cell]!;
  if (e < rule.minElevation) return -1;
  const x = cell % width;
  const y = (cell - x) / width;
  /** Max (or min) elevation within the step range on one side, or null off the map. */
  const reach = (dx: number, dy: number, high: boolean): number | null => {
    let best: number | null = null;
    for (let s = 1; s <= rule.steps; s += 1) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) break;
      const v = elevation[ny * width + nx]!;
      if (best === null || (high ? v > best : v < best)) best = v;
    }
    return best;
  };
  for (let a = 0; a < 4; a += 1) {
    const p = a ^ 1;
    const r1 = reach(AXIS_DX[a]!, AXIS_DY[a]!, true);
    const r2 = reach(-AXIS_DX[a]!, -AXIS_DY[a]!, true);
    if (r1 === null || r2 === null || r1 < e + margin || r2 < e + margin) continue;
    const b1 = reach(AXIS_DX[p]!, AXIS_DY[p]!, false);
    const b2 = reach(-AXIS_DX[p]!, -AXIS_DY[p]!, false);
    if (b1 === null || b2 === null || b1 > e - drop || b2 > e - drop) continue;
    return a;
  }
  return -1;
}

/** Prefix sums per row of a 0/1 mask, so a disc count is one lookup per row. */
function rowPrefix(shape: Shape, mask: ArrayLike<number>): Int32Array {
  const { width, height } = shape;
  const out = new Int32Array(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * (width + 1) + x + 1] = out[y * (width + 1) + x]! + (mask[y * width + x] ? 1 : 0);
    }
  }
  return out;
}

/** Share of masked cells among the in-map cells within `radius` of (x, y). */
function discShare(shape: Shape, prefix: Int32Array, x: number, y: number, radius: number): number {
  const { width, height } = shape;
  let hit = 0;
  let total = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    let half = 0;
    while ((half + 1) * (half + 1) + dy * dy <= radius * radius) half += 1;
    const x0 = Math.max(0, x - half);
    const x1 = Math.min(width - 1, x + half);
    hit += prefix[ny * (width + 1) + x1 + 1]! - prefix[ny * (width + 1) + x0]!;
    total += x1 - x0 + 1;
  }
  return total === 0 ? 0 : hit / total;
}

interface Raw {
  kind: RegionKind;
  cells: number[];
  anchor: number;
  /** A sea that touches the map edge and is the largest: named as an ocean. */
  ocean?: boolean;
  /** River stems in mouth-to-source order. */
  stem?: number[];
}

/** Rivers: the main stem upstream of each mouth, following the strongest tributary. */
function riverStems(cells: WorldCells): number[][] {
  const { width, height, water, flowDir, flow } = cells;
  const size = width * height;
  const down = (i: number): number => {
    const d = flowDir[i]!;
    if (d < 0) return -2;
    const nx = (i % width) + D8_DX[d]!;
    const ny = Math.floor(i / width) + D8_DY[d]!;
    return nx < 0 || ny < 0 || nx >= width || ny >= height ? -1 : ny * width + nx;
  };
  const parent = new Int32Array(size).fill(-1);
  const mouths: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== 1) continue;
    const to = down(i);
    if (to === -1 || (to >= 0 && (water[to] === 2 || water[to] === 3))) mouths.push(i);
    else if (to >= 0 && water[to] === 1) {
      const p = parent[to]!;
      if (p < 0 || flow[i]! > flow[p]!) parent[to] = i;
    }
  }
  return mouths.map((mouth) => {
    const stem = [mouth];
    for (let at = parent[mouth]!; at >= 0; at = parent[at]!) stem.push(at);
    return stem;
  });
}

function findPasses(cells: WorldCells, rangeOf: Int32Array): Raw[] {
  const { width, height, elevation } = cells;
  const rule = REGION_RULES.pass;
  const size = width * height;
  for (const margin of rule.margins) {
    const mask = new Uint8Array(size);
    for (let i = 0; i < size; i += 1)
      if (cells.water[i] === 0 && saddleAxis(cells, i, margin) >= 0) mask[i] = 1;
    const kept: { raw: Raw; range: number }[] = [];
    for (const cluster of components(cells, mask, true)) {
      let anchor = cluster[0]!;
      for (const c of cluster) if (elevation[c]! < elevation[anchor]!) anchor = c;
      // Nearest range within reach (lowest range number wins ties).
      const ax = anchor % width;
      const ay = (anchor - ax) / width;
      let range = -1;
      for (let dy = -rule.rangeReach; dy <= rule.rangeReach; dy += 1) {
        for (let dx = -rule.rangeReach; dx <= rule.rangeReach; dx += 1) {
          const x = ax + dx;
          const y = ay + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const r = rangeOf[y * width + x]!;
          if (r >= 0 && (range < 0 || r < range)) range = r;
        }
      }
      if (range < 0 && saddleAxis(cells, anchor, rule.freeRise, margin) < 0) continue;
      kept.push({ raw: { kind: 'pass', cells: cluster, anchor }, range });
    }
    // At most `perRange` per range, lowest first; unattached passes are all kept.
    kept.sort(
      (a, b) => elevation[a.raw.anchor]! - elevation[b.raw.anchor]! || a.raw.anchor - b.raw.anchor,
    );
    const perRange = new Map<number, number>();
    const passes = kept.filter(({ range }) => {
      if (range < 0) return true;
      const n = perRange.get(range) ?? 0;
      perRange.set(range, n + 1);
      return n < rule.perRange;
    });
    if (passes.length > 0) return passes.map((p) => p.raw);
  }
  return [];
}

/** Greedy spacing: accepts `order` entries not within `spacing` (Chebyshev) of an accepted one. */
function spaced(width: number, taken: number[], cell: number, spacing: number): boolean {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return taken.every(
    (t) => Math.max(Math.abs((t % width) - x), Math.abs(Math.floor(t / width) - y)) >= spacing,
  );
}

function findFords(cells: WorldCells, order: number[]): Raw[] {
  const { width, height, water, flow, flowDir, elevation } = cells;
  const rule = REGION_RULES.ford;
  const flows: number[] = [];
  for (let i = 0; i < water.length; i += 1) if (water[i] === 1) flows.push(flow[i]!);
  const limit = percentile(flows, rule.flowPercentile);
  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && water[y * width + x] === 0;
  const candidate = (i: number): boolean => {
    if (water[i] !== 1 || flow[i]! > limit) return false;
    const d = flowDir[i]!;
    if (d < 0) return false;
    const x = i % width;
    const y = (i - x) / width;
    const tx = x + D8_DX[d]!;
    const ty = y + D8_DY[d]!;
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
    if (Math.abs(elevation[i]! - elevation[ty * width + tx]!) > rule.maxDrop) return false;
    for (let a = 0; a < 4; a += 1) {
      if (isLand(x + AXIS_DX[a]!, y + AXIS_DY[a]!) && isLand(x - AXIS_DX[a]!, y - AXIS_DY[a]!)) {
        return true;
      }
    }
    return false;
  };
  const taken: number[] = [];
  for (const i of order) {
    if (candidate(i) && spaced(width, taken, i, rule.spacing)) taken.push(i);
  }
  return taken.map((cell) => ({ kind: 'ford', cells: [cell], anchor: cell }));
}

function findHarbours(cells: WorldCells, seaLabel: Int32Array): Raw[] {
  const { width, height, water, fertility } = cells;
  const rule = REGION_RULES.harbour;
  const size = width * height;
  const sea = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) sea[i] = water[i] === 3 ? 1 : 0;
  const prefix = rowPrefix(cells, sea);
  const mouth = new Uint8Array(size);
  for (const stem of riverStems(cells)) mouth[stem[0]!] = 1;

  interface Site {
    cell: number;
    score: number;
    windowed: boolean;
    ranked: boolean;
    seas: number[];
  }
  const sites: Site[] = [];
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    const seas: number[] = [];
    let ranked = false;
    for (let d = 0; d < 8; d += 2) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const to = ny * width + nx;
      if (water[to] !== 3) continue;
      seas.push(to);
      if (seaLabel[to]! >= 0) ranked = true;
    }
    if (seas.length === 0) continue;
    const shelter = discShare(cells, prefix, x, y, rule.radius);
    let score = 1 - Math.abs(shelter - rule.shelterBest);
    for (let dy = -rule.mouthReach; dy <= rule.mouthReach; dy += 1) {
      for (let dx = -rule.mouthReach; dx <= rule.mouthReach; dx += 1) {
        const mx = x + dx;
        const my = y + dy;
        if (mx >= 0 && my >= 0 && mx < width && my < height && mouth[my * width + mx]) {
          score += rule.mouthBonus;
          dy = rule.mouthReach;
          break;
        }
      }
    }
    if (fertility[i]! >= rule.fertileAt) score += rule.fertileBonus;
    sites.push({
      cell: i,
      score,
      windowed: shelter >= rule.shelterMin && shelter <= rule.shelterMax,
      ranked,
      seas,
    });
  }
  const byScore = (a: Site, b: Site) => b.score - a.score || a.cell - b.cell;
  const cap = Math.max(rule.minHarbours, Math.floor(sites.length / rule.cellsPerHarbour));
  const chosen: Site[] = [];
  for (const site of sites.filter((s) => s.windowed && s.ranked).sort(byScore)) {
    if (chosen.length >= cap) break;
    if (
      spaced(
        width,
        chosen.map((c) => c.cell),
        site.cell,
        rule.spacing,
      )
    )
      chosen.push(site);
  }
  if (chosen.length === 0 && sites.length > 0) {
    // No sheltered spot: the best coastal cell still makes a (poor) harbour.
    const best = sites.slice().sort((a, b) => Number(b.ranked) - Number(a.ranked) || byScore(a, b));
    chosen.push(best[0]!);
  }
  return chosen
    .sort((a, b) => a.cell - b.cell)
    .map((s) => ({
      kind: 'harbour',
      cells: [s.cell, ...s.seas].sort((a, b) => a - b),
      anchor: s.cell,
    }));
}

function findStraits(cells: WorldCells, landmass: Int32Array): Raw[] {
  const { width, height, water } = cells;
  const reach = REGION_RULES.strait.reach;
  const mask = new Uint8Array(width * height);
  /** Landmass at the first non-sea cell within `reach` steps, or −1. */
  const landAt = (x: number, y: number, dx: number, dy: number): number => {
    for (let s = 1; s <= reach; s += 1) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return -1;
      const m = landmass[ny * width + nx]!;
      if (m >= 0) return m;
    }
    return -1;
  };
  const openSea = (x: number, y: number, dx: number, dy: number): boolean => {
    for (let s = 1; s <= reach; s += 1) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
      if (water[ny * width + nx] !== 3) return false;
    }
    return true;
  };
  for (let i = 0; i < mask.length; i += 1) {
    if (water[i] !== 3) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let a = 0; a < 4; a += 1) {
      const p = a ^ 1;
      const l1 = landAt(x, y, AXIS_DX[a]!, AXIS_DY[a]!);
      const l2 = landAt(x, y, -AXIS_DX[a]!, -AXIS_DY[a]!);
      if (l1 < 0 || l2 < 0 || l1 === l2) continue;
      if (openSea(x, y, AXIS_DX[p]!, AXIS_DY[p]!) && openSea(x, y, -AXIS_DX[p]!, -AXIS_DY[p]!)) {
        mask[i] = 1;
        break;
      }
    }
  }
  return components(cells, mask, true).map((list) => ({
    kind: 'strait',
    cells: list,
    anchor: nearestCentroid(width, list),
  }));
}

function findBays(cells: WorldCells, straits: Raw[]): Raw[] {
  const { width, height, water } = cells;
  const rule = REGION_RULES.bay;
  const size = width * height;
  const land = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) land[i] = water[i] === 3 ? 0 : 1;
  const prefix = rowPrefix(cells, land);
  const inStrait = new Uint8Array(size);
  for (const s of straits) for (const c of s.cells) inStrait[c] = 1;
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== 3 || inStrait[i]) continue;
    const x = i % width;
    if (discShare(cells, prefix, x, (i - x) / width, rule.radius) >= rule.landShare) mask[i] = 1;
  }
  const least = minCells(rule.minCells, width, height);
  return components(cells, mask, true)
    .filter((list) => list.length >= least)
    .map((list) => ({ kind: 'bay', cells: list, anchor: nearestCentroid(width, list) }));
}

/** Finds every region and feature of a generated world, names them, and numbers them 1..n. */
export function buildRegions(
  cells: WorldCells,
  content: Pick<WorldgenContent, 'biomes' | 'names'>,
  rng: RngStream,
): Region[] {
  const { width, height, water, elevation } = cells;
  const size = width * height;
  const raws: Raw[] = [];
  const rules = REGION_RULES;

  // Ranges: connected high land.
  const landElevations: number[] = [];
  for (let i = 0; i < size; i += 1) if (water[i] === 0) landElevations.push(elevation[i]!);
  const high = Math.max(
    rules.range.minElevation,
    percentile(landElevations, rules.range.landPercentile),
  );
  const highMask = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) highMask[i] = water[i] === 0 && elevation[i]! >= high ? 1 : 0;
  const rangeOf = new Int32Array(size).fill(-1);
  let rangeCount = 0;
  for (const list of components(cells, highMask, true)) {
    if (list.length < minCells(rules.range.minCells, width, height)) continue;
    let anchor = list[0]!;
    for (const c of list) if (elevation[c]! > elevation[anchor]!) anchor = c;
    for (const c of list) rangeOf[c] = rangeCount;
    rangeCount += 1;
    raws.push({ kind: 'range', cells: list, anchor });
  }

  // Rivers: long main stems.
  const stems = riverStems(cells).filter(
    (s) => s.length >= minCells(rules.river.minCells, width, height),
  );
  for (const stem of stems) {
    raws.push({
      kind: 'river',
      cells: stem.slice().sort((a, b) => a - b),
      anchor: stem[stem.length >> 1]!,
      stem,
    });
  }

  // Forests and deserts by biome.
  const forestMask = new Uint8Array(size);
  const desertMask = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== 0) continue;
    const biome = content.biomes[cells.biome[i]!];
    if (biome?.forest) forestMask[i] = 1;
    else if (biome?.id === 'desert') desertMask[i] = 1;
  }
  for (const [kind, mask, base] of [
    ['forest', forestMask, rules.forest.minCells],
    ['desert', desertMask, rules.desert.minCells],
  ] as const) {
    for (const list of components(cells, mask, true)) {
      if (list.length >= minCells(base, width, height)) {
        raws.push({ kind, cells: list, anchor: nearestCentroid(width, list) });
      }
    }
  }

  // Lakes.
  const lakeMask = water.map((w) => (w === 2 ? 1 : 0));
  for (const list of components(cells, lakeMask, true)) {
    if (list.length >= minCells(rules.lake.minCells, width, height)) {
      raws.push({ kind: 'lake', cells: list, anchor: nearestCentroid(width, list) });
    }
  }

  // Seas: 4-connected; the largest one touching the map edge is the ocean.
  const seaMask = water.map((w) => (w === 3 ? 1 : 0));
  const seaLabel = new Int32Array(size).fill(-1);
  const seas = components(cells, seaMask, false).filter(
    (list) => list.length >= minCells(rules.sea.minCells, width, height),
  );
  let ocean = -1;
  seas.forEach((list, n) => {
    for (const c of list) seaLabel[c] = n;
    const edge = list.some(
      (c) => c % width === 0 || c % width === width - 1 || c < width || c >= size - width,
    );
    if (edge && (ocean < 0 || list.length > seas[ocean]!.length)) ocean = n;
  });
  seas.forEach((list, n) => {
    raws.push({
      kind: 'sea',
      cells: list,
      anchor: nearestCentroid(width, list),
      ...(n === ocean ? { ocean: true } : {}),
    });
  });

  // Islands: small landmasses. Anything bigger is a continent, not a region.
  const landmass = landmasses(cells);
  const masses = components(
    cells,
    landmass.map((m) => (m >= 0 ? 1 : 0)),
    false,
  );
  const totalLand = masses.reduce((n, list) => n + list.length, 0);
  for (const list of masses) {
    if (
      list.length >= rules.island.minCells &&
      list.length <= totalLand * rules.island.maxLandShare
    ) {
      raws.push({ kind: 'island', cells: list, anchor: nearestCentroid(width, list) });
    }
  }

  // Volcano clusters.
  for (const list of components(cells, cells.volcano, true)) {
    let anchor = list[0]!;
    for (const c of list) if (elevation[c]! > elevation[anchor]!) anchor = c;
    raws.push({ kind: 'volcano', cells: list, anchor });
  }

  // Strategic features.
  raws.push(...findPasses(cells, rangeOf));
  const fordOrder: number[] = [];
  const onStem = new Uint8Array(size);
  for (const stem of stems) {
    for (const c of stem) {
      fordOrder.push(c);
      onStem[c] = 1;
    }
  }
  for (let i = 0; i < size; i += 1) if (water[i] === 1 && !onStem[i]) fordOrder.push(i);
  raws.push(...findFords(cells, fordOrder));
  raws.push(...findHarbours(cells, seaLabel));
  const straits = findStraits(cells, landmass);
  raws.push(...straits, ...findBays(cells, straits));

  // Stable order: kind, then anchor.
  const kindIndex = new Map<RegionKind, number>(REGION_KINDS.map((k, n) => [k, n]));
  raws.sort((a, b) => kindIndex.get(a.kind)! - kindIndex.get(b.kind)! || a.anchor - b.anchor);

  // Naming, in id order. Rivers come before fords, so a ford can borrow its river's name.
  const used = new Set<string>();
  const riverRoot = new Map<number, string>();
  return raws.map((raw, n) => {
    const id: Id = n + 1;
    let stem: string | undefined;
    if (raw.kind === 'river') {
      stem = nameStem(rng, content.names);
      for (const c of raw.stem!) riverRoot.set(c, stem);
    } else if (raw.kind === 'ford') {
      stem = riverRoot.get(raw.anchor);
    }
    const name = nameRegion(raw.ocean ? 'ocean' : raw.kind, rng, content.names, used, stem);
    return { id, kind: raw.kind, name, cells: raw.cells, anchor: raw.anchor };
  });
}

/** A place-name stem such as "Brannock" or "Kell": start, optional middle, optional end. */
export function nameStem(rng: RngStream, names: NameTables): string {
  const start = rng.pick(names.starts);
  const shape = rng.int(10);
  // Shapes: bare start 30%, start + end 40%, start + middle + end 30%.
  if (shape < 3) return start;
  if (shape < 7) return start + rng.pick(names.ends);
  return start + rng.pick(names.middles) + rng.pick(names.ends);
}

/**
 * A unique name for a region of `kind` ('ocean' for the edge-touching sea). Fills a content
 * pattern with a stem (the given one, or a fresh one) and an adjective; after the tries run out,
 * a roman numeral is added. `used` collects every name handed out.
 */
export function nameRegion(
  kind: RegionKind | 'ocean',
  rng: RngStream,
  names: NameTables,
  used: Set<string>,
  stem?: string,
): string {
  const patterns = names.patterns[kind];
  if (!patterns || patterns.length === 0) throw new Error(`No name patterns for "${kind}".`);
  let name = '';
  for (let tries = 0; tries < REGION_RULES.nameTries; tries += 1) {
    name = rng
      .pick(patterns)
      .replace('{n}', stem ?? nameStem(rng, names))
      .replace('{a}', rng.pick(names.adjectives));
    if (name.length <= REGION_RULES.maxNameLength && !used.has(name)) {
      used.add(name);
      return name;
    }
  }
  for (const numeral of ROMAN) {
    if (!used.has(`${name} ${numeral}`)) {
      used.add(`${name} ${numeral}`);
      return `${name} ${numeral}`;
    }
  }
  used.add(name);
  return name;
}
