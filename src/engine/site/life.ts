// Daily life (M3.2, REBOOT_PLAN §6A): four blocks a day. Each block every resident picks an
// activity from the schedule (or a running breakdown), walks toward its place, satisfies and
// loses needs, and sums mood from low needs, memories and traits. Stress builds under bad mood
// and breaks out by trait: tantrum, despair, wandering or theft, which witnesses remember.

import type { Id, PersonDetail, SimEvent, WorldState } from '../core/types';
import type { SiteContent } from './defs';

/** Runs one block of the watched site. After the evening block the day advances. */
export function stepBlock(world: WorldState, content: SiteContent): SimEvent[] {
  void world;
  void content;
  throw new Error('stepBlock: not built yet');
}

/** Days the stores feed the followed residents at one meal a day. */
export function foodDaysLeft(world: WorldState, content: SiteContent): number {
  void world;
  void content;
  throw new Error('foodDaysLeft: not built yet');
}

/** The day's temperature (°C) at the watched site's cell, from its summer high and winter low. */
export function siteTemperature(world: WorldState, content: SiteContent, day: number): number {
  void world;
  void content;
  void day;
  throw new Error('siteTemperature: not built yet');
}

/** A memory's mood on `day`: fades linearly from its full value to 0 over its decay days. */
export function memoryMood(
  memory: { moodDelta: number; createdDay: number; decayDays: number },
  day: number,
): number {
  void memory;
  void day;
  throw new Error('memoryMood: not built yet');
}

/** What the main thread needs after each tick to mirror the running site (M3.1 loose end). */
export interface SiteSnapshot {
  day: number;
  block: number;
  stock: [string, number][];
  storesEmptyEvent: Id | null;
  people: [Id, PersonDetail][];
}

export function siteSnapshot(world: WorldState): SiteSnapshot {
  void world;
  throw new Error('siteSnapshot: not built yet');
}

/** Copies a snapshot into a world copy (the main thread's mirror). */
export function applySiteSnapshot(world: WorldState, snapshot: SiteSnapshot): void {
  void world;
  void snapshot;
  throw new Error('applySiteSnapshot: not built yet');
}
