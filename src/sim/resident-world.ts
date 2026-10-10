import { canonicalJson } from './canonical';
import { capture, type Immutable } from './immutable';
import { RESIDENT_CONFIG } from './resident-config';
import { createFounderRoster } from './residents';
import { createSettlement } from './settlement-initial';
import type { Entity, SettlementState } from './state';

export const RESIDENT_WORLD_VERSION = 'p2-world-foundation-v1';

export interface WorldResident {
  id: number;
  givenName: string;
  householdName: string;
  householdId: number;
  homeId: number | null;
  tile: number;
  entryTick: number;
  ageWeeksAtEntry: number;
  creationEventId: number;
  birthEventId: number | null;
  deathEventId: number | null;
  health: number;
  profession: 'unassigned';
  parentIds: number[];
  traits: { sociability: number; caution: number; persistence: number };
}
export interface WorldHousehold {
  id: number;
  name: string;
  homeId: number | null;
  tile: number;
  creationEventId: number;
}
export interface ResidentWorldState extends Omit<SettlementState, 'config' | 'rng' | 'world'> {
  config: {
    settlement: SettlementState['config'];
    residents: typeof RESIDENT_CONFIG;
  };
  rng: SettlementState['rng'] & { residents: { algorithm: string; state: number } };
  world: Omit<SettlementState['world'], 'entities'> & {
    entities: (Omit<Entity, 'kind'> & { kind: Entity['kind'] | 'resident' | 'household' })[];
    residents: WorldResident[];
    households: WorldHousehold[];
  };
}
export type ResidentWorldSnapshot = Immutable<ResidentWorldState>;

// Fresh P2 worlds only. Never attach identities to an existing P1 history.
export function createResidentWorld(seed: string): ResidentWorldSnapshot {
  const founding = createSettlement(seed);
  const roster = createFounderRoster(founding);
  const base = JSON.parse(canonicalJson(founding)) as SettlementState;
  const households = roster.households.map((household) => ({
    ...household,
    creationEventId: roster.foundingEventId,
  }));
  const residents = roster.residents.map(({ ageWeeksAtFounding, ...resident }) => ({
    ...resident,
    parentIds: [...resident.parentIds],
    traits: { ...resident.traits },
    entryTick: 0,
    ageWeeksAtEntry: ageWeeksAtFounding,
    creationEventId: roster.foundingEventId,
    birthEventId: null,
    deathEventId: null,
  }));
  const identities = [
    ...households.map((household) => ({ ...household, kind: 'household' as const })),
    ...residents.map((resident) => ({ ...resident, kind: 'resident' as const })),
  ];
  base.events[0]!.entityIds.push(...identities.map((identity) => identity.id));
  return capture<ResidentWorldState>({
    ...base,
    schemaVersion: 3,
    simulationVersion: RESIDENT_WORLD_VERSION,
    rulesVersion: RESIDENT_WORLD_VERSION,
    config: { settlement: base.config, residents: RESIDENT_CONFIG },
    rng: { ...base.rng, residents: { ...roster.rng } },
    allocators: { ...base.allocators, entity: roster.nextEntityId },
    world: {
      ...base.world,
      entities: [
        ...base.world.entities,
        ...identities.map(({ id, kind, tile, creationEventId }) => ({
          id,
          kind,
          tile,
          creationEventId,
          retired: false,
        })),
      ],
      households,
      residents,
    },
  });
}

// This version deliberately admits only complete founding states. Its successor
// must validate evolving saves directly, without seed regeneration.
export function validateResidentWorld(value: unknown): asserts value is ResidentWorldState {
  const encoded = canonicalJson(value);
  const state = value as Partial<ResidentWorldState> | null;
  if (
    !state ||
    state.schemaVersion !== 3 ||
    state.simulationVersion !== RESIDENT_WORLD_VERSION ||
    state.rulesVersion !== RESIDENT_WORLD_VERSION ||
    state.tick !== 0 ||
    typeof state.seed !== 'string' ||
    encoded !== canonicalJson(createResidentWorld(state.seed))
  )
    throw new Error('Unsupported or inconsistent P2 founding world.');
}

export function worldResidentAgeWeeks(resident: Immutable<WorldResident>, tick: number): number {
  const age = resident.ageWeeksAtEntry + (tick - resident.entryTick);
  if (
    !Number.isSafeInteger(tick) ||
    !Number.isSafeInteger(resident.entryTick) ||
    !Number.isSafeInteger(resident.ageWeeksAtEntry) ||
    resident.entryTick < 0 ||
    resident.ageWeeksAtEntry < 0 ||
    tick < resident.entryTick ||
    !Number.isSafeInteger(age)
  )
    throw new Error('Resident age requires safe weeks at or after entry.');
  return age;
}
