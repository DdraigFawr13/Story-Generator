// Memories of the watched site's people (M3.2): one per type, fading linearly, the weakest dropped
// past a cap. Shared by daily life (life.ts) and health (health.ts).

import type { MemoryDef } from '../core/content-types';
import type { Id, Memory, PersonDetail } from '../core/types';

/** A memory's mood on `day`: fades linearly from its full value to 0 over its decay days. */
export function memoryMood(
  memory: { moodDelta: number; createdDay: number; decayDays: number },
  day: number,
): number {
  const age = day - memory.createdDay;
  if (age >= memory.decayDays) return 0;
  return memory.moodDelta * (1 - Math.max(0, age) / memory.decayDays);
}

export function addMemoryTo(
  defs: ReadonlyMap<string, MemoryDef>,
  cap: number,
  detail: PersonDetail,
  type: string,
  day: number,
  about?: Id,
  eventId?: Id,
) {
  const def = defs.get(type);
  if (!def) throw new Error(`Unknown memory "${type}".`);
  const memories = detail.memories;
  // One memory per type: seeing a second tantrum refreshes the first (now about the newest one)
  // rather than stacking, so a bad week cannot pile up past bearing. A few types stack to a cap
  // (cold nights), the oldest copy being refreshed past it.
  const copies = memories.filter((m) => m.type === type);
  const same =
    copies.length < (def.stacks ?? 1)
      ? undefined
      : copies.reduce((old, m) => (m.createdDay < old.createdDay ? m : old), copies[0]!);
  const fresh: Memory = {
    type,
    moodDelta: def.mood,
    createdDay: day,
    decayDays: def.decayDays,
  };
  if (about !== undefined) fresh.about = about;
  if (eventId !== undefined) fresh.eventId = eventId;
  if (same) {
    Object.assign(same, fresh);
    if (about === undefined) delete same.about;
    if (eventId === undefined) delete same.eventId;
    return;
  }
  memories.push(fresh);
  // Past the cap the weakest by current mood go first.
  while (memories.length > cap) {
    let weakest = 0;
    for (let i = 1; i < memories.length; i += 1) {
      if (Math.abs(memoryMood(memories[i]!, day)) < Math.abs(memoryMood(memories[weakest]!, day))) {
        weakest = i;
      }
    }
    memories.splice(weakest, 1);
  }
}
