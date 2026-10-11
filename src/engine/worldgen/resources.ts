// Resources (Phase 1, M1.3): deposits grow in seeded clusters from random
// suitable cells, so iron sits in some hills but not all, and gems are rare.
// Every resource has its own RNG stream, so adding one never moves the others.

import type { ContentBundle } from '../core/content-types';
import type { RngStream } from '../core/rng';
import type { ResourceDeposit } from '../core/types';
import { D8_DX, D8_DY } from './grid';
import { WATER_LAKE, WATER_RIVER, WATER_SEA } from './water';

export type ResourceContent = Pick<ContentBundle, 'biomes' | 'resources'>;

/** A deposit is 100 at the cluster seed and loses this much per step of distance (never below 1). */
const AMOUNT_FALLOFF = 20;
/** Cluster size is the content's `clusterSize` plus or minus this share. */
const SIZE_SPREAD = 0.5;
/** Seed picking gives up after this many tries per cluster (crowded seeds are retried). */
const SEED_TRIES = 20;

export function placeResources(
  width: number,
  height: number,
  elevation: ArrayLike<number>,
  biome: ArrayLike<number>,
  water: ArrayLike<number>,
  floodplain: ArrayLike<number>,
  aura: ArrayLike<number>,
  volcano: ArrayLike<number>,
  content: ResourceContent,
  rngFor: (name: string) => RngStream,
): Map<number, ResourceDeposit[]> {
  const size = width * height;
  const biomeIndex = new Map(content.biomes.map((b, i) => [b.id, i]));

  // Cells within d of a volcano, for every d any resource asks about (Chebyshev rings).
  const volcanoes: number[] = [];
  for (let i = 0; i < size; i += 1) if (volcano[i]) volcanoes.push(i);
  const volcanoDistance = (cell: number): number => {
    const x = cell % width;
    const y = (cell - x) / width;
    let best = Infinity;
    for (const v of volcanoes) {
      const dx = Math.abs((v % width) - x);
      const dy = Math.abs(Math.floor(v / width) - y);
      best = Math.min(best, Math.max(dx, dy));
    }
    return best;
  };

  const riverNear = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    if (water[i] !== WATER_RIVER) continue;
    const x = i % width;
    const y = (i - x) / width;
    riverNear[i] = 1;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) riverNear[ny * width + nx] = 1;
    }
  }

  const amounts: Uint8Array[] = [];
  content.resources.forEach((resource) => {
    const held = new Uint8Array(size);
    amounts.push(held);
    const rng = rngFor(`worldgen.resource.${resource.id}`);
    const allowed = resource.biomes
      ? new Set(resource.biomes.map((id) => biomeIndex.get(id)))
      : null;
    const needs = resource.needs ?? {};

    const suitable: number[] = [];
    let base = 0;
    for (let i = 0; i < size; i += 1) {
      const w = water[i];
      if (resource.aquatic) {
        // Fish live in coast and lake cells and in rivers; other sea cells are too deep to work.
        const ok = w === WATER_RIVER || (allowed ? allowed.has(biome[i]) : w === WATER_LAKE);
        if (!ok) continue;
        base += 1;
      } else {
        if (w !== WATER_SEA) base += 1;
        if (w === WATER_SEA || w === WATER_LAKE) continue;
        if (allowed && !allowed.has(biome[i])) continue;
      }
      const m = elevation[i]!;
      if (resource.minElevation !== undefined && m < resource.minElevation) continue;
      if (resource.maxElevation !== undefined && m > resource.maxElevation) continue;
      if (needs.floodplain && !floodplain[i]) continue;
      if (needs.river && !riverNear[i]) continue;
      if (needs.minAura !== undefined && aura[i]! < needs.minAura) continue;
      if (needs.nearVolcano !== undefined && volcanoDistance(i) > needs.nearVolcano) continue;
      suitable.push(i);
    }
    if (suitable.length === 0) return;

    // Share caps count against all non-sea cells, or against the cells fish can live in.
    const cap = Math.floor(resource.maxCellShare * base);
    const clusters = Math.max(1, Math.round((resource.clustersPer10k * base) / 10000));
    const isSuitable = new Uint8Array(size);
    for (const i of suitable) isSuitable[i] = 1;
    let count = 0;

    for (let c = 0; c < clusters && count < cap; c += 1) {
      let seedCell = -1;
      for (let t = 0; t < SEED_TRIES; t += 1) {
        const pick = suitable[rng.int(suitable.length)]!;
        if (!held[pick]) {
          seedCell = pick;
          break;
        }
      }
      if (seedCell < 0) continue;
      const spread = Math.floor(resource.clusterSize * SIZE_SPREAD);
      const target = Math.max(1, resource.clusterSize + rng.between(-spread, spread));
      // Randomised growth: take a random frontier cell, claim it, add its free suitable neighbours.
      const depth = new Map<number, number>([[seedCell, 0]]);
      const frontier: number[] = [seedCell];
      let placed = 0;
      while (frontier.length > 0 && placed < target && count < cap) {
        const at = rng.int(frontier.length);
        const cell = frontier[at]!;
        frontier[at] = frontier[frontier.length - 1]!;
        frontier.pop();
        const d = depth.get(cell)!;
        held[cell] = Math.max(1, 100 - AMOUNT_FALLOFF * d);
        placed += 1;
        count += 1;
        const x = cell % width;
        const y = (cell - x) / width;
        for (let k = 0; k < 8; k += 1) {
          const nx = x + D8_DX[k]!;
          const ny = y + D8_DY[k]!;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (isSuitable[n] && !held[n] && !depth.has(n)) {
            depth.set(n, d + 1);
            frontier.push(n);
          }
        }
      }
    }
  });

  const deposits = new Map<number, ResourceDeposit[]>();
  for (let i = 0; i < size; i += 1) {
    let list: ResourceDeposit[] | undefined;
    for (let r = 0; r < amounts.length; r += 1) {
      const amount = amounts[r]![i]!;
      if (amount > 0) (list ??= []).push({ resource: r, amount });
    }
    if (list) deposits.set(i, list);
  }
  return deposits;
}
