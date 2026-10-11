// World generation entry point (Phase 1). Each step uses its own named RNG
// stream, so adding a later step never changes the terrain of a seed.

import { streamFor } from '../core/rng';
import type { WorldParams, WorldState } from '../core/types';
import { createWorld } from '../core/world';
import { generateTerrain } from './terrain';

export type WorldgenStage = 'terrain';
export type ProgressCallback = (stage: WorldgenStage, done: number, total: number) => void;

const STAGES: readonly WorldgenStage[] = ['terrain'];

export function generateWorld(
  seed: string,
  params: Partial<WorldParams> = {},
  onProgress: ProgressCallback = () => {},
): WorldState {
  const world = createWorld(seed, params);
  const { width, height } = world.params;
  onProgress('terrain', 0, STAGES.length);
  const terrain = generateTerrain(world.params, streamFor(world, 'worldgen.terrain'));
  world.cells = { width, height, ...terrain };
  onProgress('terrain', 1, STAGES.length);
  return world;
}
