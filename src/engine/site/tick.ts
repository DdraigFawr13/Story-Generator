// The daily site step (M3.1). The world is frozen while a site is watched.

import type { SimEvent, WorldState } from '../core/types';
import type { SiteContent } from './defs';

/** Advances `world.day` by one and returns the events emitted that day. */
export function stepSite(world: WorldState, _content: SiteContent): SimEvent[] {
  const first = world.events.length;
  // M3.2+ systems (needs, movement, work, health, relationships, threats) run here, in a fixed order.
  world.day += 1;
  return world.events.slice(first);
}
