// The historian's recaps (M3.11): at the end of each season, and again at the end of each year,
// the watched site gets one chronicle line that counts what happened since the last one and cites
// the period's most important events as its causes. Nothing is invented: every number is a count
// of events or residents.

import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../core/clock';
import type { EmitInput } from '../core/context';
import type { ActiveSite, Id, SimEvent, WorldState } from '../core/types';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';
import { foodDaysLeft } from './stock';

type Emit = (input: EmitInput) => SimEvent;

/** "one birth, 2 deaths and 3 weddings": the period's tally, or the quiet phrase. */
function tallyText(content: SiteContent, events: readonly SimEvent[]): string {
  const rules = content.chronicle.recap;
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  const parts: string[] = [];
  for (const entry of rules.tally) {
    const n = entry.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0);
    if (n === 0) continue;
    parts.push(n === 1 ? entry.one : entry.many.replace('{n}', String(n)));
    if (parts.length === rules.maxTally) break;
  }
  if (parts.length === 0) return rules.quiet;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The period's most important events (earliest first on ties), oldest first. */
function topEvents(content: SiteContent, events: readonly SimEvent[]): Id[] {
  const rules = content.chronicle.recap;
  return events
    .filter(
      (e) =>
        e.importance >= rules.causeAtLeast &&
        e.type !== rules.seasonType &&
        e.type !== rules.yearType,
    )
    .sort((a, b) => b.importance - a.importance || a.id - b.id)
    .slice(0, rules.causes)
    .sort((a, b) => a.id - b.id)
    .map((e) => e.id);
}

/** The site's events since `fromDay` (the world is frozen while watched, so they are all at the end). */
function eventsSince(world: WorldState, fromDay: number, firstEvent: Id): SimEvent[] {
  const events = world.events;
  let i = events.length;
  while (i > 0 && events[i - 1]!.day >= fromDay && events[i - 1]!.id >= firstEvent) i -= 1;
  return events.slice(i);
}

/**
 * Called at the end of the evening block, before the day turns: a season recap on a season's last
 * day, then a year recap on the year's last day. Watching that began mid-season recaps from arrival.
 */
export function runRecaps(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const day = world.day;
  const recap = (active.recap ??= {
    season: active.residents.length,
    year: active.residents.length,
    firstEvent: 0,
    counted: 0,
  });
  // Everyone at the site: the followed residents and the counted people around them.
  const pop = recap.counted + active.residents.length;
  const next = day + 1;
  if (next % DAYS_PER_SEASON !== 0) return;
  const rules = content.chronicle.recap;
  const stores = foodDaysLeft(world, content);
  const storeDays = Number.isFinite(stores) ? Math.round(stores) : 0;
  const seasonStart = Math.max(active.enteredDay, next - DAYS_PER_SEASON);
  const seasonEvents = eventsSince(world, seasonStart, recap.firstEvent);
  const season = rules.seasons[Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_SEASON)] ?? '';
  emit({
    type: rules.seasonType,
    place: label.cell,
    causes: topEvents(content, seasonEvents),
    data: {
      site: label.name,
      season,
      tally: tallyText(content, seasonEvents),
      pop,
      stores: storeDays,
    },
  });
  recap.season = pop;
  if (next % DAYS_PER_YEAR !== 0) return;
  const yearEvents = eventsSince(
    world,
    Math.max(active.enteredDay, next - DAYS_PER_YEAR),
    recap.firstEvent,
  );
  emit({
    type: rules.yearType,
    place: label.cell,
    causes: topEvents(content, yearEvents),
    data: {
      site: label.name,
      tally: tallyText(content, yearEvents),
      popStart: recap.year,
      pop,
    },
  });
  recap.year = pop;
}
