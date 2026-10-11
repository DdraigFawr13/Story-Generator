// Climate (Phase 1, M1.2): sea distance, seasonal temperature, rainfall from a
// prevailing-wind moisture sweep, and per-cell weather risks. The map spans
// latitude 70N (top row) to 10S (bottom row), so the north is harsh and the
// south lush by construction. Functions take plain arrays so tests can use
// tiny fixtures; generateClimate wires them together.

import type { RngStream } from '../core/rng';
import type { WorldParams } from '../core/types';
import { neighbour } from './grid';
import { fractalNoise } from './noise';

export const TOP_LATITUDE = 70;
export const BOTTOM_LATITUDE = -10;
/** Temperature drop per metre of elevation above sea level (6.5 C per km). */
const LAPSE_PER_METRE = 6.5 / 1000;
/** Amplitude in C of the temperature noise. */
const TEMP_NOISE = 2;
const MIN_TEMP = -60;
const MAX_TEMP = 50;

/** Moisture (mm/yr equivalent) an air column holds at most, and gains per ocean cell. */
const MOISTURE_CAP = 10000;
const OCEAN_PICKUP = 2500;
/** Share of the moisture that falls on each land cell, and the share of that rain evaporated back. */
const LAND_RAIN_SHARE = 0.1;
const LAND_RECYCLE = 0.9;
/** Orographic rain (mm) per metre of rise from the previous cell, plus extra moisture wrung out beyond it. */
const OROGRAPHIC_RAIN = 2.2;
const OROGRAPHIC_EXTRA_LOSS = 3;
/** Rain over open sea as a share of the air's moisture. */
const OCEAN_RAIN_SHARE = 0.25;
/** Box-filter passes down each column to hide row stripes. */
const SMOOTH_PASSES = 3;
const MAX_RAINFALL = 6000;

/** Rainfall multiplier by absolute latitude: wet tropics, dry subtropics, moderate temperate, dry pole. */
const RAIN_BELTS: readonly (readonly [number, number])[] = [
  [0, 1.7],
  [10, 1.5],
  [20, 0.8],
  [28, 0.5],
  [40, 0.85],
  [50, 1.0],
  [60, 0.85],
  [70, 0.4],
];

export function latitudeOfRow(y: number, height: number): number {
  return TOP_LATITUDE + ((BOTTOM_LATITUDE - TOP_LATITUDE) * y) / Math.max(1, height - 1);
}

/** Direction the prevailing wind blows along a row: +1 toward the east, −1 toward the west. */
export function windDirection(y: number, height: number): 1 | -1 {
  const lat = Math.abs(latitudeOfRow(y, height));
  return lat >= 30 && lat <= 60 ? 1 : -1;
}

function beltFactor(absLat: number): number {
  for (let b = 1; b < RAIN_BELTS.length; b += 1) {
    const [l1, f1] = RAIN_BELTS[b]!;
    if (absLat <= l1 || b === RAIN_BELTS.length - 1) {
      const [l0, f0] = RAIN_BELTS[b - 1]!;
      const t = Math.min(1, Math.max(0, (absLat - l0) / (l1 - l0)));
      return f0 + (f1 - f0) * t;
    }
  }
  return 1;
}

/** Multi-source BFS from ocean cells (8 neighbours): cells to the nearest sea, 0 at sea. */
export function computeSeaDistance(width: number, height: number, ocean: Uint8Array): Uint16Array {
  const size = width * height;
  const distance = new Uint16Array(size).fill(65535);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i += 1) {
    if (ocean[i]) {
      distance[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    if (distance[i]! >= 65535) continue;
    for (let d = 0; d < 8; d += 1) {
      const n = neighbour(width, height, i, d);
      if (n >= 0 && distance[n] === 65535) {
        distance[n] = distance[i]! + 1;
        queue[tail++] = n;
      }
    }
  }
  return distance;
}

export interface Temperatures {
  tempSummer: Int8Array;
  tempWinter: Int8Array;
}

/** Seasonal highs and lows from latitude, continentality, elevation lapse and noise. */
export function computeTemperature(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  seaDistance: Uint16Array,
  noiseSeed: number,
  temperatureShift: number,
): Temperatures {
  const tempSummer = new Int8Array(width * height);
  const tempWinter = new Int8Array(width * height);
  const noise = { scale: Math.max(8, width / 4), octaves: 3, persistence: 0.5 };
  for (let y = 0; y < height; y += 1) {
    const lat = latitudeOfRow(y, height);
    const mean = 28 - 0.0075 * lat * lat;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      // Inland air swings wider between seasons than air near the sea.
      const inland = Math.min(1, seaDistance[i]! / (width / 8));
      const half = (2 + 0.18 * Math.abs(lat)) * (0.6 + 0.8 * inland);
      const lapse = Math.max(0, elevation[i]!) * LAPSE_PER_METRE;
      const base =
        mean - lapse + temperatureShift + fractalNoise(noiseSeed, x, y, noise) * TEMP_NOISE;
      tempSummer[i] = Math.min(MAX_TEMP, Math.max(MIN_TEMP, Math.round(base + half)));
      tempWinter[i] = Math.min(MAX_TEMP, Math.max(MIN_TEMP, Math.round(base - half)));
    }
  }
  return { tempSummer, tempWinter };
}

/**
 * Rainfall in mm/yr. Each row is swept along its prevailing wind: air gains
 * moisture over sea, loses a share as rain over land and a large amount on
 * rising ground, so lee sides are dry.
 */
export function computeRainfall(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  ocean: Uint8Array,
  rainfallScale: number,
): Uint16Array {
  const size = width * height;
  let rain = new Float64Array(size);
  for (let y = 0; y < height; y += 1) {
    const wind = windDirection(y, height);
    const belt = beltFactor(Math.abs(latitudeOfRow(y, height)));
    let moisture = 0;
    let previous = 0;
    for (let step = 0; step < width; step += 1) {
      const x = wind > 0 ? step : width - 1 - step;
      const i = y * width + x;
      let fallen: number;
      // Inland basins below sea level evaporate like the sea.
      if (ocean[i] || elevation[i]! <= 0) {
        moisture = Math.min(MOISTURE_CAP, moisture + OCEAN_PICKUP);
        fallen = moisture * OCEAN_RAIN_SHARE;
        previous = 0;
      } else {
        const here = Math.max(0, elevation[i]!);
        const rise = Math.max(0, here - previous);
        const base = moisture * LAND_RAIN_SHARE;
        const orographic = Math.min(moisture - base, rise * OROGRAPHIC_RAIN);
        fallen = base + orographic;
        const lost = Math.min(moisture, fallen + rise * OROGRAPHIC_EXTRA_LOSS);
        moisture = moisture - lost + fallen * LAND_RECYCLE;
        previous = here;
      }
      rain[i] = fallen * belt;
    }
  }
  // Smooth down each column so row-by-row sweeps don't leave stripes.
  for (let pass = 0; pass < SMOOTH_PASSES; pass += 1) {
    const next = new Float64Array(size);
    for (let y = 0; y < height; y += 1) {
      const up = Math.max(0, y - 1);
      const down = Math.min(height - 1, y + 1);
      for (let x = 0; x < width; x += 1) {
        next[y * width + x] =
          (rain[up * width + x]! + rain[y * width + x]! + rain[down * width + x]!) / 3;
      }
    }
    rain = next;
  }
  const result = new Uint16Array(size);
  for (let i = 0; i < size; i += 1) {
    result[i] = Math.min(MAX_RAINFALL, Math.max(0, Math.round(rain[i]! * rainfallScale)));
  }
  return result;
}

export interface Risks {
  drought: Uint8Array;
  storm: Uint8Array;
  snow: Uint8Array;
}

/** Weather risks 0–100 from rainfall, heat, coast exposure and winter cold. */
export function computeRisks(
  width: number,
  height: number,
  ocean: Uint8Array,
  seaDistance: Uint16Array,
  tempSummer: Int8Array,
  tempWinter: Int8Array,
  rainfall: Uint16Array,
): Risks {
  const size = width * height;
  const drought = new Uint8Array(size);
  const storm = new Uint8Array(size);
  const snow = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    const wind = windDirection(y, height);
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const dry = Math.min(1, Math.max(0, 1 - rainfall[i]! / 1000));
      const hot = Math.min(1, Math.max(0, (tempSummer[i]! - 10) / 25));
      drought[i] = Math.round(dry * 70 + hot * 30);
      const warm = Math.min(1, Math.max(0, (tempSummer[i]! - 8) / 20));
      let stormy: number;
      if (seaDistance[i]! <= 3) {
        stormy = 25 + 45 * warm;
        // Windward coast: the sea lies upwind of the cell.
        const ux = x - wind;
        if (ocean[i] || (ux >= 0 && ux < width && ocean[y * width + ux])) stormy += 20;
      } else {
        stormy = (5 + 20 * warm) * Math.max(0, 1 - seaDistance[i]! / 15);
      }
      storm[i] = Math.min(100, Math.round(stormy));
      snow[i] = Math.round(Math.min(1, Math.max(0, -tempWinter[i]! / 15)) * 100);
    }
  }
  return { drought, storm, snow };
}

export interface ClimateResult extends Temperatures {
  seaDistance: Uint16Array;
  rainfall: Uint16Array;
  risk: Risks;
}

export function generateClimate(
  params: WorldParams,
  elevation: Int16Array,
  ocean: Uint8Array,
  rng: RngStream,
): ClimateResult {
  const { width, height, temperatureShift, rainfallScale } = params;
  const noiseSeed = rng.int(0x1_0000_0000);
  const seaDistance = computeSeaDistance(width, height, ocean);
  const temps = computeTemperature(
    width,
    height,
    elevation,
    seaDistance,
    noiseSeed,
    temperatureShift,
  );
  const rainfall = computeRainfall(width, height, elevation, ocean, rainfallScale);
  const risk = computeRisks(
    width,
    height,
    ocean,
    seaDistance,
    temps.tempSummer,
    temps.tempWinter,
    rainfall,
  );
  return { seaDistance, ...temps, rainfall, risk };
}
