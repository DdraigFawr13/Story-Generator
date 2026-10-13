// Volcanoes (Phase 1, M1.3): a volcanic arc sits on a continental plate a little
// way inland of a boundary where an oceanic plate dives beneath it, or, on a
// world short of such coasts, along a rift where two continents part. Elevation is
// left alone (rivers were already routed over it); a volcano is only a flag.

import type { RngStream } from '../core/rng';
import type { Plate } from '../core/types';
import { boundaryReach, convergence, plateBoundaries } from './terrain';
import { WATER_LAND } from './water';

/** Convergence (see terrain.ts) above which an oceanic plate subducts under a continent. */
const SUBDUCTION_CONVERGENCE = 0.2;
/** Volcanoes sit at least this high (m) and this far apart (cells). */
const MIN_VOLCANO_ELEVATION = 200;
const MIN_VOLCANO_SPACING = 8;
/** About one volcano per this many candidate cells, and at most MAX_VOLCANOES_256 on a 256x256 map (scaled by area). */
const CANDIDATES_PER_VOLCANO = 40;
const MAX_VOLCANOES_256 = 12;
const AREA_256 = 256 * 256;
/** Picking gives up after this many tries per wanted volcano (spacing rejects some). */
const TRIES_PER_VOLCANO = 40;

export function placeVolcanoes(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  water: ArrayLike<number>,
  owner: Uint8Array,
  plates: readonly Plate[],
  rng: RngStream,
): Uint8Array {
  const size = width * height;
  const reach = boundaryReach(width, height);
  const { distance, other } = plateBoundaries(width, height, owner, reach);
  const nearest = Math.max(1, Math.ceil(reach / 5));
  const farthest = Math.max(nearest, reach);

  const candidates: number[] = [];
  const rifts: number[] = [];
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== WATER_LAND || elevation[i]! < MIN_VOLCANO_ELEVATION) continue;
    const d = distance[i]!;
    if (d < nearest || d > farthest) continue;
    const own = plates[owner[i]!]!;
    const them = plates[other[i]!]!;
    if (!own.continental) continue;
    const c = convergence(own, them);
    if (!them.continental && c > SUBDUCTION_CONVERGENCE) candidates.push(i);
    else if (them.continental && c < -SUBDUCTION_CONVERGENCE) rifts.push(i);
  }
  // Compact continents keep most subduction coasts under the sea; a world
  // short of arcs gets rift volcanoes where continents pull apart.
  if (candidates.length < CANDIDATES_PER_VOLCANO) candidates.push(...rifts);
  candidates.sort((a, b) => a - b);

  const volcano = new Uint8Array(size);
  if (candidates.length === 0) return volcano;
  const cap = Math.max(1, Math.round((MAX_VOLCANOES_256 * size) / AREA_256));
  const wanted = Math.min(cap, Math.max(1, Math.round(candidates.length / CANDIDATES_PER_VOLCANO)));
  const chosen: number[] = [];
  for (let tries = 0; tries < wanted * TRIES_PER_VOLCANO && chosen.length < wanted; tries += 1) {
    const cell = candidates[rng.int(candidates.length)]!;
    const x = cell % width;
    const y = (cell - x) / width;
    const clear = chosen.every((other) => {
      const dx = (other % width) - x;
      const dy = Math.floor(other / width) - y;
      return dx * dx + dy * dy >= MIN_VOLCANO_SPACING * MIN_VOLCANO_SPACING;
    });
    if (clear) chosen.push(cell);
  }
  for (const cell of chosen) volcano[cell] = 1;
  return volcano;
}
