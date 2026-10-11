// Aura (Phase 1, M1.3): a faint magical background everywhere, and a few strong
// spots (high peaks, river heads, deep old forest, hot springs beside volcanoes)
// that Phase 2 can promote to legendary places. Each spot fades out over a few cells.

import type { RngStream } from '../core/rng';
import type { AuraSpot } from '../core/types';
import { D8_DX, D8_DY } from './grid';
import { fractalNoise } from './noise';
import { WATER_LAND, WATER_RIVER, WATER_SEA } from './water';

/** Background aura is fractal noise mapped to 0..BASE_AURA_MAX. */
const BASE_AURA_MAX = 15;
const BASE_NOISE = { scale: 16, octaves: 3, persistence: 0.5 };
/** A spot's own aura is rolled in this range; it fades by AURA_FALLOFF per cell out to AURA_RADIUS. */
const SPOT_AURA_MIN = 70;
const SPOT_AURA_MAX = 100;
const AURA_FALLOFF = 20;
const AURA_RADIUS = 3;
/** Peaks need this height (m); river heads this height; old forest this depth (cells from any other biome). */
const PEAK_MIN_ELEVATION = 2500;
const SPRING_MIN_ELEVATION = 800;
const OLD_FOREST_DEPTH = 4;
/** Minimum spacing (cells) between spots of the same kind. */
const SPACING: Record<AuraSpot['kind'], number> = {
  peak: 6,
  spring: 6,
  'old-forest': 8,
  'hot-spring': 0,
};
/** At most one spot per this many map cells (about 25 on 256x256). */
const CELLS_PER_SPOT = 2500;
/** Hot springs lie this close to their volcano. */
const HOT_SPRING_MIN = 1;
const HOT_SPRING_MAX = 3;
/** Picking gives up after this many tries per wanted spot. */
const TRIES_PER_SPOT = 30;

function farEnough(
  width: number,
  chosen: readonly number[],
  cell: number,
  spacing: number,
): boolean {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return chosen.every((other) => {
    const dx = (other % width) - x;
    const dy = Math.floor(other / width) - y;
    return dx * dx + dy * dy >= spacing * spacing;
  });
}

/** Picks up to `count` cells from `candidates` at random, keeping `spacing` cells apart. */
function pickSpaced(
  width: number,
  candidates: readonly number[],
  count: number,
  spacing: number,
  rng: RngStream,
): number[] {
  const chosen: number[] = [];
  if (candidates.length === 0) return chosen;
  for (let tries = 0; tries < count * TRIES_PER_SPOT && chosen.length < count; tries += 1) {
    const cell = candidates[rng.int(candidates.length)]!;
    if (!chosen.includes(cell) && farEnough(width, chosen, cell, spacing)) chosen.push(cell);
  }
  return chosen;
}

export interface AuraResult {
  aura: Uint8Array;
  auraSpots: AuraSpot[];
}

/**
 * `forest` is 1 for cells whose biome is a forest. `volcano` marks volcano cells.
 * Order of random draws is fixed (noise seed, springs, forests, hot springs, strengths).
 */
export function generateAura(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  water: ArrayLike<number>,
  flowDir: ArrayLike<number>,
  forest: ArrayLike<number>,
  volcano: ArrayLike<number>,
  rng: RngStream,
): AuraResult {
  const size = width * height;
  const noiseSeed = rng.int(0x1_0000_0000);
  const aura = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = (fractalNoise(noiseSeed, x, y, BASE_NOISE) + 1) / 2;
      aura[y * width + x] = Math.max(0, Math.min(BASE_AURA_MAX, Math.round(n * BASE_AURA_MAX)));
    }
  }

  let landCells = 0;
  for (let i = 0; i < size; i += 1) if (water[i] !== WATER_SEA) landCells += 1;
  if (landCells === 0) return { aura, auraSpots: [] };
  const cap = Math.max(1, Math.floor(size / CELLS_PER_SPOT));
  const quota = Math.max(1, Math.round(cap / 4));

  // Peaks: local maxima, highest first (no randomness needed).
  const peakCells: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (water[i] === WATER_SEA || elevation[i]! < PEAK_MIN_ELEVATION) continue;
    const x = i % width;
    const y = (i - x) / width;
    let top = true;
    for (let d = 0; d < 8 && top; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      // Ties go to the lower index so a flat summit yields one peak.
      if (elevation[n]! > elevation[i]! || (elevation[n] === elevation[i] && n < i)) top = false;
    }
    if (top) peakCells.push(i);
  }
  peakCells.sort((a, b) => elevation[b]! - elevation[a]! || a - b);
  const peaks: number[] = [];
  for (const cell of peakCells) {
    if (peaks.length >= quota) break;
    if (farEnough(width, peaks, cell, SPACING.peak)) peaks.push(cell);
  }

  // Springs: river heads, i.e. river cells that no other river cell drains into.
  const fed = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const dir = flowDir[i]!;
    if (water[i] !== WATER_RIVER || dir < 0) continue;
    const x = (i % width) + D8_DX[dir]!;
    const y = Math.floor(i / width) + D8_DY[dir]!;
    if (x >= 0 && y >= 0 && x < width && y < height) fed[y * width + x] = 1;
  }
  const heads: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (water[i] === WATER_RIVER && !fed[i] && elevation[i]! >= SPRING_MIN_ELEVATION) heads.push(i);
  }
  const springs = pickSpaced(width, heads, quota, SPACING.spring, rng);

  // Old forests: forest cells at least OLD_FOREST_DEPTH cells from any non-forest cell.
  const depth = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i += 1) {
    if (!forest[i]) {
      depth[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    if (depth[i]! >= OLD_FOREST_DEPTH) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (depth[n] === -1) {
        depth[n] = depth[i]! + 1;
        queue[tail++] = n;
      }
    }
  }
  const deepForest: number[] = [];
  for (let i = 0; i < size; i += 1)
    if (forest[i] && (depth[i] === -1 || depth[i]! >= OLD_FOREST_DEPTH)) deepForest.push(i);
  const oldForests = pickSpaced(width, deepForest, quota, SPACING['old-forest'], rng);

  // Hot springs: one per volcano, on land 1-3 cells away.
  const hotSprings: number[] = [];
  for (let v = 0; v < size; v += 1) {
    if (!volcano[v]) continue;
    const vx = v % width;
    const vy = (v - vx) / width;
    const options: number[] = [];
    for (let dy = -HOT_SPRING_MAX; dy <= HOT_SPRING_MAX; dy += 1) {
      for (let dx = -HOT_SPRING_MAX; dx <= HOT_SPRING_MAX; dx += 1) {
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        const x = vx + dx;
        const y = vy + dy;
        if (ring < HOT_SPRING_MIN || ring > HOT_SPRING_MAX) continue;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (water[y * width + x] === WATER_LAND) options.push(y * width + x);
      }
    }
    if (options.length > 0) hotSprings.push(options[rng.int(options.length)]!);
  }

  // Share the cap between the kinds in turn, so no kind crowds the others out.
  const lists: [AuraSpot['kind'], number[]][] = [
    ['peak', peaks],
    ['spring', springs],
    ['old-forest', oldForests],
    ['hot-spring', hotSprings],
  ];
  const spots: AuraSpot[] = [];
  for (let round = 0; spots.length < cap; round += 1) {
    let added = false;
    for (const [kind, cells] of lists) {
      if (round < cells.length && spots.length < cap) {
        spots.push({ cell: cells[round]!, kind, aura: rng.between(SPOT_AURA_MIN, SPOT_AURA_MAX) });
        added = true;
      }
    }
    if (!added) break;
  }
  spots.sort((a, b) => a.cell - b.cell);

  for (const spot of spots) {
    const sx = spot.cell % width;
    const sy = (spot.cell - sx) / width;
    for (let dy = -AURA_RADIUS; dy <= AURA_RADIUS; dy += 1) {
      for (let dx = -AURA_RADIUS; dx <= AURA_RADIUS; dx += 1) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const value = spot.aura - AURA_FALLOFF * Math.max(Math.abs(dx), Math.abs(dy));
        const at = y * width + x;
        if (value > aura[at]!) aura[at] = value;
      }
    }
  }
  return { aura, auraSpots: spots };
}
