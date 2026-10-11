// Core state shapes for the new engine. See docs/REBOOT_PLAN.md §7.3.
// Keep everything JSON-friendly (plain objects, arrays, Maps keyed by Id) so
// saves are a structured clone. Add fields as phases need them; do not add
// per-version compatibility layers (R-02, R-03).

import type { RngState } from './rng';

export type Id = number;

export const ENTITY_KINDS = ['event', 'person', 'site', 'civ', 'creature', 'item'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ATTRIBUTE_KEYS = [
  'strength',
  'agility',
  'endurance',
  'intellect',
  'willpower',
  'perception',
  'charisma',
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
/** 1–20 scale. Physical: strength/agility/endurance. Mental: the rest. */
export type Attributes = Record<AttributeKey, number>;

export interface Magic {
  /** Raw capacity, 0 for most people. Tier boundaries live in people/tiers.ts. */
  power: number;
  /** Affinity per magic school id (content). Empty when power is 0. */
  affinities: Record<string, number>;
}

export interface Family {
  parents: Id[];
  spouses: Id[];
  children: Id[];
  householdId?: Id;
}

/** Site-tier-only detail (§6). Absent while a person lives only at world tier. */
export interface PersonDetail {
  needs: Record<string, number>;
  mood: number;
  stress: number;
  memories: Memory[];
  relationships: Map<Id, Relationship>;
  jobId?: string;
  pos?: [number, number];
}

export interface Memory {
  type: string;
  about?: Id;
  moodDelta: number;
  createdDay: number;
  decayDays: number;
}

export interface Relationship {
  opinion: number;
  labels: string[];
}

export interface Person {
  id: Id;
  name: string;
  raceId: string;
  cultureId: string | null;
  sex: 'f' | 'm';
  born: number;
  birthplaceCell: number | null;
  died?: number;
  family: Family;
  attributes: Attributes;
  potential: Attributes;
  magic: Magic;
  traits: string[];
  skills: Record<string, number>;
  knownAbilities: string[];
  fame: number;
  deeds: Id[];
  /** 0–100 summary; detailed conditions arrive with the Phase 3 health system. */
  health: number;
  detail?: PersonDetail;
}

/** Every chronicle line renders one of these (R-20, principle "simulation first"). */
export interface SimEvent {
  id: Id;
  day: number;
  type: string;
  importance: number;
  actors: Id[];
  place: number | null;
  /** Earlier event ids that caused this one. Powers "why did this happen?". */
  causes: Id[];
  data: Record<string, string | number | boolean>;
}

/** Hybrid-mode seam (R-01). Observer mode never enqueues commands. */
export interface Command {
  day: number;
  kind: string;
  payload: Record<string, unknown>;
}

/** World-gen parameters. Future sliders edit this object (R-05). */
export interface WorldParams {
  width: number;
  height: number;
  historyYears: number;
  /** Continental plates; the default 3–5 gives a few continents plus islands. */
  continents: number;
  /** Share of cells above sea level (0–1). */
  landFraction: number;
  /** Degrees C added to every temperature (−15…15); no UI yet. */
  temperatureShift: number;
  /** Multiplies every rainfall total (0.25…2); no UI yet. */
  rainfallScale: number;
}

/** A tectonic plate from world-gen. Motion is in tenths of a cell per step. */
export interface Plate {
  id: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  continental: boolean;
}

/** A legendary-place candidate for Phase 2: a cell of unusually high aura. */
export interface AuraSpot {
  cell: number;
  kind: 'spring' | 'old-forest' | 'peak' | 'hot-spring';
  /** 70–100 at the spot itself. */
  aura: number;
}

/** One resource sitting in a cell. `resource` indexes the content's resource list. */
export interface ResourceDeposit {
  resource: number;
  /** 1–100: richest at the heart of a cluster. */
  amount: number;
}

/** Per-cell world layers (index = y * width + x). Integer typed arrays keep maths exact. */
export interface WorldCells {
  width: number;
  height: number;
  /** Metres; sea and lake floors are at or below 0. */
  elevation: Int16Array;
  /** Owning plate id. */
  plate: Uint8Array;
  plates: Plate[];
  /** Cells to the nearest ocean cell; 0 on the ocean itself. */
  seaDistance: Uint16Array;
  /** Typical summer high and winter low in °C. */
  tempSummer: Int8Array;
  tempWinter: Int8Array;
  /** Millimetres per year. */
  rainfall: Uint16Array;
  /** Weather risks, 0–100. */
  risk: { drought: Uint8Array; storm: Uint8Array; snow: Uint8Array };
  /** Downstream neighbour as a D8 index (0–7, see worldgen/grid.ts); −1 at the sea or none. */
  flowDir: Int8Array;
  /** Cells of runoff draining through each cell, weighted by rainfall. */
  flow: Uint32Array;
  /** 0 land, 1 river, 2 lake, 3 sea. */
  water: Uint8Array;
  /** 1 on flat low ground beside a river that floods and silts. */
  floodplain: Uint8Array;
  /** Index into the content's biome list; 0 is ocean and 1 is coast (both sea only). */
  biome: Uint8Array;
  /** 1 on a volcano cell. */
  volcano: Uint8Array;
  /** Magical background strength 0–100: low everywhere, high near spots. */
  aura: Uint8Array;
  /** Legendary-place candidates, sorted by cell index. */
  auraSpots: AuraSpot[];
  /** Farming potential 0–100 (Phase 2 carrying capacity); 0 on water. */
  fertility: Uint8Array;
  /** How untamed the ground is 0–100 (Phase 2 beast lairs); 0 on sea. */
  wildness: Uint8Array;
  /** Sparse deposits by cell; keys ascend, each list is ordered by resource index. */
  resources: Map<number, ResourceDeposit[]>;
}

export interface WorldState {
  seed: string;
  /** Number of completed days. The next step simulates day `day`. */
  day: number;
  params: WorldParams;
  /** Named RNG stream states, created lazily from the seed (core/rng.ts). */
  rng: Record<string, RngState>;
  nextId: Record<EntityKind, Id>;
  /** World-gen layers; null until the world is generated. */
  cells: WorldCells | null;
  people: Map<Id, Person>;
  events: SimEvent[];
  commands: Command[];
  /** Demo climate state for the scaffold; Phase 1 moves weather to per-cell climate. */
  weather: { current: string; sinceDay: number; causeEvent: Id | null };
  // Phase 2 adds `civs`, `sites`, `creatures`, `items`;
  // Phase 3 adds `activeSite`.
}
