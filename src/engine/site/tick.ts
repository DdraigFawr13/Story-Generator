// The daily site step (M3.1, filled by M3.2). The world is frozen while a site is watched.

import type { SimEvent, WorldState } from '../core/types';
import type { SiteContent } from './defs';
import { stepBlock } from './life';

/** Runs blocks until `world.day` advances by one and returns the events emitted meanwhile. */
export function stepSite(world: WorldState, content: SiteContent): SimEvent[] {
  const first = world.events.length;
  const day = world.day;
  // M3.3+ systems (jobs, health, relationships, threats) hook in per block inside stepBlock.
  while (world.day === day) stepBlock(world, content);
  return world.events.slice(first);
}
