// Core state shapes for the new engine. See docs/REBOOT_PLAN.md §7.3.
// Keep everything JSON-friendly (plain objects, arrays, Maps keyed by Id) so
// saves are a structured clone. Add fields as phases need them; do not add
// per-version compatibility layers (R-02, R-03).

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
}

export interface WorldState {
  seed: string;
  /** Number of completed days. The next step simulates day `day`. */
  day: number;
  params: WorldParams;
  /** Named RNG stream states, created lazily from the seed (core/rng.ts). */
  rng: Record<string, number>;
  nextId: Record<EntityKind, Id>;
  people: Map<Id, Person>;
  events: SimEvent[];
  commands: Command[];
  /** Demo climate state for the scaffold; Phase 1 moves weather to per-cell climate. */
  weather: { current: string; sinceDay: number; causeEvent: Id | null };
  // Phase 1 adds `cells`; Phase 2 adds `civs`, `sites`, `creatures`, `items`;
  // Phase 3 adds `activeSite`.
}
