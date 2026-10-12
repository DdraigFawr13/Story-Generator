// Shapes for content data ("raws", REBOOT_PLAN §7.5). Data modules live in
// src/content and import these types; the engine never imports content data
// directly. The app passes a ContentBundle in, so the engine stays generic.

import type { Cadence, Season } from './clock';
import type { SimContext } from './context';
import type {
  Attributes,
  DeathCause,
  GoodId,
  Goods,
  NotableRole,
  SiteFeature,
  SiteKind,
} from './types';
import type { BirthTierId } from '../people/tiers';

export interface RaceDef {
  id: string;
  name: string;
  /** Typical adult value per attribute (1–20). */
  attributeMeans: Attributes;
  /** Inclusive clamp for rolled values. */
  attributeRange: [number, number];
  /** Relative birth weights per magic tier (§5.4A). Legendary is never rolled at birth. */
  magicTierWeights: Record<BirthTierId, number>;
  /** Relative weights for a gifted person's primary affinity (school ids). */
  affinityWeights: Record<string, number>;
  lifespanYears: number;
  maturityYears: number;
  /** Relative to humans = 1. */
  fertility: number;
  /** Daily food need relative to humans = 1. */
  foodNeed: number;
  preferredBiomes: string[];
  /** Environmental or resource dependencies; a balancing downside (R-29). */
  dependencies: { id: string; description: string }[];
}

/** Value dimensions a culture weighs 0–10; later systems read them (feuds, raids, trade, temples, mages). */
export const CULTURE_VALUES = [
  'kin',
  'honour',
  'faith',
  'wealth',
  'learning',
  'war',
  'freedom',
  'order',
] as const;
export type CultureValue = (typeof CULTURE_VALUES)[number];
export type MarriageCustom = 'one-spouse' | 'leaders-many-spouses';
export type MarriageGift = 'none' | 'bride-price' | 'dowry';
/** Who inherits property. */
export type InheritanceRule =
  | 'all-children'
  | 'eldest-son'
  | 'eldest-child'
  | 'youngest-keeps-hearth'
  | 'sons-temple-tithe'
  | 'best-apprentice';
/** How a ruler is chosen. */
export type SuccessionRule =
  | 'kin-elected'
  | 'eldest-son-assembly'
  | 'brother-first-gathering'
  | 'eldest-son-temple'
  | 'elder-council'
  | 'eldest-child';
export type GovernmentKind =
  'chieftaincy' | 'jarldom' | 'khanate' | 'priest-kingdom' | 'elder-council' | 'thanedom';
export type MagicAttitude = 'sacred' | 'honoured' | 'respected' | 'wary' | 'licensed';
export type SitePreference =
  'river' | 'coast' | 'aura' | 'plains' | 'deposit' | 'forest' | 'heights';

export interface CultureNames {
  /** Given names are a start plus an end: "Cad" + "oc". */
  givenStarts: string[];
  givenEnds: string[];
  /** Place names: start, optional middle, end. */
  placeStarts: string[];
  placeMiddles: string[];
  placeEnds: string[];
}

export interface CultureDef {
  id: string;
  name: string;
  raceId: string;
  /** One line shown in the legends browser. */
  summary: string;
  values: Record<CultureValue, number>;
  marriage: { custom: MarriageCustom; gift: MarriageGift; arranged: boolean };
  inheritance: InheritanceRule;
  government: GovernmentKind;
  succession: SuccessionRule;
  magic: MagicAttitude;
  religion: { id: string; name: string };
  preferredBiomes: string[];
  sitePreferences: SitePreference[];
  names: CultureNames;
}

export interface SchoolDef {
  id: string;
  name: string;
  /** Optional casting price (R-29 fork, Phase 5). Default: mild fatigue. */
  castingCost?: { fatigue: number; risk?: string };
}

export type AbilityFamily = 'craft' | 'labour' | 'combat' | 'social' | 'knowledge' | 'magic';
export type LearnSource = 'teacher' | 'book' | 'institution' | 'practice';

/**
 * One unified definition for skills, abilities and spells (R-25).
 * Requirements are hard gates; learnRate scales practice speed.
 */
export interface AbilityDef {
  id: string;
  name: string;
  family: AbilityFamily;
  /** Minimum attribute values, plus `power` and `affinity.<school>` for magic. */
  requirements: Partial<Record<keyof Attributes | 'power' | `affinity.${string}`, number>>;
  /** Attributes whose average speeds learning. */
  learnAttributes: (keyof Attributes)[];
  /** Magic may not use 'practice' (R-28: no self-discovery). */
  learnFrom: LearnSource[];
  school?: string;
  effect: AbilityEffect;
}

export interface AbilityEffect {
  kind: 'utility' | 'damage' | 'heal' | 'weather' | 'ward' | 'craft';
  /** Damage per use, measured in average-soldier weapon hits. */
  damage?: number;
  /** Radius in site tiles; 0 = single target. */
  areaRadius?: number;
  usesPerDay?: number;
  tag?: string;
}

export interface WeatherDef {
  id: string;
  name: string;
  /** Relative chance of this weather in each season. */
  seasonWeights: Record<Season, number>;
  /** Daily warmth-need modifier for Phase 3 (negative = colder). */
  warmth: number;
}

/** Every emitted event type needs an entry: no template, no event (§10). */
export interface EventTypeDef {
  id: string;
  baseImportance: number;
  category: 'nature' | 'social' | 'threat' | 'politics' | 'magic' | 'life' | 'world';
  /** At least one; three or more for common events (§2B). Use {name} placeholders. */
  templates: string[];
  /** `'year'`: history events carry no real day, so `{date}` prints as "Year N". */
  precision?: 'year';
  /** Which `data` keys name an entity, so biographies can index the event under it. */
  links?: Record<string, LinkKind>;
  /** The label in the yearly `year_summary` rollup, for types that are usually trivial. */
  rollup?: [singular: string, plural: string];
  /** Data keys that only some variants print (the first variant sets the key whitelist). */
  dataKeys?: string[];
  /** Short heading for lists and event pages; `{key}` placeholders are data keys (M2.7). */
  title?: string;
  /** The word a cause of this event carries in "why?" chains, e.g. "because of". Default "after". */
  causeWord?: string;
}

/** A named set of event types, for filters and colour keys in the Legends browser. */
export interface EventTypeGroup {
  id: string;
  label: string;
  types: string[];
}

/** The kind of entity a `links` data key names (by name; ids collide across kinds). */
export type LinkKind = 'civ' | 'site' | 'beast' | 'item' | 'dynasty';

/**
 * Data-driven event rule (§7.5). Today `subject` is only 'world'; Phase 2/3
 * add 'site' and 'person' iteration so `when`/`apply` receive the subject.
 */
export interface EventRuleDef {
  id: string;
  subject: 'world';
  cadence: Cadence;
  when(ctx: SimContext): boolean;
  /** Probability (0–1) per due check when `when` holds. Tune here, never script outcomes. */
  weight(ctx: SimContext): number;
  apply(ctx: SimContext): void;
}

export interface ContentBundle {
  biomes: BiomeDef[];
  biomeRules: BiomeRules;
  resources: ResourceDef[];
  names: NameTables;
  races: RaceDef[];
  cultures: CultureDef[];
  schools: SchoolDef[];
  abilities: AbilityDef[];
  weather: WeatherDef[];
  eventTypes: EventTypeDef[];
  /** Event type groups for Legends filters; optional so test bundles may omit them. */
  typeGroups?: EventTypeGroup[];
  rules: EventRuleDef[];
  settlement: SettlementRules;
  history: HistoryRules;
  creatures: CreatureDef[];
  diseases: DiseaseDef[];
  notables: NotableRules;
  biographies: BiographyRules;
}

/** Biographies (M2.6): how many chronicle lines an entity keeps and the words of its summary. */
export interface BiographyRules {
  /** Most chronicle lines in one biography; the first and last events are always kept. */
  maxLines: number;
  /** Per `NotableRole`: the noun in "stood as {title} of the {civ}". */
  roles: Record<NotableRole, string>;
  /** Per `DeathCause`: the phrase after "died", with its preposition ("of old age", "in a raid"). */
  causes: Record<DeathCause, string>;
  /** Summary sentence variants by name, filled with `fillTemplate`; the variant is chosen by id hash. */
  sentences: Record<string, string[]>;
}

/** Notables, families, succession and items (M2.5). Every number is a tunable; see content/notables.ts. */
export interface NotableRules {
  /** Living notables at most; kin spouses and children stop here, deed notables never do. */
  notableCap: number;
  /** Per culture id: the dynasty name pattern, `{name}` being the founder's given name. */
  dynastyNames: Record<string, string>;
  /** Fame (0-100) each way of becoming known starts with. */
  fame: {
    ruler: number;
    founder: number;
    captain: number;
    raider: number;
    crafter: number;
    scholar: number;
    /** A hero's fame is base plus per-danger times the beast's danger, at most `heroMax`. */
    hero: number;
    heroPerDanger: number;
    heroMax: number;
    /** Gained by a captain who wins a battle. */
    victory: number;
    legend: number;
    /** Fame of a mage by birth tier id (tiers not listed get 0). */
    mage: Partial<Record<string, number>>;
  };
  /** An event's importance gains floor(best actor fame / this), at most `actorFameCap`. */
  famePerImportance: number;
  actorFameCap: number;
  /** Names for roles and death causes in event text. */
  roleNames: Record<NotableRole, string>;
  deathPhrases: Record<DeathCause, string>;
  /** Succession clause per rule, for `ruler_succeeded`. */
  successionPhrases: Record<SuccessionRule, string>;
  /** Succession clause when no kin or notable of the civ was left to take the seat. */
  noHeirPhrase: string;
  /** Yearly death chance of an adult before elder age, and of a child. */
  adultDeath: number;
  childDeath: number;
  /** Extra yearly chance of dying in a famine or disease at the notable's site that year. */
  famineDeath: number;
  diseaseDeath: number;
  /** Chance a beast raid kills one notable at the site. */
  beastKill: number;
  /** Chance a civ raid kills one notable at the target, and takes one artifact held there. */
  raidKill: number;
  raidStealChance: number;
  /** Chance a raiding civ without a living raider gets one. */
  raiderChance: number;
  /** Share of a razed site's notables who die; the rest flee. */
  razeDeathShare: number;
  /** A ruler leads the army himself when the culture's war value is at least this. */
  rulerLeadsWar: number;
  /** Chance the losing and the winning captain of a battle die. */
  captainDeath: number;
  captainDeathWin: number;
  /** Yearly chance an unmarried adult marries. */
  marryChance: number;
  /** Chance a ruler's child in an arranged-marriage culture marries into a linked civ. */
  allianceChance: number;
  /** Share of the two civs' grievance against each other that an alliance marriage removes. */
  allianceGrievanceCut: number;
  /** Yearly chance a married ruler of a many-spouses culture takes another spouse. */
  extraSpouseChance: number;
  /** Yearly chance of a child for a fertile married woman, times race fertility and room under the cap. */
  childChance: number;
  /** Mage births among commoners: per adult per year, times race fertility and strong-or-better odds. */
  mageBirthRate: number;
  /** Share of those mages who become notable. */
  mageNotice: number;
  /** Each living strong-or-better mage adds their tier's soldier midpoint times this to civ strength. */
  mageStrength: number;
  /** Yearly chance a living adult of power 13 or more grows legendary, while a slot is open. */
  legendChance: number;
  /** Chance a contested succession becomes a dispute, the top two scores of an election count as contested within this margin, and the winner's roll is 0..disputeLuck. */
  disputeChance: number;
  disputeMargin: number;
  disputeLuck: number;
  /** Artifacts (each decade): a town or city with this much luxury stock makes one with this chance. */
  artifactMinLuxury: number;
  artifactChance: number;
  /** Chance per decade a notable of power 3 or more writes a book, and a temple without a scholar gets one. */
  bookChance: number;
  scholarChance: number;
  /** Chance an item with no heir goes to the ruler, and chance per decade a lost item is found. */
  itemToRulerChance: number;
  itemFindChance: number;
  /** Item names: `{epithet}`, `{form}`, `{maker}`. */
  artifactNames: string[];
  artifactForms: string[];
  artifactEpithets: string[];
  /** Book names: `{form}`, `{writer}`, `{site}`. */
  bookNames: string[];
  /** Book forms by school id; `mundane` is for scholars and for schools not listed. */
  bookForms: Record<string, string[]>;
}

/** A sickness (M2.4b). History uses the yearly fields; Phase 3 reads the per-day ones. */
export interface DiseaseDef {
  id: string;
  name: string;
  /** Event type emitted when it strikes a site. */
  event: string;
  /** History: chance per link per year of spreading from a sick site. Phase 3: per contact-day. */
  infectivity: number;
  /** Days before symptoms and days sick (used from Phase 3; a site is sick for one year in history). */
  incubation: number;
  duration: number;
  /** Share of a struck site's people who die, [min, max], before age risk. */
  severity: [number, number];
  /** Death multiplier per age band. */
  ageRisk: { child: number; adult: number; elder: number };
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Yearly chance a site of at least minPop starts an outbreak, times min(outbreakSizeCap, pop / minPop). */
  outbreak: number;
  minPop: number;
  /** Years a struck site cannot catch it again. */
  immunityYears: number;
}

export type CreatureTier = 'beast' | 'great' | 'legendary';

/** A kind of beast (M2.4). Danger is in soldier equivalents (R-24). */
export interface CreatureDef {
  id: string;
  name: string;
  tier: CreatureTier;
  /** Biome ids a lair can sit in. */
  biomes: string[];
  /** The lair cell's wildness must reach this (0-100). */
  minWildness: number;
  /** Soldier equivalents, 1..1000 (R-24). */
  danger: number;
  /** Most that live in a world at once. */
  maxAlive: number;
  /** Chance per decade, per free slot, that a new one appears. */
  spawnChance: number;
  /** Years a beast lives (min, max). */
  lifespan: [number, number];
  /** Chance per year of a raid, when a live site is in range. */
  raidChance: number;
  /** Chebyshev cells from the lair to a site it can raid. */
  raidRange: number;
  /** Name templates; `{near}` is the nearest live site at the time it appears. */
  names: string[];
}

/** Hard cap on a creature's danger, in soldier equivalents (R-24). */
export const MAX_CREATURE_DANGER = 1000;

/** Syllable and pattern tables for naming regions (M1.5). */
export interface NameTables {
  /** A place name stem is a start, optionally a middle, and an end: "Brann" + "ock". */
  starts: string[];
  middles: string[];
  ends: string[];
  /** Short capitalised words for compounds such as "the {a}teeth" -> "the Greyteeth". */
  adjectives: string[];
  /** Templates per region kind; `{n}` is the stem and `{a}` an adjective. 'ocean' is a sea touching the map edge. */
  patterns: Record<string, string[]>;
}

/** [r, g, b], each 0–255. */
export type Rgb = [number, number, number];

export interface BiomeDef {
  id: string;
  name: string;
  color: Rgb;
  /** Base fertility (0–100) before rainfall, season and floodplain adjustments. */
  fertility: number;
  /** Base wildness contribution (0–100): old forest and swamp high, grassland low. */
  wildness: number;
  /** Cost to cross one cell on foot (land biomes at least 1; unused for water biomes). */
  travel: number;
  /** True for forests (timber, game, old-forest aura, wildness). */
  forest?: boolean;
  /** Water biomes are assigned by water class, never by the climate table. */
  water?: 'sea' | 'coast' | 'lake';
}

export interface BiomeRules {
  /** Ascending upper bounds (°C) on mean annual temperature = (summer + winter) / 2; last band is open. */
  temperatureBands: number[];
  /** Ascending upper bounds (mm/yr) on rainfall; last band is open. */
  rainfallBands: number[];
  /** table[t][r] = biome id, for temperature band t and rainfall band r. Must be complete. */
  table: string[][];
  /** Land at or above this elevation (m) is alpine regardless of climate. */
  alpineElevation: number;
  /** Floodplain or lakeside land with rainfall >= this (mm) and mean temp >= swampMinTemp becomes swamp. */
  swampRainfall: number;
  swampMinTemp: number;
  /** Frost-free biomes only occur where the winter low is high enough; elsewhere the fallback biome is used. */
  frostFree: { biomes: string[]; minWinter: number; fallback: Record<string, string> };
  /** Sea cells within this many cells (8-neighbour) of land are coast, deeper ones ocean. */
  coastReach: number;
}

export interface ResourceDef {
  id: string;
  name: string;
  category: 'metal' | 'stone' | 'mineral' | 'food' | 'material' | 'magic';
  /** The good a deposit of this resource feeds (M2.4); omit if it feeds none. */
  good?: GoodId;
  /** Biome ids the resource can sit in (omit = any land). */
  biomes?: string[];
  /** Elevation window in metres (omit = no limit). */
  minElevation?: number;
  maxElevation?: number;
  /** Extra placement needs, all optional, all must hold. */
  needs?: {
    floodplain?: boolean;
    river?: boolean;
    /** Within this many cells of a volcano. */
    nearVolcano?: number;
    minAura?: number;
  };
  /** Clusters per 10 000 land cells, and target cells per cluster. */
  clustersPer10k: number;
  clusterSize: number;
  /** Hard cap on the share of land (or water, for fish) cells holding it, e.g. 0.002 for gems. */
  maxCellShare: number;
  /** Fish only: placed on coast/lake/river cells instead of land. */
  aquatic?: boolean;
}

export interface MapLayerStop {
  at: number;
  color: Rgb;
}

export interface MapLayerCategory {
  value: number;
  label: string;
  color: Rgb;
}

/**
 * A colour scheme for one world-map layer (Phase 1). The renderer in
 * worldgen/render.ts reads the cell values named by `id` (for example
 * "risk.drought") and paints them with these colours.
 */
export interface MapLayer {
  id: string;
  label: string;
  unit: string;
  kind: 'ramp' | 'categories';
  /** Ramp: colours linearly interpolated between stops, sorted by `at`. */
  stops?: MapLayerStop[];
  /** Elevation only: ramp for cells at or below sea level (metres, negative). */
  seaStops?: MapLayerStop[];
  /** Ramp only: bucket the value first, so `stops` are keyed by bucket number (log-like scales). */
  thresholds?: number[];
  /** Categories: one colour per value. */
  categories?: MapLayerCategory[];
  /** Categories: values past the list reuse colours in order (plate ids). */
  cycle?: boolean;
  /** Swatches shown in the map legend. */
  legend: { label: string; color: Rgb }[];
}

/** Tunable numbers for the settle stage (M2.2): where peoples found sites and how many people live there. */
export interface SettlementRules {
  /** Founding civs = clamp(min, max, floor(landCells / landCellsPerCiv) + a seeded draw of +-jitter). */
  civs: { min: number; max: number; landCellsPerCiv: number; jitter: number };
  /** Chance a civ also founds a second site, and how far from its capital (cells, Chebyshev). */
  secondSiteChance: number;
  secondSiteRange: [number, number];
  /** Least Chebyshev distance between two civs' capitals (relaxed by halves, not below `minCapitalSpacing`). */
  capitalSpacing: number;
  minCapitalSpacing: number;
  /** No site is founded within this many cells of another. */
  siteSpacing: number;
  /** Radius (cells, Chebyshev) of the land a site's people can farm, fish and hunt. */
  reach: number;
  /** Radii (cells, Chebyshev) within which a map feature counts for a site. */
  featureRadius: {
    river: number;
    coast: number;
    harbour: number;
    ford: number;
    pass: number;
    deposit: number;
    aura: number;
    routeNode: number;
  };
  /** Aura at the cell itself that counts as an aura site, and elevation (m) that counts as heights. */
  auraMin: number;
  heightsMin: number;
  /** Plains: one of these biomes and travel cost at most `plainsMaxTravel`. */
  plainsBiomes: string[];
  plainsMaxTravel: number;
  /** Resource categories that make a mine site. */
  mineCategories: ResourceDef['category'][];
  /** Resource ids that feed a site beyond farming. */
  fishId: string;
  gameId: string;
  capacity: {
    /** People fed per fertility point per cell. */
    perFertility: number;
    fishPerAmount: number;
    gamePerAmount: number;
    /** Multipliers for trade access. */
    port: number;
    ford: number;
    road: number;
    /** Farming multiplier on cells outside the race's preferred biomes. */
    foreignBiome: number;
    /** Extra multipliers by race and site feature, e.g. ore traded for food. */
    raceFeature: Record<string, Partial<Record<SiteFeature, number>>>;
    /** Food multiplier clamp(meanAura / ref, min, max) for races bound to aura, by race id. */
    raceAura: Record<string, { ref: number; min: number; max: number }>;
    /** Food multiplier when the feature is absent, by race id. */
    raceWithout: Record<string, Partial<Record<SiteFeature, number>>>;
  };
  /** Suitability score weights (higher is better). */
  suitability: {
    fertility: number;
    preferredBiome: number;
    preference: number;
    routeNode: number;
    jitter: number;
  };
  /** Founding population ranges (uniform ints); capped at `popCapacityShare` of capacity, never below `minPop`. */
  capitalPop: [number, number];
  secondPop: [number, number];
  popCapacityShare: number;
  minPop: number;
  /** Starting stores in years of food. */
  storesYears: number;
  /** Child share = clamp(maturity / lifespan * childFactor, childMin, childMax). */
  ageBands: { childFactor: number; childMin: number; childMax: number; elderShare: number };
  /** Ordinary site kind: the first entry whose limit exceeds the population; larger is a city. */
  kindByPop: [number, SiteKind][];
  /** Culture id to the kind of its capital, instead of the size kind. */
  capitalKind: Record<string, SiteKind>;
  /** Civ name templates per government; `{n}` is the capital's name. */
  civNames: Record<GovernmentKind, string>;
  /** Cost cap (summed travel cost) of a site's territory. */
  territoryReach: number;
}

/** Tunable numbers for the yearly history stage (M2.3); see engine/history/. Rates are per year. */
/** Climate epochs (M2.4b): slow regional dry or cold spells that raise drought and winter odds. */
export interface ClimateRules {
  /** Chance per year that a new epoch starts, while fewer than `maxActive` run. */
  startChance: number;
  maxActive: number;
  /** Length range in years. */
  years: [number, number];
  /** Radius range in cells; sets the share of the map an epoch covers. */
  radius: [number, number];
  /** Share of epochs that are dry (the rest are cold). */
  dryShare: number;
  /**
   * Inside a dry or cold epoch the drought or winter chance is max(chance * mul, floor), and every
   * harvest there is multiplied by `yield`, bad year or not.
   */
  dry: { mul: number; floor: number; yield: number };
  cold: { mul: number; floor: number; yield: number };
}

/** Event importance scoring and rollups (M2.4b). */
export interface ImportanceRules {
  /** Bonus for events at a live site of this kind, and at a civ's capital. */
  kindFame: Partial<Record<SiteKind, number>>;
  capitalFame: number;
  /** [threshold, bonus] pairs ascending: the largest threshold `dead` (or `count`) reaches gives its bonus. */
  scale: [number, number][];
  /** Bonus the first time a type is emitted in a run. */
  novelty: number;
  /** Same type at the same place within this many years loses `repeatPenalty`. */
  repeatYears: number;
  repeatPenalty: number;
  /** Events under this importance roll up into the yearly summary and are pruned unless cited. */
  rollupBelow: number;
}

export interface HistoryRules {
  /** Harvest yield is 1 plus or minus this much, uniform. */
  harvestVariance: number;
  /** Drought chance per site per year = risk.drought / 100 * droughtScale; yield multiplier when it hits. */
  droughtScale: number;
  droughtYield: number;
  /** Harsh winter chance = risk.snow / 100 * winterScale; yield multiplier when it hits. */
  winterScale: number;
  winterYield: number;
  /** Food (in people fed) each person can produce, up to the site's capacity. */
  workerOutput: number;
  /** Stores never exceed this many years of need. */
  storesCapYears: number;
  /** Births per adult per year, before race fertility and crowding. */
  birthRate: number;
  /** Births fall by this share at full crowding. */
  crowdingBirthCut: number;
  /** Crowding (pop / capacity) at which births start to fall; the cut grows linearly to full crowding. */
  crowdingFrom: number;
  /** Yearly death rates for a human child and adult at zero crowding. */
  childDeath: number;
  adultDeath: number;
  /** Child and adult deaths rise by (1 + crowding * crowdingDeathRise). */
  crowdingDeathRise: number;
  /** Lifespan (years) the child and adult death rates are set for; longer-lived races die proportionally less. */
  referenceLifespan: number;
  /** Elders are the last share of a lifespan; their death rate is 1 / (lifespan * elderLifeShare). */
  elderLifeShare: number;
  /** Floors on the years spent as an adult and as an elder (caps the ageing and death rates). */
  minAdultYears: number;
  minElderYears: number;
  /** Share of a starving site's people who die, times the shortfall (0-1). */
  famineDeathShare: number;
  /** A famine with no bad year of its own names the site's earlier trouble up to this many years back. */
  famineCauseYears: number;
  /** Outbreak chance scales with pop / minPop up to this many times. */
  outbreakSizeCap: number;
  /** Share of children and adults who leave a starving or overfull site. */
  migrantShare: number;
  /** A site above this share of capacity may found a new site. */
  expandAt: number;
  /** Years between expansions from one site. */
  expandCooldown: number;
  expandChance: number;
  /** Chebyshev distance range (cells) of a new site from its source. */
  expandRange: [number, number];
  /** Share of children and adults who found the new site. */
  expandShare: number;
  /** A new site starts with this many years of food. */
  newSiteStoresYears: number;
  /** No new site within this many cells (Chebyshev) of another, live or ruined. */
  newSiteSpacing: number;
  /** A new site's capacity (for its civ's race) must reach this, about a village. */
  minNewSiteCapacity: number;
  /** Years before a civ may found another site. */
  civFoundCooldown: number;
  /** A bad harvest is an event only when stores after it fall under this many years of need. */
  shortStoresYears: number;
  climate: ClimateRules;
  importance: ImportanceRules;
  /** A town or city only drops a kind when under its lower limit by this share. */
  kindHysteresis: number;
  /** Sites under this population are abandoned. */
  abandonBelow: number;
  /** Travel cost within which two sites are linked, and the range (cells) of sea lanes between harbours. */
  linkReach: number;
  seaLinkRange: number;

  // Beasts (M2.4).
  /** Random land cells tried per spawn to find a lair. */
  beastSpawnTries: number;
  /** A lair is more than this many cells (Chebyshev) from any live site. */
  lairSpacing: number;
  /** A beast raid kills at most this share of a site, and about `danger` times the per-danger rate, at 0.5-1.5. */
  raidKillCap: number;
  raidKillPerDanger: number;
  /** Share of a raided site's stores that is lost. */
  raidStoresLoss: number;
  /** Chance the raided site slays the beast = base * min(1, adults / (danger * adultsPerDanger)) * tier factor. */
  slayBase: number;
  slayAdultsPerDanger: number;
  slayTierFactor: Record<CreatureTier, number>;

  // Trade (M2.4), once a decade.
  /** Resource deposits within this many cells (Chebyshev) of a site are its goods. */
  tradeGoodsRange: number;
  /** A site keeps this many years of food before it has a surplus, and wants this many before it has a shortage. */
  tradeKeepYears: number;
  /** Wealth both sides gain per unit of a good moved in trade. */
  goodValue: Goods;
  /** Wealth lost per decade, as a share. */
  wealthDecay: number;
  /** Share of its luxury stock a site sends to a partner with less, each trade round (at most half the gap). */
  luxuryTradeShare: number;

  // Goods (M2.4), yearly. Food is in `workerOutput` and `storesCapYears`.
  /** Units of each non-food good one adult makes a year when deposits are plentiful. */
  goodsPerWorker: Goods;
  /** Deposits (cells within `tradeGoodsRange`) of a good that give full output; fewer give a proportion. */
  depositsForFull: number;
  /** A stock of a non-food good never exceeds this many years of full output. */
  goodsCapYears: number;
  /** Yearly need: ore and timber per adult, salt per person; luxury and food are not listed here. */
  need: Goods;
  /** Food stores cap multiplier while the salt stock is under a year's need (below 1). */
  saltShortStoresCap: number;
  /** Civ strength is multiplied by 1 + this * min(1, ore stock per adult). */
  oreStrength: number;
  /** Each year a site's wealth rises by luxury stock * goodValue.luxury * this. */
  luxuryWealthShare: number;
  /** Richer civ's wealth over this multiple of the poorer's, and at least `envyMinWealth`, breeds envy. */
  envyRatio: number;
  envyMinWealth: number;

  // Grievance (M2.4).
  /** A famished site of a culture with `values.war` at or above this may raid a neighbour. */
  raidWarValue: number;
  /** Chance per year = this * values.war / 10. */
  civRaidChance: number;
  /** Share of the target's food taken, at most one year of the raider's food; luxury is taken too when food falls short. */
  raidLootShare: number;
  /** Share of the target's people killed (min, max). */
  civRaidDeaths: [number, number];
  /** Grievance added by each kind of wrong; vengeance is added when a ruler's kin swear an oath against a foreign killer. */
  grievance: { raid: number; border: number; insult: number; envy: number; vengeance: number };
  /** Two civs with at least this many neighbouring territory cells may clash. */
  borderCells: number;
  /** Chance per decade = this * (warA + warB) / 20. */
  borderClashChance: number;
  /** Chance per decade that one of two linked civs insults the other. */
  insultChance: number;
  /** Grievance is multiplied by this each year and forgotten under 0.5. */
  grievanceDecay: number;

  // War (M2.4).
  /** Soldiers per adult = (strength + agility + endurance) / this * levyShare. */
  soldierBase: number;
  levyShare: number;
  /** Strength ratio of attacker to defender is capped here. */
  maxStrengthRatio: number;
  /** Opportunity multiplier when every defender site in reach holds a pass or ford. */
  crossingPenalty: number;
  /** A war starts when grievance * opportunity reaches this. */
  warThreshold: number;
  /** Share of a civ's strength in the field each year. */
  campaignShare: number;
  /** Defence multipliers by site feature (heights, pass, ford), kind (fortress) and 'capital'. */
  defence: Record<string, number>;
  /** Each side's strength is multiplied by 1 plus or minus this. */
  battleLuck: number;
  /** Share of the army lost by the loser and the winner. */
  loserLoss: number;
  winnerLoss: number;
  /** Chance a conquered site is razed instead (doubled when the races differ). */
  razeChance: number;
  /** Share of a razed site's people who die; the rest flee. */
  razeDeathShare: number;
  /** A war ends after this many years, or when a side's war dead pass this share of its starting adults. */
  maxWarYears: number;
  wearyShare: number;
  /** Years after peace before either side can declare again. */
  peaceYears: number;
}
