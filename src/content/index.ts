// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { BIOGRAPHIES } from './biographies';
import { BIOMES, BIOME_RULES } from './biomes';
import { creatures } from './creatures';
import { cultures } from './cultures';
import { diseases } from './diseases';
import { dragons } from './dragons';
import { GREAT_WORKS } from './great-works';
import { places } from './places';
import { FAITHS, FAITH_EVENTS } from './faiths';
import { AILMENTS, CONDITIONS, HEALTH, HEALTH_EVENTS, HEALTH_MEMORIES } from './health';
import { FAMILY, FAMILY_EVENTS, FAMILY_MEMORIES } from './family';
import { HISTORY } from './history';
import { INTERACTIONS, SOCIAL, SOCIAL_EVENTS } from './interactions';
import { SOCIETY, SOCIETY_EVENTS, SOCIETY_MEMORIES } from './society';
import { THREATS, THREAT_EVENTS, THREAT_MEMORIES } from './threats';
import { LORE, LORE_EVENTS, LORE_MEMORIES } from './lore';
import { ANNALS } from './annals';
import { BATTLES } from './battles';
import { AWAKENINGS } from './awakenings';
import { CHRONICLE, CHRONICLE_EVENTS } from './chronicle';
import { PLAY_BY_PLAY } from './playbyplay';
import { POLITICS, POLITICS_EVENTS } from './politics';
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
  eventTypes: [
    ...eventTypes,
    ...LIFE_EVENTS,
    ...WORK_EVENTS,
    ...WEATHER_EVENTS,
    ...HEALTH_EVENTS,
    ...SOCIAL_EVENTS,
    ...FAMILY_EVENTS,
    ...SOCIETY_EVENTS,
    ...THREAT_EVENTS,
    ...LORE_EVENTS,
    ...POLITICS_EVENTS,
    ...CHRONICLE_EVENTS,
    ...FAITH_EVENTS,
  ],
  typeGroups: TYPE_GROUPS,
  rules,
  settlement: SETTLEMENT,
  history: HISTORY,
  creatures,
  dragons,
  greatWorks: GREAT_WORKS,
  places,
  faiths: FAITHS,
  diseases,
  notables: NOTABLES,
  biographies: BIOGRAPHIES,
  site: SITE,
  needs: NEEDS,
  traits: TRAITS,
  memories: [
    ...MEMORIES,
    ...HEALTH_MEMORIES,
    ...FAMILY_MEMORIES,
    ...SOCIETY_MEMORIES,
    ...THREAT_MEMORIES,
    ...LORE_MEMORIES,
  ],
  life: LIFE,
  items: ITEMS,
  jobs: JOBS,
  steward: STEWARD,
  environment: ENVIRONMENT,
  health: HEALTH,
  conditions: CONDITIONS,
  ailments: AILMENTS,
  interactions: INTERACTIONS,
  social: SOCIAL,
  family: FAMILY,
  society: SOCIETY,
  threats: THREATS,
  lore: LORE,
  awakenings: AWAKENINGS,
  politics: POLITICS,
  chronicle: CHRONICLE,
  playByPlay: PLAY_BY_PLAY,
  battles: BATTLES,
  annals: ANNALS,
};

export * from './annals';
export * from './battles';
export * from './biographies';
export * from './chronicle';
export * from './biomes';
export * from './buildings';
export * from './creatures';
export * from './cultures';
export * from './diseases';
export * from './dragons';
export * from './great-works';
export * from './places';
export * from './faiths';
export * from './health';
export * from './family';
export * from './history';
export * from './interactions';
export * from './society';
export * from './threats';
export * from './lore';
export * from './politics';
export * from './items';
export * from './jobs';
export * from './legends';
export * from './life';
export * from './map-layers';
export * from './names';
export * from './notables';
export * from './playback';
export * from './playbyplay';
export * from './resources';
export * from './settlement';
export * from './site';
export * from './weather';
