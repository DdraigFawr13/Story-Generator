// The day scheduler's system list. Today it holds only the seasonal weather demo, run by the
// classic viewer's `advance`; the watched site runs its own ordered day loop in
// `engine/site/tick.ts` and history its yearly loop in `engine/history/index.ts`. Order changes
// histories, so change any of the three deliberately.

import { allRuleSystems, type System } from '../core/scheduler';
import { seasonalWeatherSystem } from './weather';

export const DEFAULT_SYSTEMS: readonly System[] = [seasonalWeatherSystem, ...allRuleSystems()];
