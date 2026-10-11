// Shapes for content data ("raws", REBOOT_PLAN §7.5). Data modules live in
// src/content and import these types; the engine never imports content data
// directly. The app passes a ContentBundle in, so the engine stays generic.

import type { Cadence, Season } from './clock';
import type { SimContext } from './context';
import type { Attributes, SiteFeature, SiteKind } from './types';
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
}

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
  rules: EventRuleDef[];
  settlement: SettlementRules;
  history: HistoryRules;
}

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
  /** Founding civs = clamp(min, max, floor(landCells / landCellsPerCiv)). */
  civs: { min: number; max: number; landCellsPerCiv: number };
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
  /** Plague: smallest site that can start an outbreak, yearly chance, share killed (min, max). */
  plagueMinPop: number;
  plagueChance: number;
  plagueDeath: [number, number];
  /** Chance an infected site infects each linked site the next year. */
  plagueSpread: number;
  /** Years a site cannot be infected again. */
  plagueImmunityYears: number;
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
  /** A town or city only drops a kind when under its lower limit by this share. */
  kindHysteresis: number;
  /** Sites under this population are abandoned. */
  abandonBelow: number;
  /** Travel cost within which two sites are linked, and the range (cells) of sea lanes between harbours. */
  linkReach: number;
  seaLinkRange: number;
}
