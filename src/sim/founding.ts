import { validateArchive } from './admission';
import { canonicalJson } from './canonical';
import { FOUNDATION_CONFIG, FOUNDATION_VERSION } from './config';
import { capture } from './immutable';
import { RNG_ALGORITHM } from './rng';
import { deriveStream } from './seed';
import { MAP_HEIGHT, MAP_WIDTH, terrainFixture } from './terrain';

function buildFoundingSnapshot(seed: string) {
  const fixture = terrainFixture(seed);
  const center = fixture.center;
  const location = { tile: center, x: center % MAP_WIDTH, y: Math.floor(center / MAP_WIDTH) };
  const buildings = fixture.buildings.map(([tile, kind], index) => ({
    id: index + 2,
    kind,
    tile,
    status: 'completed' as const,
    creationEventId: 1,
    durability: kind === 'field' ? null : FOUNDATION_CONFIG.initialDurability,
    tendedWeeks: 0,
  }));
  const households = Math.ceil(FOUNDATION_CONFIG.population / FOUNDATION_CONFIG.peoplePerHousehold);
  return {
    schemaVersion: 1,
    simulationVersion: FOUNDATION_VERSION,
    rulesVersion: FOUNDATION_VERSION,
    config: FOUNDATION_CONFIG,
    seed,
    tick: 0,
    rng: {
      terrain: { algorithm: RNG_ALGORITHM, state: fixture.terrainRng },
      weather: { algorithm: RNG_ALGORITHM, state: deriveStream(seed, 'weather') },
      demographics: { algorithm: RNG_ALGORITHM, state: deriveStream(seed, 'demographics') },
    },
    allocators: { entity: buildings.length + 2, event: 2 },
    world: {
      map: { width: MAP_WIDTH, height: MAP_HEIGHT, river: fixture.river, tiles: fixture.tiles },
      settlement: {
        id: 1,
        center,
        name: `Settlement ${location.x}-${location.y}`,
        population: FOUNDATION_CONFIG.population,
        households,
        health: FOUNDATION_CONFIG.initialHealth,
        food: FOUNDATION_CONFIG.initialFood,
        timber: FOUNDATION_CONFIG.initialTimber,
        shortage: false,
        surplus: false,
      },
      buildings,
      project: null,
      currentWeather: null,
      currentWeatherEventId: null,
      entities: [
        { id: 1, kind: 'settlement', tile: center, creationEventId: 1, retired: false },
        ...buildings.map((building) => ({
          id: building.id,
          kind: building.kind,
          tile: building.tile,
          creationEventId: 1,
          retired: false,
        })),
      ],
    },
    events: [
      {
        id: 1,
        tick: 0,
        phase: 0,
        type: 'founding',
        settlementId: 1,
        entityIds: [1, ...buildings.map((building) => building.id)],
        location,
        causes: [],
        facts: {
          population: FOUNDATION_CONFIG.population,
          households,
          foodEndowment: FOUNDATION_CONFIG.initialFood,
          timberEndowment: FOUNDATION_CONFIG.initialTimber,
          fallback: fixture.fallback,
          clearedTimber: fixture.clearedTimber,
          originalPatch: fixture.originalPatch,
        },
        effects: {
          population: FOUNDATION_CONFIG.population,
          food: FOUNDATION_CONFIG.initialFood,
          timber: FOUNDATION_CONFIG.initialTimber,
        },
        importance: 'major',
      },
    ],
  };
}

export function createFoundingSnapshot(seed: string) {
  const snapshot = buildFoundingSnapshot(seed);
  validateArchive(snapshot);
  return capture(snapshot);
}

export type FoundingSnapshot = ReturnType<typeof createFoundingSnapshot>;

export function validateFoundingSnapshot(value: unknown): asserts value is FoundingSnapshot {
  const encoded = canonicalJson(value);
  if (
    value === null ||
    typeof value !== 'object' ||
    !('seed' in value) ||
    typeof value.seed !== 'string'
  ) {
    throw new Error('Invalid founding snapshot.');
  }
  // This version supports only the complete tick-zero founding snapshot. Future
  // running worlds need their own versioned invariant validator, not regeneration.
  if (encoded !== canonicalJson(buildFoundingSnapshot(value.seed))) {
    throw new Error('Unsupported or inconsistent founding snapshot.');
  }
}
