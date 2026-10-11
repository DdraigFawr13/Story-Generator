// Habitat (Phase 1, M1.3): fertility is what the ground can feed (Phase 2
// carrying capacity); wildness is how untamed it is (Phase 2 beast lairs).
// Plain arrays in and out so tests can use tiny fixtures.

import type { ContentBundle } from '../core/content-types';
import { D8_DX, D8_DY } from './grid';
import { WATER_LAKE, WATER_RIVER, WATER_SEA } from './water';

export type HabitatContent = Pick<ContentBundle, 'biomes'>;

/** Rainfall (mm/yr) -> crop factor: too dry or waterlogged lowers yields. Linear between points. */
const RAIN_FACTOR: readonly (readonly [number, number])[] = [
  [0, 0.15],
  [250, 0.4],
  [600, 1],
  [1500, 1],
  [3000, 0.6],
  [6000, 0.5],
];
/** Temperature (C) above which crops grow. */
const GROWING_TEMP = 6;
/** Share of the year above the growing temperature that gives a full season. */
const FULL_SEASON_SHARE = 0.5;
/** Bonus fertility on floodplains and on land beside a river. */
const FLOODPLAIN_BONUS = 25;
const RIVER_BONUS = 8;
/** Fertility at or above this counts as farmland for the wildness distance. */
export const FARMLAND_FERTILITY = 60;

/** Wildness weights (sum to 100): farmland distance, rough ground, biome, old-forest aura. */
const WILD_DISTANCE_WEIGHT = 35;
const WILD_ROUGH_WEIGHT = 20;
const WILD_BIOME_WEIGHT = 35;
const WILD_AURA_WEIGHT = 10;
/** Distance (cells) from farmland at which land counts as fully remote. */
const FAR_FROM_FARMLAND = 5;
/** Height difference (m) to a neighbour that counts as fully rough. */
const FULL_ROUGHNESS = 400;

function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i]!;
    if (x <= x1) {
      const [x0, y0] = points[i - 1]!;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1]![1];
}

/** Share of the year above GROWING_TEMP, with temperature swinging linearly from winter low to summer high. */
function growingShare(summer: number, winter: number): number {
  if (winter >= GROWING_TEMP) return 1;
  if (summer <= GROWING_TEMP) return 0;
  return (summer - GROWING_TEMP) / (summer - winter);
}

export function computeHabitat(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  tempSummer: ArrayLike<number>,
  tempWinter: ArrayLike<number>,
  rainfall: ArrayLike<number>,
  water: ArrayLike<number>,
  floodplain: ArrayLike<number>,
  biome: ArrayLike<number>,
  aura: ArrayLike<number>,
  content: HabitatContent,
): { fertility: Uint8Array; wildness: Uint8Array } {
  const size = width * height;
  const fertility = new Uint8Array(size);
  const wildness = new Uint8Array(size);

  for (let i = 0; i < size; i += 1) {
    // Sea and lakes grow nothing; river cells are farmed banks and keep their land biome.
    if (water[i] === WATER_SEA || water[i] === WATER_LAKE) continue;
    const def = content.biomes[biome[i]!]!;
    const season = Math.min(1, growingShare(tempSummer[i]!, tempWinter[i]!) / FULL_SEASON_SHARE);
    let value = def.fertility * interpolate(RAIN_FACTOR, rainfall[i]!) * season;
    if (floodplain[i]) value += FLOODPLAIN_BONUS;
    else if (water[i] === WATER_RIVER || besideWater(width, height, water, i, WATER_RIVER)) {
      value += RIVER_BONUS;
    }
    fertility[i] = Math.max(0, Math.min(100, Math.round(value)));
  }

  // Distance to farmland: multi-source BFS over the whole grid.
  const distance = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i += 1) {
    if (fertility[i]! >= FARMLAND_FERTILITY) {
      distance[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    if (distance[i]! >= FAR_FROM_FARMLAND) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (distance[n] === -1) {
        distance[n] = distance[i]! + 1;
        queue[tail++] = n;
      }
    }
  }

  for (let i = 0; i < size; i += 1) {
    if (water[i] === WATER_SEA) continue;
    const def = content.biomes[biome[i]!]!;
    const x = i % width;
    const y = (i - x) / width;
    let rough = 0;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (water[n] === WATER_SEA) continue;
      rough = Math.max(rough, Math.abs(elevation[n]! - elevation[i]!));
    }
    const far = distance[i] === -1 ? 1 : distance[i]! / FAR_FROM_FARMLAND;
    let value =
      WILD_DISTANCE_WEIGHT * far +
      WILD_ROUGH_WEIGHT * Math.min(1, rough / FULL_ROUGHNESS) +
      (WILD_BIOME_WEIGHT * def.wildness) / 100;
    if (def.forest) value += (WILD_AURA_WEIGHT * aura[i]!) / 100;
    // Lakes are open water, never wild land.
    if (water[i] === WATER_LAKE) value = 0;
    wildness[i] = Math.max(0, Math.min(100, Math.round(value)));
  }
  return { fertility, wildness };
}

function besideWater(
  width: number,
  height: number,
  water: ArrayLike<number>,
  i: number,
  kind: number,
): boolean {
  const x = i % width;
  const y = (i - x) / width;
  for (let d = 0; d < 8; d += 1) {
    const nx = x + D8_DX[d]!;
    const ny = y + D8_DY[d]!;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (water[ny * width + nx] === kind) return true;
  }
  return false;
}
