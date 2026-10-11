// The default content bundle. Add new content modules here.
import type { ContentBundle } from '../engine';
import { abilities, schools } from './abilities';
import { races } from './races';
import { eventTypes, rules, weather } from './world';

export const DEFAULT_CONTENT: ContentBundle = {
  races,
  schools,
  abilities,
  weather,
  eventTypes,
  rules,
};

export * from './map-layers';
