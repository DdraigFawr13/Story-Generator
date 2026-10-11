// Terrain (Phase 1, M1.1): seeded tectonic plates give continents and the
// mountain chains along their collisions; fractal noise adds coastline and
// relief detail; sea level is set so the land fraction hits its target.
// Interesting beats realistic (REBOOT_PLAN §9A): visible ranges, varied coasts.

import type { RngStream } from '../core/rng';
import type { Plate, WorldParams } from '../core/types';
import { fractalNoise } from './noise';

export interface TerrainResult {
  elevation: Int16Array;
  plate: Uint8Array;
  plates: Plate[];
}

/** Highest peak and deepest trench, in metres. */
const MAX_ELEVATION = 4500;
const MAX_DEPTH = 5000;
/** Extra oceanic plates per continent, plus a fixed few: more plates, more ranges and island arcs. */
const OCEANIC_PER_CONTINENT = 1;
const OCEANIC_EXTRA = 4;

function placePlates(params: WorldParams, rng: RngStream): Plate[] {
  const { width, height, continents } = params;
  const plates: Plate[] = [];
  const minGap = Math.min(width, height) / (continents + 1);
  // Continental plates stay inside the central 70% so continents rarely touch the map edge.
  for (let i = 0; i < continents; i += 1) {
    let best: [number, number] = [width / 2, height / 2];
    let bestGap = -1;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cx = width * 0.15 + rng.int(Math.max(1, Math.floor(width * 0.7)));
      const cy = height * 0.15 + rng.int(Math.max(1, Math.floor(height * 0.7)));
      const gap = nearestGap(plates, cx, cy);
      if (gap > bestGap) {
        best = [cx, cy];
        bestGap = gap;
      }
      if (gap >= minGap) break;
    }
    plates.push(plateAt(plates.length, best[0], best[1], true, rng));
    // A second plate beside it: where the pair collides, an inland range rises.
    const dx = rng.between(-10, 10);
    const dy = rng.between(-10, 10);
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = minGap * 0.45;
    plates.push(
      plateAt(
        plates.length,
        Math.min(width - 1, Math.max(0, best[0] + (dx / length) * offset)),
        Math.min(height - 1, Math.max(0, best[1] + (dy / length) * offset)),
        true,
        rng,
      ),
    );
  }
  const oceanic = continents * OCEANIC_PER_CONTINENT + OCEANIC_EXTRA;
  for (let i = 0; i < oceanic; i += 1) {
    plates.push(plateAt(plates.length, rng.int(width), rng.int(height), false, rng));
  }
  return plates;
}

function nearestGap(plates: readonly Plate[], x: number, y: number): number {
  let gap = Infinity;
  for (const plate of plates) {
    const dx = plate.cx - x;
    const dy = plate.cy - y;
    gap = Math.min(gap, Math.sqrt(dx * dx + dy * dy));
  }
  return gap;
}

function plateAt(id: number, cx: number, cy: number, continental: boolean, rng: RngStream): Plate {
  // Motion in tenths of a cell per step; only relative motion matters.
  return { id, cx, cy, vx: rng.between(-10, 10), vy: rng.between(-10, 10), continental };
}

/** Assigns each cell to the nearest plate, with noise-warped distance so borders wiggle. */
function assignPlates(params: WorldParams, plates: readonly Plate[], seed: number): Uint8Array {
  const { width, height } = params;
  const owner = new Uint8Array(width * height);
  const warp = { scale: Math.max(8, width / 3), octaves: 4, persistence: 0.55 };
  const strength = width / 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const wx = x + fractalNoise(seed, x, y, warp) * strength;
      const wy = y + fractalNoise(seed + 7, x, y, warp) * strength;
      let best = 0;
      let bestDistance = Infinity;
      for (const plate of plates) {
        const dx = plate.cx - wx;
        const dy = plate.cy - wy;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = plate.id;
        }
      }
      owner[y * width + x] = best;
    }
  }
  return owner;
}

/**
 * Convergence between two plates: positive when they move toward each other.
 * Roughly -2..2 after normalising by the maximum speed (10).
 */
export function convergence(a: Plate, b: Plate): number {
  const nx = b.cx - a.cx;
  const ny = b.cy - a.cy;
  const length = Math.sqrt(nx * nx + ny * ny) || 1;
  return ((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) / length / 10;
}

/** Boundary reach in cells: how far a plate edge's influence spreads inward. */
export function boundaryReach(width: number, height: number): number {
  return Math.max(3, Math.round(Math.min(width, height) / 12));
}

/**
 * Distance (cells, 4-neighbour BFS inside each plate) from the nearest plate
 * boundary, up to `reach`, and the plate on the other side of that boundary.
 * Both are -1 beyond the reach.
 */
export function plateBoundaries(
  width: number,
  height: number,
  owner: Uint8Array,
  reach: number,
): { distance: Int32Array; other: Int16Array } {
  const size = width * height;
  const distance = new Int32Array(size).fill(-1);
  const other = new Int16Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i += 1) {
    const x = i % width;
    const y = (i - x) / width;
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && owner[n] !== owner[i]) {
        distance[i] = 0;
        other[i] = owner[n]!;
        queue[tail++] = i;
        break;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    if (distance[i]! >= reach) continue;
    const x = i % width;
    const y = (i - x) / width;
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      y > 0 ? i - width : -1,
      y < height - 1 ? i + width : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && distance[n] === -1 && owner[n] === owner[i]) {
        distance[n] = distance[i]! + 1;
        other[n] = other[i]!;
        queue[tail++] = n;
      }
    }
  }
  return { distance, other };
}

/**
 * Uplift from plate boundaries. A multi-source BFS spreads each boundary's
 * effect inward, fading with distance: collisions raise ranges and island
 * arcs, separations open rifts and mid-ocean ridges.
 */
function boundaryUplift(
  params: WorldParams,
  plates: readonly Plate[],
  owner: Uint8Array,
  seed: number,
): Float64Array {
  const { width, height } = params;
  const size = width * height;
  const reach = boundaryReach(width, height);
  const { distance, other } = plateBoundaries(width, height, owner, reach);

  const uplift = new Float64Array(size);
  const ridges = { scale: Math.max(4, width / 24), octaves: 3, persistence: 0.55 };
  for (let i = 0; i < size; i += 1) {
    if (distance[i] === -1 || other[i] === -1) continue;
    const own = plates[owner[i]!]!;
    const them = plates[other[i]!]!;
    const c = convergence(own, them);
    const fade = 1 - distance[i]! / reach;
    const falloff = fade * fade;
    const x = i % width;
    const y = (i - x) / width;
    // Jagged crests: ranges rise and dip along their length.
    const jag = 0.55 + 0.45 * Math.abs(fractalNoise(seed, x, y, ridges));
    let effect = 0;
    if (c > 0) {
      if (own.continental && them.continental) effect = 1.2 * c * jag;
      else if (own.continental) effect = 0.9 * c * jag;
      else if (them.continental) effect = -0.3 * c;
      else effect = distance[i]! < reach / 3 ? 0.8 * c * jag : 0;
    } else {
      effect = own.continental ? 0.35 * c : -0.15 * c;
    }
    uplift[i] = effect * falloff;
  }
  return uplift;
}

export function generateTerrain(params: WorldParams, rng: RngStream): TerrainResult {
  const { width, height, landFraction } = params;
  const size = width * height;
  const plates = placePlates(params, rng);
  const seeds = Array.from({ length: 4 }, () => rng.int(0x1_0000_0000));
  const owner = assignPlates(params, plates, seeds[0]!);
  const uplift = boundaryUplift(params, plates, owner, seeds[1]!);

  const continents = { scale: Math.max(8, width / 4), octaves: 5, persistence: 0.55 };
  const hills = { scale: Math.max(4, width / 10), octaves: 3, persistence: 0.5 };
  const detail = { scale: Math.max(4, width / 20), octaves: 4, persistence: 0.5 };
  const margin = Math.max(2, Math.round(Math.min(width, height) * 0.08));
  const raw = new Float64Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const plate = plates[owner[i]!]!;
      const base = plate.continental ? 0.18 : -0.3;
      // Ridged noise: interior hills and highlands away from plate edges.
      const ridge = 1 - Math.abs(fractalNoise(seeds[1]! + 11, x, y, hills));
      let h =
        base +
        fractalNoise(seeds[2]!, x, y, continents) * 0.6 +
        fractalNoise(seeds[3]!, x, y, detail) * 0.15 +
        ridge * ridge * 0.22 +
        uplift[i]!;
      // Sink the map edge so the world is bounded by ocean.
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge < margin) h -= (1 - edge / margin) * 1.2;
      raw[i] = h;
    }
  }

  const sorted = Float64Array.from(raw).sort();
  const seaIndex = Math.min(size - 1, Math.max(0, Math.floor(size * (1 - landFraction))));
  const sea = sorted[seaIndex]!;
  const lowest = sorted[0]!;
  const highest = sorted[size - 1]!;
  const elevation = new Int16Array(size);
  for (let i = 0; i < size; i += 1) {
    const h = raw[i]!;
    if (h > sea) {
      const t = (h - sea) / (highest - sea || 1);
      // Gently quadratic: broad lowlands and hills, few high peaks.
      elevation[i] = Math.max(1, Math.round(t * t * (MAX_ELEVATION - 1800) + t * 1800));
    } else {
      const t = (sea - h) / (sea - lowest || 1);
      elevation[i] = Math.min(0, -Math.round(t * MAX_DEPTH));
    }
  }
  return { elevation, plate: owner, plates };
}
