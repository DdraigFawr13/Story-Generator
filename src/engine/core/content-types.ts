// Shapes for content data ("raws", REBOOT_PLAN §7.5). Data modules live in
// src/content and import these types; the engine never imports content data
// directly. The app passes a ContentBundle in, so the engine stays generic.

import type { Cadence, Season } from './clock';
import type { SimContext } from './context';
import type { Attributes } from './types';
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
  /** Mark races still awaiting the user's Phase 2 sketch approval. */
  placeholder?: boolean;
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
  schools: SchoolDef[];
  abilities: AbilityDef[];
  weather: WeatherDef[];
  eventTypes: EventTypeDef[];
  rules: EventRuleDef[];
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
