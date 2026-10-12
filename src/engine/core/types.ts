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

/** Region kinds in the order regions are numbered (see worldgen/regions.ts). */
export const REGION_KINDS = [
  'range',
  'river',
  'forest',
  'desert',
  'lake',
  'sea',
  'island',
  'pass',
  'ford',
  'harbour',
  'strait',
  'bay',
  'volcano',
] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

/** A named stretch of the map or strategic feature (M1.5). Ids run 1..n in creation order. */
export interface Region {
  id: Id;
  kind: RegionKind;
  name: string;
  /** Ascending cell indices. */
  cells: number[];
  /** The representative cell: label position, pass saddle, ford crossing, harbour quay. */
  anchor: number;
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
  /** Cost to enter a cell on foot (M1.6): 1–254 passable, 255 impassable; sea cells 2 (sea links only). */
  travelCost: Uint8Array;
  /** How many land routes use each cell: 0 none, capped at 255. */
  roads: Uint8Array;
  /** Owning civ id per cell (M2.2), 0 = unclaimed; filled by the settle stage. */
  territory: Uint16Array;
}

/** A place routes join (M1.6): a harbour, ford, pass or fertile river mouth. Ids index `nodes`. */
export interface RouteNode {
  id: number;
  cell: number;
  kind: 'harbour' | 'ford' | 'pass' | 'river-mouth';
  /** The harbour, ford, pass or river region it stands on. */
  region: Id | null;
  /** Landmass number (see worldgen/regions.ts `landmasses`). */
  landmass: number;
}

/** A route between two nodes (a < b): `path` runs cell by cell from node a to node b. */
export interface RouteEdge {
  a: number;
  b: number;
  /** Summed travel cost of the path, rounded. */
  cost: number;
  path: number[];
  /** True for a sea lane between harbours. */
  sea: boolean;
}

/** The coarse route graph; edges are sorted by (a, b). */
export interface RouteGraph {
  nodes: RouteNode[];
  edges: RouteEdge[];
}

export const SITE_KINDS = [
  'hamlet',
  'village',
  'town',
  'city',
  'fortress',
  'mine',
  'temple',
  'port',
] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** Why a site sits where it does; shown in the inspector. */
export type SiteFeature =
  | 'river'
  | 'floodplain'
  | 'coast'
  | 'harbour'
  | 'ford'
  | 'pass'
  | 'road'
  | 'deposit'
  | 'aura'
  | 'forest'
  | 'heights'
  | 'plains';

/** People of one race and culture in one age band at a site. */
export interface PopBand {
  raceId: string;
  cultureId: string;
  band: 'child' | 'adult' | 'elder';
  count: number;
}

/** A people with a capital (M2.2). `founded` and `fell` are year numbers (0 = founding year). */
export interface Civ {
  id: Id;
  name: string;
  raceId: string;
  cultureId: string;
  /** Site id of the capital. */
  capital: Id;
  founded: number;
  fell?: number;
  rulerId?: Id;
  grievances: Map<Id, number>;
}

/** The goods a site stocks (M2.4): food plus four traded materials. */
export const GOODS = ['food', 'ore', 'timber', 'salt', 'luxury'] as const;
export type GoodId = (typeof GOODS)[number];
export type Goods = Record<GoodId, number>;

/** A settlement (M2.2). `founded` is a year number. */
export interface Site {
  id: Id;
  name: string;
  kind: SiteKind;
  cell: number;
  civId: Id | null;
  founded: number;
  ruinedYear?: number;
  pop: PopBand[];
  /** Stocks of each good; `goods.food` is the old stores. */
  goods: Goods;
  wealth: number;
  /** People the land within reach feeds (the M2.3 growth target). */
  capacity: number;
  features: SiteFeature[];
  /** Highest total population the site has held (M2.3). */
  peakPop: number;
}

/** A beast with a lair (M2.4). Lairs are cells, not sites. `deeds` are the event ids of its appearance and raids. */
export interface Creature {
  id: Id;
  defId: string;
  name: string;
  /** Cell index of the lair. */
  lair: number;
  born: number;
  /** Years it can live; it dies quietly of age when it passes this. */
  lifespan: number;
  died?: number;
  /** Name of the hero who killed it. */
  slainBy?: string;
  deeds: Id[];
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
  /** Named regions and strategic features, filled by worldgen; empty until then. */
  regions: Map<Id, Region>;
  /** Route graph between site candidates, filled by worldgen; empty until then. */
  routes: RouteGraph;
  /** Founding peoples and their settlements, filled by the settle stage; empty until then. */
  civs: Map<Id, Civ>;
  sites: Map<Id, Site>;
  /** Beasts, living and dead, filled by the history stage (M2.4). */
  creatures: Map<Id, Creature>;
  people: Map<Id, Person>;
  events: SimEvent[];
  commands: Command[];
  /** Demo climate state for the scaffold; Phase 1 moves weather to per-cell climate. */
  weather: { current: string; sinceDay: number; causeEvent: Id | null };
  // Phase 2 adds `items`;
  // Phase 3 adds `activeSite`.
}
