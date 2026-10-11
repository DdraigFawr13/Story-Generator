// The canonical system order. Append new systems where they belong in the day
// (REBOOT_PLAN §6A/§9). Order changes histories, so change it deliberately.

import { allRuleSystems, type System } from '../core/scheduler';
import { seasonalWeatherSystem } from './weather';

export const DEFAULT_SYSTEMS: readonly System[] = [
  seasonalWeatherSystem,
  // Phase 3 inserts site-tier life systems here, roughly in this order:
  // schedule → needs → work/steward → environment → health → social → family → threats → mood
  // Phase 4 adds the monthly world-tier systems.
  ...allRuleSystems(),
];
