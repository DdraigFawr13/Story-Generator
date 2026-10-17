// World generation entry point (Phase 1). Each step uses its own named RNG
// stream, so adding a later step never changes the terrain of a seed.

import type { ContentBundle } from '../core/content-types';
import { streamFor } from '../core/rng';
import { runHistory } from '../history';
import { settleWorld } from '../history/settle';
import type { WorldParams, WorldState } from '../core/types';
import { createWorld } from '../core/world';
import { generateAura } from './aura';
import { classifyBiomes } from './biomes';
import { generateClimate } from './climate';
import { erodeTerrain } from './erosion';
import { oceanMask } from './grid';
import { computeHabitat } from './habitat';
import { buildRegions } from './regions';
import { placeResources } from './resources';
import { planRoutes } from './travel';
import { generateTerrain } from './terrain';
import { placeVolcanoes } from './volcanoes';
import { computeWater } from './water';

/** The content the generator reads: biome table, resource list and name tables. */
export type WorldgenContent = Pick<
  ContentBundle,
  | 'biomes'
  | 'biomeRules'
  | 'resources'
  | 'names'
  | 'races'
  | 'cultures'
  | 'eventTypes'
  | 'settlement'
  | 'history'
  | 'abilities'
  | 'creatures'
  | 'dragons'
  | 'greatBeasts'
  | 'greatWorks'
  | 'places'
  | 'faiths'
  | 'diseases'
  | 'notables'
  | 'threats'
>;

export type WorldgenStage =
  | 'terrain'
  | 'erosion'
  | 'climate'
  | 'water'
  | 'biomes'
  | 'volcanoes'
  | 'aura'
  | 'resources'
  | 'habitat'
  | 'regions'
  | 'routes'
  | 'settle'
  | 'history';
/**
 * Called as each stage starts: (stage, stages already done, total stages). The history stage
 * also reports each decade with `fraction` (0-1 of the stage).
 */
export type ProgressCallback = (
  stage: WorldgenStage,
  done: number,
  total: number,
  fraction?: number,
) => void;

const STAGES: readonly WorldgenStage[] = [
  'terrain',
  'erosion',
  'climate',
  'water',
  'biomes',
  'volcanoes',
  'aura',
  'resources',
  'habitat',
  'regions',
  'routes',
  'settle',
  'history',
];

export function generateWorld(
  seed: string,
  params: Partial<WorldParams>,
  content: WorldgenContent,
  onProgress: ProgressCallback = () => {},
): WorldState {
  const world = createWorld(seed, params);
  const { width, height } = world.params;
  const total = STAGES.length;
  const start = (stage: WorldgenStage) => onProgress(stage, STAGES.indexOf(stage), total);

  start('terrain');
  const terrain = generateTerrain(world.params, streamFor(world, 'worldgen.terrain'));

  // Erosion keeps land at 1 m or more, so the sea stays exactly where terrain put it.
  const ocean = oceanMask(width, height, terrain.elevation);
  start('erosion');
  erodeTerrain(width, height, terrain.elevation, ocean, streamFor(world, 'worldgen.erosion'));

  start('climate');
  const climate = generateClimate(
    world.params,
    terrain.elevation,
    ocean,
    streamFor(world, 'worldgen.climate'),
  );

  start('water');
  const water = computeWater(width, height, terrain.elevation, climate.rainfall, ocean);

  start('biomes');
  const biome = classifyBiomes(
    width,
    height,
    terrain.elevation,
    climate.tempSummer,
    climate.tempWinter,
    climate.rainfall,
    water.water,
    water.floodplain,
    content,
  );

  start('volcanoes');
  const volcano = placeVolcanoes(
    width,
    height,
    terrain.elevation,
    water.water,
    terrain.plate,
    terrain.plates,
    streamFor(world, 'worldgen.volcanoes'),
  );

  start('aura');
  const forest = biome.map((b) => (content.biomes[b]?.forest ? 1 : 0));
  const { aura, auraSpots } = generateAura(
    width,
    height,
    terrain.elevation,
    water.water,
    water.flowDir,
    forest,
    volcano,
    streamFor(world, 'worldgen.aura'),
  );

  start('resources');
  const resources = placeResources(
    width,
    height,
    terrain.elevation,
    biome,
    water.water,
    water.floodplain,
    aura,
    volcano,
    content,
    (name) => streamFor(world, name),
  );

  start('habitat');
  const habitat = computeHabitat(
    width,
    height,
    terrain.elevation,
    climate.tempSummer,
    climate.tempWinter,
    climate.rainfall,
    water.water,
    water.floodplain,
    biome,
    aura,
    content,
  );

  const cells = {
    width,
    height,
    ...terrain,
    ...climate,
    ...water,
    biome,
    volcano,
    aura,
    auraSpots,
    resources,
    ...habitat,
    // Filled by the routes stage.
    travelCost: new Uint8Array(width * height),
    roads: new Uint8Array(width * height),
    // Filled by the settle stage.
    territory: new Uint16Array(width * height),
  };
  world.cells = cells;

  start('regions');
  for (const region of buildRegions(cells, content, streamFor(world, 'worldgen.names'))) {
    world.regions.set(region.id, region);
  }

  start('routes');
  const travel = planRoutes(cells, content, [...world.regions.values()]);
  cells.travelCost = travel.travelCost;
  cells.roads = travel.roads;
  world.routes = travel.routes;

  start('settle');
  settleWorld(world, content);

  start('history');
  runHistory(world, content, (year, years) =>
    onProgress('history', STAGES.indexOf('history'), total, year / years),
  );
  return world;
}
