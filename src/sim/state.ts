import { capture, type Immutable } from './immutable';
import type { SETTLEMENT_CONFIG } from './settlement-config';
import type { BuildingKind, Tile } from './terrain';

export interface JsonRecord {
  // Payload values are checked by the canonical encoder at the state boundary.
  // Consumers must narrow facts rather than assume an event's prose schema.
  readonly [key: string]: unknown;
}
export type WeatherKind = 'drought' | 'normal' | 'wet';
export interface Weather {
  kind: WeatherKind;
  multiplier: number;
  startTick: number;
}
export interface Building {
  id: number;
  kind: BuildingKind;
  tile: number;
  status: 'completed';
  creationEventId: number;
  durability: number | null;
  tendedWeeks: number;
}
export interface Project {
  id: number;
  kind: BuildingKind;
  tile: number;
  progress: number;
  requiredLabor: number;
  escrow: number;
  startEventId: number;
}
export interface Entity {
  id: number;
  kind: BuildingKind | 'settlement';
  tile: number;
  creationEventId: number;
  retired: boolean;
}
export const EVENT_PHASES = capture({
  founding: [0],
  weather: [1],
  construction_started: [2],
  harvest: [3],
  food_overflow: [4, 6],
  food_spoilage: [4],
  maintenance: [6],
  construction_completed: [6],
  building_decay: [6],
  building_removed: [6],
  deaths: [7],
  births: [7],
  extinction: [7],
  shortage_started: [8],
  shortage_recovered: [8],
  surplus_started: [8],
  surplus_ended: [8],
} as const);
export type EventType = keyof typeof EVENT_PHASES;
export const EVENT_FIELDS = capture({
  founding: {
    facts: [
      'population',
      'households',
      'foodEndowment',
      'timberEndowment',
      'fallback',
      'clearedTimber',
      'originalPatch',
    ],
    effects: ['population', 'food', 'timber'],
  },
  weather: { facts: ['kind', 'multiplier', 'startTick', 'year', 'season'], effects: [] },
  construction_started: {
    facts: ['kind', 'cost', 'requiredLabor', 'population', 'shelter', 'fields', 'food', 'capacity'],
    effects: ['timber', 'escrow'],
  },
  harvest: {
    facts: ['season', 'weather', 'weatherMultiplier', 'seasonMultiplier', 'fields', 'total'],
    effects: ['food'],
  },
  food_overflow: { facts: ['reason', 'amount', 'capacity'], effects: ['food'] },
  food_spoilage: { facts: ['amount'], effects: ['food'] },
  maintenance: { facts: ['workers', 'timberSpent', 'repairs'], effects: ['timber', 'durability'] },
  construction_completed: {
    facts: ['kind', 'worked', 'requiredLabor', 'escrowBurned'],
    effects: ['escrow', 'shelter', 'capacity'],
  },
  building_decay: { facts: ['buildings'], effects: ['durability'] },
  building_removed: { facts: ['kind', 'durability'], effects: ['shelter', 'capacity'] },
  deaths: {
    facts: [
      'count',
      'openingPopulation',
      'health',
      'shortfall',
      'openingShelter',
      'threshold',
      'trials',
    ],
    effects: ['population'],
  },
  births: {
    facts: ['count', 'survivors', 'health', 'food', 'shortfall', 'shelter', 'trials', 'successes'],
    effects: ['population'],
  },
  extinction: {
    facts: ['population', 'abandonedCropWork', 'unfinishedProject'],
    effects: ['health', 'shortage', 'surplus'],
  },
  shortage_started: { facts: ['openingDemand', 'consumed', 'shortfall'], effects: ['shortage'] },
  shortage_recovered: { facts: ['openingDemand', 'consumed', 'shortfall'], effects: ['shortage'] },
  surplus_started: { facts: ['food', 'population', 'threshold'], effects: ['surplus'] },
  surplus_ended: { facts: ['food', 'population', 'threshold'], effects: ['surplus'] },
} satisfies Record<EventType, { facts: string[]; effects: string[] }>);
export interface SettlementEvent {
  id: number;
  tick: number;
  phase: number;
  type: EventType;
  settlementId: number;
  entityIds: number[];
  location: { tile: number; x: number; y: number };
  causes: number[];
  facts: JsonRecord;
  effects: JsonRecord;
  importance: 'major' | 'ordinary' | 'minor';
}
export interface HarvestField {
  id: number;
  fertility: number;
  tendedWeeks: number;
  yield: number;
}
export interface Repair {
  id: number;
  before: number;
  after: number;
}
export interface Gathering {
  tile: number;
  before: number;
  after: number;
}
export interface TickLedger {
  tick: number;
  opening: {
    population: number;
    food: number;
    timber: number;
    health: number;
    shelter: number;
    capacity: number;
    escrow: number;
  };
  labor: {
    workforce: number;
    fields: number[];
    foragers: number;
    repairs: number;
    builders: number;
    gatherers: number;
    unassigned: number;
    unusedConstruction: number;
  };
  production: {
    foraging: number;
    harvest: number;
    fields: HarvestField[];
    gathered: number;
    gathering: Gathering[];
  };
  food: {
    overflow: number;
    consumed: number;
    deficit: number;
    spoilage: number;
    demolitionOverflow: number;
  };
  timber: { maintenance: number; newEscrow: number; completedEscrow: number };
  healthAfterFood: number;
  repairs: Repair[];
  construction: {
    id: number;
    before: number;
    after: number;
    worked: number;
    completed: boolean;
  } | null;
  demographics: {
    deathTrials: number;
    deathThreshold: number;
    deaths: number;
    birthEligible: boolean;
    birthTrials: number;
    birthSuccesses: number;
    births: number;
  };
  closing: {
    population: number;
    food: number;
    timber: number;
    health: number;
    shelter: number;
    capacity: number;
    escrow: number;
  };
}
export interface SettlementState {
  schemaVersion: number;
  simulationVersion: string;
  rulesVersion: string;
  config: typeof SETTLEMENT_CONFIG;
  seed: string;
  tick: number;
  rng: {
    terrain: { algorithm: string; state: number };
    weather: { algorithm: string; state: number };
    demographics: { algorithm: string; state: number };
  };
  allocators: { entity: number; event: number };
  world: {
    map: { width: number; height: number; river: number[]; tiles: Tile[] };
    settlement: {
      id: number;
      center: number;
      name: string;
      population: number;
      households: number;
      health: number;
      food: number;
      timber: number;
      shortage: boolean;
      surplus: boolean;
    };
    buildings: Building[];
    project: Project | null;
    currentWeather: Weather | null;
    currentWeatherEventId: number | null;
    entities: Entity[];
  };
  events: SettlementEvent[];
  lastTick: TickLedger | null;
}
export type SettlementSnapshot = Immutable<SettlementState>;
