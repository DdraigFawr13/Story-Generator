// Core state shapes for the new engine. See docs/REBOOT_PLAN.md §7.3.
// Keep everything JSON-friendly (plain objects, arrays, Maps keyed by Id) so
// saves are a structured clone. Add fields as phases need them; do not add
// per-version compatibility layers (R-02, R-03).

import type { RngState } from './rng';
import type {
  Activity,
  BreakdownKind,
  CreatureTier,
  CultureValue,
  RoutinePlace,
} from './content-types';

export type Id = number;

export const ENTITY_KINDS = [
  'event',
  'person',
  'site',
  'civ',
  'creature',
  'item',
  'dynasty',
  'place',
  'faith',
] as const;
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
  /** M3.12: the work tile last looked up, for which job, layout version and day (construction moves daily); saved so a loaded site works the same spots. */
  workSpot?: { job: string; version: number; day: number; tile: number } | undefined;
  /** Village life: their favourite place for free blocks, drawn for the age band it was drawn at (saved, M3.12). */
  favourite?: { band: string; place: RoutinePlace | undefined } | undefined;
  /** Need id → 0-100 (100 satisfied); only the needs this person has. */
  needs: Record<string, number>;
  mood: number;
  stress: number;
  memories: Memory[];
  relationships: Map<Id, Relationship>;
  /** M3.3: the steward's assignment for the day; undefined when idle (set, never deleted, so records keep one shape). */
  jobId?: string | undefined;
  pos?: [number, number];
  /** M3.2: what they did in the last block run, and where (a building id, or null outdoors). */
  activity?: Activity;
  placeId?: Id | null;
  /** Village life: share of the block (0-1) that passes before they set off; the map's walk waits. */
  leaveAt?: number;
  /** Village life: the route walked this block (shared, read only), of which the first `walkTo` tiles were walked; absent when they stayed put. */
  walk?: readonly number[] | undefined;
  walkTo?: number | undefined;
  /** Village life: where they spend a free block, for the inspector ("at the alehouse"). */
  where?: string | undefined;
  /** The parts mood was summed from in the last block, for the inspector's "why" lines. */
  moodParts?: MoodPart[];
  /** Day of the last meal eaten. */
  lastAte?: number;
  /** Need id → last day something restored it, for "no work for 3 days" lines. */
  lastMet?: Record<string, number>;
  /** A small child's carer this block: they go where the carer goes. */
  with?: Id | undefined;
  /** A running breakdown: despair and wandering last days, tantrum and theft one block. */
  breakdown?: { kind: BreakdownKind; untilDay: number; eventId: Id } | undefined;
  /** M3.6: carrying a child, with the father and the day it is born. */
  pregnant?: { father: Id; dueDay: number } | undefined;
  /** M3.6: the adult who took this orphaned child in. */
  guardian?: Id | undefined;
  /** M3.6: day a spouse died; they may court again after the culture's mourning time. */
  widowedDay?: number | undefined;
  /** M3.7: standing 0-100 (role, wealth, fame, family), less shame; recomputed monthly. */
  status?: number;
  /** M3.7: shame from punishments, fading month by month. */
  shame?: number;
  /** M3.7: a fine or labour being worked off: the job is forced until `untilDay`. */
  sentence?:
    { kind: 'fine' | 'labour'; untilDay: number; eventId: Id; victim: Id | null } | undefined;
  /** M3.7: day of the last offence judged, for repeat offences. */
  lastOffence?: number;
  /** M3.5: wounds, illnesses and the like, newest last. */
  conditions: Condition[];
  /** Stays home: too ill or hurt to work (health below `abedBelow`, or a symptomatic disease). */
  abed?: boolean | undefined;
  /** Ailment or disease id → day their immunity ends. */
  immune?: Record<string, number>;
  /** Need id → days in a row the need has sat at zero (what starts hunger, thirst, cold). */
  lows?: Record<string, number>;
  /** M3.9: cantrips, lessons and reading. */
  lore?: PersonLore;
  /** M3.11: each block run so far today (index = block), for the inspector's "Today" line. */
  today?: BlockSpent[];
}

/** What a resident did in one block (M3.11): copies of the detail fields at the block's end. */
export interface BlockSpent {
  activity: Activity | undefined;
  placeId: Id | null;
  where: string | undefined;
  with: Id | undefined;
  jobId: string | undefined;
}

/** A resident's magic at the site (M3.9). */
export interface PersonLore {
  /** The cantrip being learned and from whom: a teacher (person id) or a book (item id). */
  learning?:
    { abilityId: string; teacher: Id | null; book: Id | null; lessons: number } | undefined;
  /** Ability id → how it was learned (none of these for cantrips known before watching began). */
  learned: Record<string, { teacher?: Id; book?: Id; day: number; eventId: Id }>;
  /** Casts per ability id on `castsDay` (the uses-per-day cap). */
  castsDay: number;
  casts: Record<string, number>;
  /** Casts per ability id since watching began. */
  castTotal: Record<string, number>;
  /** Evenings spent reading a book of a magic school, and the last such book (awakenings). */
  readDays: number;
  readBook?: Id | undefined;
  /** Days holding an item with a power effect, and that item (awakenings). */
  heldDays: number;
  heldItem?: Id | undefined;
}

/** One thing wrong with a person (M3.5). Health is 100 minus severity times the def's harm, summed. */
export interface Condition {
  defId: string;
  /** 0-100. */
  severity: number;
  sinceDay: number;
  /** The event behind it, for cause links. */
  cause?: Id;
  /** Its own onset event, if it had one. */
  eventId?: Id;
  /** The ailment or disease id a disease condition belongs to. */
  ailment?: string;
  stage?: 'incubating' | 'sick';
  /** A disease: symptoms begin on this day, and it ends on `untilDay`. */
  onsetDay?: number;
  untilDay?: number;
  /** A disease was tended before its peak, which is cut once. */
  cutPeak?: boolean;
  /** Looked after by a healer today. */
  tended?: boolean;
  /** How well: 1 with herbs, less without. */
  tendPower?: number;
  /** Disease: severity at the peak. Wound: the severity it began with. */
  peak?: number;
  /** Severity change per day (chronic and festering conditions). */
  rate?: number;
  /** An old wound's permanent cost. */
  lasting?: { attribute: string; amount: number };
}

/** One term of a person's mood: a low need, a memory or a trait. */
export interface MoodPart {
  kind: 'need' | 'memory' | 'trait';
  /** Need, memory or trait id. */
  id: string;
  value: number;
  /** The person a memory is about. */
  about?: Id;
}

export interface Memory {
  type: string;
  about?: Id;
  moodDelta: number;
  createdDay: number;
  decayDays: number;
  /** The event behind it, for cause links. */
  eventId?: Id;
}

export interface Relationship {
  /** This person's view of the other, -100 to 100. */
  opinion: number;
  /** friend, rival, enemy, lover (one-sided except lover). */
  labels: string[];
  /** M3.6: a grudge held against the other, with the event that caused it when there was one. */
  grudge?: { since: number; eventId?: Id } | undefined;
  /** Day a label last changed. */
  since?: number | undefined;
  /** Last day the two interacted. */
  met?: number | undefined;
  /** The event behind the last blow to the opinion (a theft or rage seen), or the one that made them lovers. */
  cause?: Id | undefined;
}

export interface Person {
  id: Id;
  name: string;
  raceId: string;
  cultureId: string | null;
  sex: 'f' | 'm';
  /** History year of birth (world tier); negative for people born before settlement. */
  born: number;
  birthplaceCell: number | null;
  /** History year of death. */
  died?: number;
  /** M3.5: the day (`world.day`) and event of a death at the watched site. */
  diedDay?: number;
  deathEvent?: Id;
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
  /** World tier (M2.5): the site a notable lives at and the civ they serve; null once both are gone. */
  siteId?: Id | null;
  civId?: Id | null;
  /** Why they are notable: a `NotableRole`. */
  title?: NotableRole;
  dynastyId?: Id;
  /** A `DeathCause`, set with `died`. */
  causeOfDeath?: DeathCause;
  /** The notable who killed them, when one did. */
  killerId?: Id;
  /** Symmetric rivalries (disputed thrones, insults). */
  rivals?: Id[];
  /** People this person has sworn vengeance on (one-way). */
  enemies?: Id[];
  /** M3.9: the one awakening of their life (an `AwakeningDef` id), the day and its event. */
  awakening?: { id: string; day: number; eventId: Id };
  /** M5.2: how a mage learned their magic and from whom (world tier). */
  lore?: MageLore;
}

/** M5.2: how a mage learned their magic and from whom. */
export interface MageLore {
  /** How they first learned: a teacher (incl. a parent), their people's college, a book, the village hedge-witch, or before the records began. */
  via: 'teacher' | 'college' | 'book' | 'hedge' | 'old';
  /** Their teachers in order (the first, then e.g. a legend who took them on later). */
  teachers: Id[];
  /** Apprentices they took, in order. */
  apprentices: Id[];
  /** College name when via college; book item id when via book; hedge-witch's site id when via hedge. */
  college?: string;
  bookId?: Id;
  siteId?: Id;
  /** Year apprenticeship began, and its event. */
  since: number;
  event?: Id;
  /** Each spell learned: ability id, history year, and the source (a teacher's person id, a book's item id, or a college name). */
  learned: { id: string; year: number; teacher?: Id; book?: Id; college?: string }[];
}

/** Why a world-tier person is tracked individually (M2.5). */
export const NOTABLE_ROLES = [
  'ruler',
  'kin',
  'founder',
  'hero',
  'captain',
  'raider',
  'crafter',
  'scholar',
  'mage',
  'priest',
  'prophet',
] as const;
export type NotableRole = (typeof NOTABLE_ROLES)[number];

export const DEATH_CAUSES = [
  'old-age',
  'famine',
  'disease',
  'battle',
  'beast',
  'raid',
  'razing',
  'murder',
  // M3.5: deaths at the watched site.
  'exposure',
  'thirst',
  'wound',
  'illness',
  'childbirth',
  // M3.7: put to death by the site's law.
  'execution',
  // M5.5: killed by another legend in single combat.
  'duel',
  // M4.7: died in a perilous place on an expedition.
  'peril',
  // Court intrigue: killed by a plot, or cast down from the seat by a rival.
  'assassination',
  'overthrow',
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

/** A family line (M2.5): founded by a ruler, hero or founder; children take the line of the more famous parent. */
export interface Dynasty {
  id: Id;
  name: string;
  founderId: Id;
  civId: Id | null;
  /** History year. */
  founded: number;
}

/** An artifact or book (M2.5). `holder` is a person id; null while lost. */
export interface Item {
  id: Id;
  kind: 'artifact' | 'book';
  name: string;
  /** What it is, for templates: "sword", "torc", "herbal". */
  form: string;
  /** History year it was made. */
  made: number;
  makerId: Id | null;
  holder: Id | null;
  /** Cell where it was lost, while lost. */
  lostAt?: number;
  /** Event ids of its making, inheritance, loss, theft and finding. */
  deeds: Id[];
  /** M5.2: magic spells (ability ids) a spellbook holds, and its school. */
  spells?: string[];
  school?: string;
  /** M5.2: history year it burned (holder null, never lost or found). */
  burned?: number;
}

/** A perilous place (M4.7): a ruin, old mine, barrow, empty lair or aura place in the wild. */
export interface PerilousPlace {
  id: Id;
  /** A `PlaceKindDef` id. */
  kind: string;
  /** Unique among places. */
  name: string;
  cell: number;
  /** History year it became a place (0 for the ancient ones). */
  since: number;
  /** Like a creature's danger: adults needed = danger * slayAdultsPerDanger. */
  danger: number;
  /** Treasures or lore still to be found besides the items lying there. */
  finds: number;
  /** The ruined site, for ruins and old mines. */
  siteId?: Id;
  /** The beast whose lair it was. */
  creatureId?: Id;
  /** The ruler buried in a barrow. */
  personId?: Id;
  /** The civ that raised a barrow. */
  civId?: Id;
  /** Year of the latest expedition. */
  lastVisit?: number;
  /** Year nothing was left to find. */
  emptied?: number;
  /** Event ids, oldest first. */
  deeds: Id[];
}

/** One history year as the world-map playback draws it. Display only: no rule reads it. */
export interface PlaybackYear {
  year: number;
  /** Display borders, encoded like `DecadeSnapshot.territory`; absent when unchanged since the year before. */
  territory?: Uint16Array;
  /** Same rows as `DecadeSnapshot.sites`. */
  sites: Uint32Array;
  /** [civId, capital site id] per standing civ. */
  seats: Uint32Array;
}

/** The yearly record behind the history playback on the world map. */
export interface PlaybackLog {
  /** One entry per year from 0, oldest first. */
  years: PlaybackYear[];
  /** Each decade's trades as flat [year, siteA, siteB, value] rows. */
  trade: Uint32Array;
}

/** Borders and sites at one decade (M2.5), for the M2.7 year slider. */
export interface DecadeSnapshot {
  /** History year. */
  year: number;
  /** `cells.territory` run-length encoded as [civId, runLength] pairs, row-major; runs ≤ 65535. */
  territory: Uint16Array;
  /** Per site existing at that year, in id order: [siteId, civId (0 none), population, ruined (0 or 1)]. */
  sites: Uint32Array;
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
  'hold',
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
  /** A free city: one city ruling itself, at the start or after breaking away. */
  free?: boolean;
  /** A pretender's realm (succession wars): the realm it rose against. */
  rebelOf?: Id;
  /** Year the ruling house took the seat, and how many of its rulers have held it since. */
  houseSince?: number;
  houseRulers?: number;
  /** The faith the realm keeps (faith.ts); filled at year 0 and for realms born later. */
  faithId?: Id;
}

/** A faith (religion engine): one per culture religion at the start, more by schism. Plain data. */
export interface Faith {
  id: Id;
  /** The `FaithDef` id, which is the culture religion id. */
  defId: string;
  name: string;
  /** One name is one god; two to four are a pantheon. */
  gods: string[];
  sacred: CultureValue[];
  abhors: CultureValue;
  /** Year it began: 0 for the old faiths. */
  founded: number;
  /** The faith it split from, and the prophet who split it. */
  parentId?: Id;
  founderId?: Id;
  highPriestId?: Id;
  /** The holy city: a site that stays while it is live and keeps the faith. */
  seatSiteId?: Id;
  /** Year no live site kept it any more. */
  forgotten?: number;
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
  /** The faith its people keep, which may differ from its realm's (faith.ts). */
  faithId?: Id;
}

/** What makes a dragon an individual (M5.6): its temper, its sleep and what it has hoarded. */
export interface DragonState {
  /** Id of its temper in the dragon rules. */
  temper: string;
  /** Years it had lived when it woke. */
  ageAtWaking: number;
  lairName: string;
  /** Slumbering tempers: asleep until this year, or awake until it. */
  asleepUntil?: number;
  awakeUntil?: number;
  /** The year the current sleep began. */
  sleptSince?: number;
  /** The year it last burned a site. */
  burned?: number;
  /** Tribute payments and raids taken, and the treasures (item ids) of the figures it killed. */
  hoard: { tribute: number; plunder: number; items: Id[] };
  /** Sites that paid tribute, in first-paid order. */
  tributeFrom: Id[];
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
  /** The hero notable who killed it. */
  slayerId?: Id;
  /** Where a roaming beast is this year (absent: at its lair). */
  haunt?: number;
  /** Figures it killed, in order. */
  kills?: Id[];
  /** Set for the world's dragon (M5.6). */
  dragon?: DragonState;
  /** Items a non-dragon great or legendary beast holds (M4.7); dragons keep `dragon.hoard.items`. */
  hoard?: Id[];
  deeds: Id[];
}

/** A 96x96 tile map of one site (M3.1). Layer values index the content's `site` glyph lists. */
export interface LocalMap {
  width: number;
  height: number;
  elevation: Int16Array;
  terrain: Uint8Array;
  water: Uint8Array;
  tree: Uint8Array;
  mineral: Uint8Array;
  /** Building id per tile, 0 = none. */
  building: Uint16Array;
  /** World cell coordinates of the site cell. */
  cellX: number;
  cellY: number;
  /** Tile indexes where a path crosses a river. */
  bridges: number[];
}

export interface Household {
  id: Id;
  members: Id[];
  head: Id;
  home: Id | null;
  /** M3.4: where the household sleeps while its own home is burnt (kin's home, else the hall); cleared when rebuilt. */
  lodgingHome?: Id | undefined;
}

/** Running state of the health system at the site (M3.5). */
export interface SiteHealth {
  /** Ailment or disease id → day of the last case that made the chronicle. */
  lastCase: Record<string, number>;
  /** Ailment or disease id → an outbreak is open. */
  outbreak: Record<string, boolean>;
  stats: {
    healerDays: number;
    herbsUsed: number;
    /** Most people abed on one day. */
    abedPeak: number;
    /** Wounds by tier id, cases by ailment or disease id, deaths by cause, lasting harms. */
    wounds: Record<string, number>;
    cases: Record<string, number>;
    deaths: Record<string, number>;
    lasting: number;
  };
}

/** Where a field's crop stands in the year (M3.4). */
export type CropStage = 'bare' | 'sown' | 'growing' | 'ripe' | 'cut' | 'ruined';

/** The crop of a followed field: grown from sowing to harvest, with soil kept across years. */
export interface Crop {
  stage: CropStage;
  /** 0 at sowing to 1 when ripe. */
  growth: number;
  health: number;
  sownDay: number;
  /** Share of the ripe grain still standing. */
  left: number;
  /** 0-100; starts at the cell's fertility and wears with each harvest. */
  soil: number;
  /** The soil the field started with: the most it recovers to. */
  soilStart: number;
  /** Sowing work done so far (effectiveness units) while bare in the sowing window. */
  sowProgress: number;
  /** Last day a farmer worked it. */
  lastWorked: number;
  /** A river, lake or sea tile lies within reach of the field. */
  nearWater: boolean;
  /** Degrees added to the frost thresholds: low ground (positive) freezes first, high ground last. */
  frostBias: number;
  /** Meals this year's crop should give at full health (set when sown). */
  expected: number;
  /** The field was sown this year (it is the harvest's share). */
  sownThisYear: boolean;
  /** A frost has bitten the young grain this year (shown on the map; changes no rule). */
  frostBitten?: boolean;
}

export interface Building {
  id: Id;
  defId: string;
  cells: number[];
  owner: Id | null;
  condition: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** False for homes of counted (unfollowed) households. */
  followed: boolean;
  /** Village life: the door, a wall tile on the street side (absent: bottom middle). */
  door?: number;
  /** M3.3: builder-blocks done while it is being raised; absent once complete. */
  progress?: number;
  /** Materials hauled to it so far, by item id. */
  delivered?: Record<string, number>;
  /** The event that began its raising, for the "finished" cause link. */
  begunEvent?: Id;
  /** M3.4: a followed field's crop. */
  crop?: Crop;
  /** M3.4: burnt down; a home is raised again by the build job, then this clears. */
  burnt?: boolean;
  /** The day it burnt, for the inspector. */
  burntDay?: number;
}

/** Sky of the day at the watched site (M3.4). */
export type Sky = 'clear' | 'rain' | 'storm' | 'snow';

/** The watched site's weather, rolled once a day (M3.4). */
export interface SiteWeather {
  tempC: number;
  lowC: number;
  /** Slow swing (°C) added to the seasonal curve. */
  anomaly: number;
  sky: Sky;
  dryDays: number;
  /** Days of snow lying; 0 none. */
  snowCover: number;
  /** Hours of daylight today, and whether that is too little for outdoor work in the afternoon. */
  daylightH: number;
  outdoorDark: boolean;
  /** The kind of year, rolled each Thawmonth. */
  year: { drought: boolean; hardWinter: boolean; droughtCause?: Id; winterCause?: Id };
  /** Last year was a hard winter (its cold runs into Thawmonth and Seedmonth). */
  priorHardWinter: boolean;
  wellLow: boolean;
  rainDaysThisYear: number;
  /** The open dry spell's event, while one lasts. */
  spellEvent: Id | null;
  /** Today's storm event, if the sky is stormy. */
  stormEvent: Id | null;
  /** Day of the last frost-on-crops event (-1 none). */
  frostEventDay: number;
  /** The year of the last first-snow event (-1 none). */
  snowEventYear: number;
  /** This winter (Firstfrost to Lastsnow): coldest night so far and days of snow. */
  winterColdest: number;
  winterSnowDays: number;
}

/** The harvest year (M3.4): what was sown, and what has been cut. */
export interface SiteHarvest {
  /** Calendar year (day / 336) it belongs to. */
  year: number;
  /** The sowing plan has been made. */
  planned: boolean;
  /** The sowing has been reported (all chosen fields sown, or the window closed). */
  sownReported: boolean;
  /** Field building ids picked for sowing, in sowing order. */
  sowFields: Id[];
  /** Fields sown, and the meals they should give at full health. */
  sown: number;
  expected: number;
  /** Meals cut so far. */
  cut: number;
  /** The harvest has been summed up (fair or poor event). */
  done: boolean;
  /** Events that hurt the crop (dry spell, frosts), for the poor-harvest causes. */
  causes: Id[];
  /** The poor-harvest event, if the year had one; cause of short meals. */
  poorEvent: Id | null;
  /** Share of a normal year (0 until summed up). */
  share: number;
  /** Grain held back to sow the followed fields that stand empty; meals and cooks leave it alone. */
  seedKept: number;
  /** M3.7: the event of the seed corn being opened while people starve; null while it is kept. */
  seedOpened?: Id | null;
}

/** Firewood and last winter's burn (M3.4). */
export interface SiteFirewood {
  /** Logs the steward keeps (and wares leave alone): last winter's burn plus building. */
  reserve: number;
  /** The steward's log target: the reserve plus headroom. */
  target: number;
  /** Last full winter's burn (Leaffall to Lastsnow), null until one has passed. */
  lastWinter: number | null;
  /** Burn so far this winter. */
  winterBurn: number;
  /** A winter's burn is being counted (Leaffall has been seen once). */
  counting: boolean;
  /** Followed homes with no logs today (building ids). */
  coldHomes: Id[];
  /** Homes that burned logs today: a lit hearth, and a chance of fire. */
  lit: Id[];
  /** Year the firewood-short event last fired (-1 none). */
  shortEventYear: number;
}

/** Game, berries and fish in the wild land around the site, 0-1 of full (M3.4). */
export interface SiteWild {
  game: number;
  berries: number;
  fish: number;
}

/** A wild animal wandering the map (M3.4). */
export interface Animal {
  id: number;
  kind: string;
  x: number;
  y: number;
}

/** The woods within reach of the stockpile, and the tiles felled (M3.4). */
export interface SiteWoods {
  atEmbark: number;
  now: number;
  /** Event when the woods thinned past the limit; null before. */
  thinEvent: Id | null;
  /** A tree was felled or grew back since the layout version last moved. */
  dirty: boolean;
  /** Wood left on trees being felled, by tile. */
  wood: Map<number, number>;
  /** Felled tiles and the day each grows back. */
  felled: { tile: number; tree: number; regrow: number }[];
}

/** A fire at the site (M3.4): burning tiles with the blocks each has left. */
export interface SiteFire {
  tiles: Map<number, number>;
  startedEvent: Id;
  cause: string;
  /** The home it began in, if any. */
  home: Id | null;
  /** Burnt tiles per building so far. */
  hits: Map<Id, number>;
  /** Tiles that burned, for the out-line. */
  trees: number;
  crops: number;
  /** The tile that burned first. */
  start: number;
  /** Tiles that burned out or were put out; they do not light again. */
  done: number[];
  /** A well, river, lake or sea lies within reach to fight with. */
  water: boolean;
  /** The home that burned, if any, for the out-line. */
  homes: Id[];
}

/** The live site (M3.1): its map, the people followed and what they own. */
export interface ActiveSite {
  /** Village life: the stall tiles on the square while a market morning runs; absent otherwise. */
  stalls?: number[] | undefined;
  siteId: Id;
  enteredDay: number;
  /** M3.11, for recaps: the site's people (followed and counted) when the season and year began, the first event id of the watch, and the counted share. */
  recap?: { season: number; year: number; firstEvent: Id; counted: number } | undefined;
  map: LocalMap;
  residents: Id[];
  /** Residents created at promotion (removed again on demotion). */
  promoted: Id[];
  /** M3.5: people who died here, in order; they are no longer in `residents`. */
  dead: Id[];
  /** M3.5: running counts for the health summary and the daily pass. */
  health?: SiteHealth;
  households: Map<Id, Household>;
  buildings: Map<Id, Building>;
  /** Item id → count (M3.3); food is counted in meals. */
  stock: Map<string, number>;
  /** Share of the site's people followed (1 when all). */
  share: number;
  /** Site goods when watching began, for exact demotion. */
  goodsAtEntry: Goods;
  /** World good → amount the item stock was worth at embark (followed share only). */
  stockAtEntry: Record<string, number>;
  /** Tile the layout grew from (the village green). */
  origin: [number, number];
  /** M3.2: the next day block to run (0 = night, see DAY_BLOCKS). */
  block: number;
  /** The open `stores_empty` event while the stores are bare, for cause links; null once refilled. */
  storesEmptyEvent: Id | null;
  /** M3.3: bumped whenever buildings or map tiles change, so views and caches know to refresh. */
  layoutVersion: number;
  /** World items held by residents at embark → their holder then (they go back on demotion). */
  itemsAtEntry: [Id, Id | null][];
  /** The steward's top priority last announced; null until the first day. */
  stewardFocus: string | null;
  /** M3.12: the last day plan's fingerprint, each farmer's last field and today's tile in it, kept with the save so a loaded site works as the running one would. */
  stewardPlan?: { signature: string; farmField: Map<Id, Id>; farmTile: Map<Id, number> };
  /** M3.12: cached walking routes by `from * tiles + to` (null: unreachable), saved for the same reason. */
  routes?: Map<number, number[] | null>;
  /** M3.12: the tree layer as of `version` (see `treesAtVersion`); saved. */
  treeView?: { version: number; tree: Uint8Array };
  /** M3.12: who is free to court this month (drawn when the month or the people change, then thinned as pairs form); saved. */
  courting?: { key: string; free: Set<Id> };
  /** M3.4: weather, crops, stores, fire and wild land. */
  weather: SiteWeather;
  harvest: SiteHarvest;
  firewood: SiteFirewood;
  /** Share of a full meal eaten (1 normally; 0.67-1 when the steward cuts meals), and why/since when. */
  mealShare: number;
  shortMealsEvent: Id | null;
  shortMealsSince: number;
  /** Food spoiled this month, this year and in all (meals), for the monthly line and the tuner. */
  spoiled: { month: number; year: number; total: number };
  wild: SiteWild;
  animals: Animal[];
  woods: SiteWoods;
  fire: SiteFire | null;
  /** Open ground that burnt in the last weeks, with the day it burnt. */
  burnt: { tile: number; day: number }[];
  /** M3.6: bumped when people are born, move household or die, so the main thread's roster refreshes. */
  peopleVersion: number;
  /** M3.6: net change of followed people by `race|culture|band`, applied to the site's counts on leaving. */
  popDelta: Record<string, number>;
  /** M3.6: interactions run so far (for the tuner). */
  interactions: number;
  /** M3.7: crimes waiting to be judged, funerals to hold, and running counts. */
  society: SiteSociety;
  /** M3.8: the threat coming to or at the site (one at a time), and the running record of threats. */
  threat: SiteThreat | null;
  threats: SiteThreats;
  /** M3.9: the hedge-witch, books on loan and what the cantrips did. */
  lore: SiteLore;
  /** M3.10: the site's leader and the caravans from its trade partners. */
  politics: SitePolitics;
}

/** M3.10: who leads the watched site, and the caravans that come to it. */
export interface SitePolitics {
  /** The leader (a resident), null before the first morning. */
  leaderId: Id | null;
  /** Day the leader took the seat, and the event that says so. */
  since: number;
  leaderEvent: Id | null;
  /** Trade partners (live sites that traded with this one late in history), strongest first. */
  partners: Id[];
  /** Caravans expected this year: [partner site id, day], soonest first. */
  visits: [Id, number][];
  /** Calendar year the visits were planned for. */
  plannedYear: number;
  /** The caravan at the site now. */
  caravan: { from: Id; arrived: number; leaves: number; event: Id } | null;
  /** History events already brought as news, so each visit tells something new. */
  told: Id[];
  stats: {
    successions: number;
    disputes: number;
    caravans: number;
    /** Items brought and taken away by caravans, by item id. */
    itemsIn: Record<string, number>;
    itemsOut: Record<string, number>;
  };
}

/** Light magic and lore at the watched site (M3.9). */
export interface SiteLore {
  /** The resident who teaches anyone gifted; null when no one qualifies. */
  hedgeWitch: Id | null;
  /** Books lent out: the owner stays the item's holder while the borrower reads it. */
  loans: { item: Id; owner: Id; borrower: Id; since: number; eventId: Id }[];
  /** Last day anyone worked an ore or stone job (the Dvergar dependency). */
  lastOreWorkDay: number;
  /** Last day the night's low threatened the fields with frost (a frost spell reads once). */
  frostDay?: number | undefined;
  stats: {
    learned: number;
    lent: number;
    lost: number;
    awakenings: number;
    /** Logs a kindled hearth did not burn. */
    logsSaved: number;
    /** Condition points mended back onto buildings. */
    mended: number;
    /** Conditions soothed. */
    soothed: number;
    /** Frosts read in the sky before they fell. */
    frostsRead: number;
    /** Stress points calmed away. */
    calmed: number;
    /** Hurts a soother eased at home before the healers came, sparing their herbs. */
    soothedAtHome: number;
    /** Herbs the healers did not need for those hurts. */
    herbsSpared: number;
  };
}

/** M3.8: a threat coming to or at the watched site. One at a time. */
export interface SiteThreat {
  kind: 'beast' | 'raid';
  /** 'warned': signs seen, not here yet; 'coming': on the map walking in; 'fighting'; 'leaving'. */
  stage: 'warned' | 'coming' | 'fighting' | 'leaving';
  /** Display name: the creature's name, or "raiders from {site}". */
  name: string;
  glyph: string;
  creatureId?: Id;
  /** Creature def id. */
  defId?: string;
  tier?: CreatureTier;
  /** The raiders' civ and home site. */
  civId?: Id;
  fromSiteId?: Id;
  /** Raiders still in the band (1 for a beast), and how many came. */
  count: number;
  came: number;
  /** A beast's remaining vigour, 0-1 (1 = unhurt). */
  vigour: number;
  /** Where the attackers stand now (tile index; -1 once off the map), the tile they are first seen at (outside the town on their side), and what they make for. */
  tile: number;
  edge: number;
  target: number;
  /** Day they arrive on the map (for 'warned'). */
  arriveDay: number;
  /** Compass word for the side they come from, and the lair clause for a beast ("" for raiders). */
  dir: string;
  whence: string;
  /** The people have judged whether to flee (the day before a warned arrival, or on arrival). */
  judged?: boolean;
  /** Blocks spent fighting so far. */
  rounds: number;
  /** Set on arrival: the attackers stand at the edge for one block while the militia gathers. */
  held?: boolean;
  /** Blocks spent ravaging the stores. */
  ravaged: number;
  /** The steward ordered flight: everyone walks to `camp` (outside the town toward `refugeId`). */
  fled: boolean;
  refugeId?: Id;
  camp?: number;
  /** Day the attackers left the map. */
  leftDay?: number;
  /** Event ids: first warning sign, arrival, flight order, for cause links. */
  signEvent?: Id;
  arriveEvent?: Id;
  fleeEvent?: Id;
  /** Running tallies for the out-line and the banner. */
  wounded: number;
  killed: number;
  attackersDown: number;
  loot: number;
  /** Residents defending (ids), chosen when the attackers appear. */
  militia: Id[];
  /** Residents at the site when the attackers appeared (the cap on deaths in one assault). */
  residentsAtArrival: number;
}

export interface SiteThreats {
  /** Creature id → day of its last attack here; civ id → day of the last raid (cooldowns). */
  lastBeast: [Id, number][];
  lastRaid: [Id, number][];
  /** Wall segments the steward still wants (tile indices), raised one at a time. */
  wallPlan: number[];
  /** Day the last beast or raid opened here (the site's quiet time runs from it). */
  lastThreatDay?: number;
  /** The arrival that made the steward plan walls (the Site tab names it). */
  wallsAfter?: Id;
  /** Day the site fell, if it did (everyone dead or gone). */
  fellDay?: number;
  stats: {
    prowlers: number;
    beasts: number;
    raids: number;
    flights: number;
    slain: number;
    repelled: number;
    deaths: number;
    wounds: number;
    looted: number;
    walls: number;
  };
}

/** A crime that came to light and waits for the morning's judgement (M3.7). */
export interface CrimeCase {
  crime: 'theft' | 'brawl' | 'murder';
  offender: Id;
  /** The wronged person, or null for a theft from the stores. */
  victim: Id | null;
  /** The crime's event. */
  eventId: Id;
  day: number;
}

/** M3.7: society's running state at the watched site. */
export interface SiteSociety {
  cases: CrimeCase[];
  funerals: { dead: Id; day: number; deathEvent: Id }[];
  /** Standing at which a resident counts as high: the content floor or the top tenth, whichever is higher. */
  highAt?: number;
  /** Exiles sent away: person → the site they went to. */
  exiles: [Id, Id][];
  /** For the tuner and the close's site stats: counts by crime, punishment and rite. */
  stats: {
    crimes: Record<string, number>;
    unsolved: number;
    punishments: Record<string, number>;
    festivals: number;
    funerals: number;
  };
}

/** A climate epoch still running when history ended, for the watched site's weather (M3.4). */
export interface ClimateEpoch {
  kind: 'dry' | 'cold';
  cell: number;
  radius: number;
  start: number;
  end: number;
  /** The opening event, a cause for the site's bad years. */
  began: Id;
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
  /** Perilous places (M4.7): ruins, old mines, barrows, empty lairs and aura places. Items lying in one have no holder and `lostAt` at its cell. */
  places: Map<Id, PerilousPlace>;
  /** Faiths, living and forgotten, filled by the history stage. */
  faiths: Map<Id, Faith>;
  /** Notables, living and dead (M2.5); everyone else is a count in `Site.pop`. */
  people: Map<Id, Person>;
  dynasties: Map<Id, Dynasty>;
  /** Artifacts and books (M2.5). */
  items: Map<Id, Item>;
  /** Decade snapshots of borders and sites (M2.5), oldest first. */
  snapshots: DecadeSnapshot[];
  /** Yearly borders, sites, capitals and trade for the playback; null until history runs. */
  playback: PlaybackLog | null;
  /** Climate epochs still running when history ended (M3.4); the site's weather follows them. */
  climateEpochs: ClimateEpoch[];
  events: SimEvent[];
  commands: Command[];
  /** Demo climate state for the scaffold; Phase 1 moves weather to per-cell climate. */
  weather: { current: string; sinceDay: number; causeEvent: Id | null };
  /** The site being watched day by day (Phase 3); null at world tier. */
  activeSite: ActiveSite | null;
}
