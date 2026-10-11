import { isIndividualWorld, type WorldSnapshot } from '../sim/world';
import type { Immutable } from '../sim/immutable';
import type { ActivityRole, ResidentActivity } from '../sim/living-state';
import type { SettlementEvent } from '../sim/state';

type Event = Immutable<SettlementEvent>;
export const ACTIVITY_ROLES: ActivityRole[] = [
  'fieldwork',
  'foraging',
  'repairing',
  'building',
  'gathering',
  'caretaking',
  'resting',
];
export interface AssignmentSpan {
  activity: Immutable<ResidentActivity>;
  start: Event;
  end: Event | null;
  throughTick: number;
  weeks: number;
}

/** A changed assignment applies in that week, before births/deaths; death closes its history. */
export function residentWorkHistory(world: WorldSnapshot, id: number) {
  if (!isIndividualWorld(world)) return null;
  const person = world.world.residents.find((person) => person.id === id);
  if (!person) return null;
  const death = person.deathEventId === null ? null : world.events[person.deathEventId - 1]!;
  const cutoff = death?.tick ?? world.tick;
  const spans: AssignmentSpan[] = [];
  for (const event of world.events) {
    if (event.tick > cutoff) break;
    if (event.type !== 'work_changed') continue;
    const row = (
      event.facts.assignments as Immutable<{ id: number; after: ResidentActivity }[]>
    ).find((row) => row.id === id);
    if (!row) continue;
    const previous = spans.at(-1);
    if (previous) {
      previous.end = event;
      previous.throughTick = event.tick - 1;
      previous.weeks = event.tick - previous.start.tick;
    }
    spans.push({
      activity: row.after,
      start: event,
      end: death,
      throughTick: cutoff,
      weeks: cutoff - event.tick + 1,
    });
  }
  const totals = Object.fromEntries(ACTIVITY_ROLES.map((role) => [role, 0])) as Record<
    ActivityRole,
    number
  >;
  let longest: AssignmentSpan | null = null;
  for (const span of spans) {
    totals[span.activity.role] += span.weeks;
    if (!longest || span.weeks > longest.weeks) longest = span;
  }
  return { person, spans, totals, longest, death };
}
