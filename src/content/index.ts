// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { BIOMES, BIOME_RULES } from './biomes';
import { races } from './races';
import { RESOURCES } from './resources';
import { eventTypes, rules, weather } from './world';

export const DEFAULT_CONTENT: ContentBundle = {
  biomes: BIOMES,
  biomeRules: BIOME_RULES,
  resources: RESOURCES,
  races,
  schools,
  abilities,
  weather,
  eventTypes,
  rules,
};

export * from './biomes';
export * from './map-layers';
export * from './resources';
