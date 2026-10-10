import { canonicalJson } from './canonical';
import { capture, type Immutable } from './immutable';
import { RNG_ALGORITHM, uniform } from './rng';
import { RESIDENT_CONFIG, RESIDENT_FOUNDATION_VERSION } from './resident-config';
import { deriveResidentStream } from './seed';
import { createSettlement } from './settlement-initial';
import type { SettlementSnapshot } from './state';

export interface ResidentIdentity {
  id: number;
  givenName: string;
  householdName: string;
  householdId: number;
  homeId: number;
  tile: number;
  ageWeeksAtFounding: number;
  health: number;
  profession: 'unassigned';
  parentIds: number[];
  traits: { sociability: number; caution: number; persistence: number };
}
export interface HouseholdIdentity {
  id: number;
  name: string;
  homeId: number;
  tile: number;
}
export interface FounderRoster {
  schemaVersion: 1;
  version: typeof RESIDENT_FOUNDATION_VERSION;
  seed: string;
  tick: 0;
  settlementId: number;
  foundingEventId: number;
  config: typeof RESIDENT_CONFIG;
  rng: { algorithm: typeof RNG_ALGORITHM; state: number };
  nextEntityId: number;
  households: HouseholdIdentity[];
  residents: ResidentIdentity[];
}
export type FounderRosterSnapshot = Immutable<FounderRoster>;

// This is a tick-zero component factory, not a migration or running-world validator.
export function createFounderRoster(founding: SettlementSnapshot): FounderRosterSnapshot {
  const encoded = canonicalJson(founding);
  if (
    founding.tick !== 0 ||
    encoded !== canonicalJson(createSettlement(founding.seed, founding.simulationVersion))
  )
    throw new Error('Resident foundations require a supported, unchanged founding world.');
  const { config, world } = founding;
  const homes = world.buildings.filter((building) => building.kind === 'hut');
  if (
    homes.length !== world.settlement.households ||
    homes.length * config.peoplePerHousehold !== world.settlement.population
  )
    throw new Error('Founder households must match the occupied homes and census.');
  let state = deriveResidentStream(founding.seed);
  let nextEntityId = founding.allocators.entity;
  function draw(range: number) {
    const next = uniform(state, range);
    state = next.state;
    return next.value;
  }
  function choose<T>(available: T[]): T {
    return available.splice(draw(available.length), 1)[0]!;
  }
  const householdNames = [...RESIDENT_CONFIG.householdNames];
  const households: HouseholdIdentity[] = homes.map((home) => ({
    id: nextEntityId++,
    name: choose(householdNames),
    homeId: home.id,
    tile: home.tile,
  }));
  const residents: ResidentIdentity[] = [];
  for (const household of households) {
    const givenNames = [...RESIDENT_CONFIG.givenNames];
    for (let member = 0; member < config.peoplePerHousehold; member++) {
      residents.push({
        id: nextEntityId++,
        givenName: choose(givenNames),
        householdName: household.name,
        householdId: household.id,
        homeId: household.homeId,
        tile: household.tile,
        ageWeeksAtFounding:
          RESIDENT_CONFIG.founderMinAgeWeeks +
          draw(RESIDENT_CONFIG.founderMaxAgeWeeks - RESIDENT_CONFIG.founderMinAgeWeeks + 1),
        health: world.settlement.health,
        profession: 'unassigned',
        parentIds: [],
        traits: {
          sociability: draw(RESIDENT_CONFIG.traitRange),
          caution: draw(RESIDENT_CONFIG.traitRange),
          persistence: draw(RESIDENT_CONFIG.traitRange),
        },
      });
    }
  }
  return capture<FounderRoster>({
    schemaVersion: 1,
    version: RESIDENT_FOUNDATION_VERSION,
    seed: founding.seed,
    tick: 0,
    settlementId: world.settlement.id,
    foundingEventId: founding.events[0]!.id,
    config: RESIDENT_CONFIG,
    rng: { algorithm: RNG_ALGORITHM, state },
    nextEntityId,
    households,
    residents,
  });
}

export function validateFounderRoster(
  value: unknown,
  founding: SettlementSnapshot,
): asserts value is FounderRoster {
  if (canonicalJson(value) !== canonicalJson(createFounderRoster(founding)))
    throw new Error('Unsupported or inconsistent founder roster.');
}

export function residentAgeWeeks(resident: Immutable<ResidentIdentity>, tick: number): number {
  const age = resident.ageWeeksAtFounding + tick;
  if (
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    !Number.isSafeInteger(resident.ageWeeksAtFounding) ||
    resident.ageWeeksAtFounding < 0 ||
    !Number.isSafeInteger(age)
  )
    throw new Error('Resident age requires nonnegative safe integer weeks.');
  return age;
}

export function residentLifeStage(resident: Immutable<ResidentIdentity>, tick: number) {
  const age = residentAgeWeeks(resident, tick);
  if (age < RESIDENT_CONFIG.adultAgeWeeks) return 'child';
  if (age < RESIDENT_CONFIG.seniorAgeWeeks) return 'adult';
  return 'senior';
}
