// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { BIOGRAPHIES } from './biographies';
import { BIOMES, BIOME_RULES } from './biomes';
import { creatures } from './creatures';
import { cultures } from './cultures';
import { diseases } from './diseases';
import { AILMENTS, CONDITIONS, HEALTH, HEALTH_EVENTS, HEALTH_MEMORIES } from './health';
import { HISTORY } from './history';
import { ITEMS } from './items';
import { JOBS, STEWARD, WORK_EVENTS } from './jobs';
import { TYPE_GROUPS } from './legends';
import { LIFE, LIFE_EVENTS, MEMORIES, NEEDS, TRAITS } from './life';
import { NAMES } from './names';
import { NOTABLES } from './notables';
import { races } from './races';
import { RESOURCES } from './resources';
import { SETTLEMENT } from './settlement';
import { SITE } from './site';
import { ENVIRONMENT, WEATHER_EVENTS } from './weather';
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
  eventTypes: [...eventTypes, ...LIFE_EVENTS, ...WORK_EVENTS, ...WEATHER_EVENTS, ...HEALTH_EVENTS],
  typeGroups: TYPE_GROUPS,
  rules,
  settlement: SETTLEMENT,
  history: HISTORY,
  creatures,
  diseases,
  notables: NOTABLES,
  biographies: BIOGRAPHIES,
  site: SITE,
  needs: NEEDS,
  traits: TRAITS,
  memories: [...MEMORIES, ...HEALTH_MEMORIES],
  life: LIFE,
  items: ITEMS,
  jobs: JOBS,
  steward: STEWARD,
  environment: ENVIRONMENT,
  health: HEALTH,
  conditions: CONDITIONS,
  ailments: AILMENTS,
};

export * from './biographies';
export * from './biomes';
export * from './buildings';
export * from './creatures';
export * from './cultures';
export * from './diseases';
export * from './health';
export * from './history';
export * from './items';
export * from './jobs';
export * from './legends';
export * from './life';
export * from './map-layers';
export * from './names';
export * from './notables';
export * from './playback';
export * from './resources';
export * from './settlement';
export * from './site';
export * from './weather';
