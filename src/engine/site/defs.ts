// Small lookups shared by the site modules: layer codes by content id.

import type {
  BuildingDef,
  ContentBundle,
  RaceDef,
  SiteGlyphDef,
  SiteRules,
} from '../core/content-types';

/** What the site modules read from content (all plain data, so it crosses into a worker). */
export type SiteContent = Pick<
  ContentBundle,
  | 'biomes'
  | 'resources'
  | 'races'
  | 'cultures'
  | 'eventTypes'
  | 'settlement'
  | 'history'
  | 'site'
  | 'needs'
  | 'traits'
  | 'memories'
  | 'life'
  | 'abilities'
  | 'items'
  | 'jobs'
  | 'steward'
  | 'environment'
  | 'health'
  | 'diseases'
  | 'conditions'
  | 'ailments'
  | 'interactions'
  | 'social'
  | 'family'
  | 'society'
>;

/** A person's age band: children play, adults work, elders work lightly. */
export type Band = 'child' | 'adult' | 'elder';

/** Share of a lifespan at which a person counts as an elder. */
const ELDER_FROM = 0.7;

/** Ages at which a race's child, adult and elder bands begin (elders end at the lifespan). */
export function ageBands(race: Pick<RaceDef, 'maturityYears' | 'lifespanYears'>) {
  return {
    adultFrom: race.maturityYears,
    elderFrom: Math.round(race.lifespanYears * ELDER_FROM),
    elderTo: race.lifespanYears,
  };
}

export function bandOfAge(
  race: Pick<RaceDef, 'maturityYears' | 'lifespanYears'>,
  age: number,
): Band {
  const bands = ageBands(race);
  return age < bands.adultFrom ? 'child' : age < bands.elderFrom ? 'adult' : 'elder';
}

/** Index of the entry with `id`; throws when content lacks it (validateContent checks the list). */
export function indexOfId(list: readonly SiteGlyphDef[], id: string): number {
  const index = list.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error(`Site content has no "${id}".`);
  return index;
}

/** Terrain, water, tree, mineral codes and building ids the site modules write into a `LocalMap`. */
export function siteCodes(rules: SiteRules) {
  return {
    grass: indexOfId(rules.terrains, 'grass'),
    scrub: indexOfId(rules.terrains, 'scrub'),
    marsh: indexOfId(rules.terrains, 'marsh'),
    shore: indexOfId(rules.terrains, 'shore'),
    rock: indexOfId(rules.terrains, 'rock'),
    field: indexOfId(rules.terrains, 'field'),
    path: indexOfId(rules.terrains, 'path'),
    floor: indexOfId(rules.terrains, 'floor'),
    wall: indexOfId(rules.terrains, 'wall'),
    river: indexOfId(rules.waters, 'river'),
    sea: indexOfId(rules.waters, 'sea'),
    lake: indexOfId(rules.waters, 'lake'),
    broadleaf: indexOfId(rules.trees, 'broadleaf'),
    conifer: indexOfId(rules.trees, 'conifer'),
    stone: indexOfId(rules.minerals, 'stone'),
    ore: indexOfId(rules.minerals, 'ore'),
    clay: indexOfId(rules.minerals, 'clay'),
  };
}
export type SiteCodes = ReturnType<typeof siteCodes>;

/** The size of a building definition. */
export function buildingDef(rules: SiteRules, id: string): BuildingDef {
  const def = rules.buildings.find((b) => b.id === id);
  if (!def) throw new Error(`Site content has no building "${id}".`);
  return def;
}
