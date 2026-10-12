// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { BIOGRAPHIES } from './biographies';
import { BIOMES, BIOME_RULES } from './biomes';
import { creatures } from './creatures';
import { cultures } from './cultures';
import { diseases } from './diseases';
import { HISTORY } from './history';
import { TYPE_GROUPS } from './legends';
import { NAMES } from './names';
import { NOTABLES } from './notables';
import { races } from './races';
import { RESOURCES } from './resources';
import { SETTLEMENT } from './settlement';
import { SITE } from './site';
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
  typeGroups: TYPE_GROUPS,
  rules,
  settlement: SETTLEMENT,
  history: HISTORY,
  creatures,
  diseases,
  notables: NOTABLES,
  biographies: BIOGRAPHIES,
  site: SITE,
};

export * from './biographies';
export * from './biomes';
export * from './creatures';
export * from './cultures';
export * from './diseases';
export * from './history';
export * from './legends';
export * from './map-layers';
export * from './names';
export * from './notables';
export * from './resources';
export * from './settlement';
export * from './site';
