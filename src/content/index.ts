// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { BIOMES, BIOME_RULES } from './biomes';
import { cultures } from './cultures';
import { HISTORY } from './history';
import { NAMES } from './names';
import { races } from './races';
import { RESOURCES } from './resources';
import { SETTLEMENT } from './settlement';
import { eventTypes, rules, weather } from './world';

export const DEFAULT_CONTENT: ContentBundle = {
  biomes: BIOMES,
  biomeRules: BIOME_RULES,
  resources: RESOURCES,
  names: NAMES,
  races,
  cultures,
  schools,
  abilities,
  weather,
  eventTypes,
  rules,
  settlement: SETTLEMENT,
  history: HISTORY,
};

export * from './biomes';
export * from './cultures';
export * from './history';
export * from './map-layers';
export * from './names';
export * from './resources';
export * from './settlement';
