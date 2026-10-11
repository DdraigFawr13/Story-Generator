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
  races: RaceDef[];
  schools: SchoolDef[];
  abilities: AbilityDef[];
  weather: WeatherDef[];
  eventTypes: EventTypeDef[];
  rules: EventRuleDef[];
}
