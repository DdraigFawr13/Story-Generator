// World generation entry point (Phase 1). Each step uses its own named RNG
// stream, so adding a later step never changes the terrain of a seed.

import { streamFor } from '../core/rng';
import type { WorldParams, WorldState } from '../core/types';
import { createWorld } from '../core/world';
import { generateClimate } from './climate';
import { erodeTerrain } from './erosion';
import { oceanMask } from './grid';
import { generateTerrain } from './terrain';
import { computeWater } from './water';

export type WorldgenStage = 'terrain' | 'erosion' | 'climate' | 'water';
export type ProgressCallback = (stage: WorldgenStage, done: number, total: number) => void;

const STAGES: readonly WorldgenStage[] = ['terrain', 'erosion', 'climate', 'water'];

export function generateWorld(
  seed: string,
  params: Partial<WorldParams> = {},
  onProgress: ProgressCallback = () => {},
): WorldState {
  const world = createWorld(seed, params);
  const { width, height } = world.params;
  const total = STAGES.length;

  onProgress('terrain', 0, total);
  const terrain = generateTerrain(world.params, streamFor(world, 'worldgen.terrain'));
  onProgress('terrain', 1, total);

  // Erosion keeps land at 1 m or more, so the sea stays exactly where terrain put it.
  const ocean = oceanMask(width, height, terrain.elevation);
  onProgress('erosion', 1, total);
  erodeTerrain(width, height, terrain.elevation, ocean, streamFor(world, 'worldgen.erosion'));
  onProgress('erosion', 2, total);

  onProgress('climate', 2, total);
  const climate = generateClimate(
    world.params,
    terrain.elevation,
    ocean,
    streamFor(world, 'worldgen.climate'),
  );
  onProgress('climate', 3, total);

  onProgress('water', 3, total);
  const water = computeWater(width, height, terrain.elevation, climate.rainfall, ocean);
  onProgress('water', 4, total);

  world.cells = { width, height, ...terrain, ...climate, ...water };
  return world;
}
