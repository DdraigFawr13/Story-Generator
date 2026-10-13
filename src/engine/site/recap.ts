// The historian's recaps (M3.11): at the end of each season, and again at the end of each year,
// the watched site gets one chronicle line that says what the period was about, counts what
// happened since the last one and cites the period's most important events as its causes. Nothing
// is invented: every name is a cited event's, and every number a count of events or residents.

import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../core/clock';
import type { EmitInput } from '../core/context';
import type { EventTypeDef } from '../core/content-types';
import type { ActiveSite, Id, SimEvent, WorldState } from '../core/types';
import { eventTitle } from '../narrative/legends';
import { countWord } from '../narrative/render';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';
import { foodDaysLeft } from './stock';

type Emit = (input: EmitInput) => SimEvent;

/** "a death, three births and two weddings": the period's tally, most telling first, or the quiet phrase. */
function tallyText(content: SiteContent, events: readonly SimEvent[], max: number): string {
  const rules = content.chronicle.recap;
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  const found: { text: string; weight: number; order: number }[] = [];
  rules.tally.forEach((entry, order) => {
    let n = entry.types.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0);
    if (entry.peak) {
      const { type, key } = entry.peak;
      for (const e of events) if (e.type === type) n = Math.max(n, Number(e.data[key]) || 0);
    }
    if (n === 0) return;
    const text = n === 1 ? entry.one : entry.many.replace('{n}', countWord(n));
    found.push({ text, weight: entry.weight, order });
  });
  const parts = found
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, max)
    .map((p) => p.text);
  if (parts.length === 0) return rules.quiet;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Up to `causes` of the period's most important events (earliest first on ties), oldest first. */
function topEvents(content: SiteContent, events: readonly SimEvent[]): SimEvent[] {
  const rules = content.chronicle.recap;
  return events
    .filter(
      (e) =>
        e.importance >= rules.causeAtLeast &&
        e.type !== rules.seasonType &&
        e.type !== rules.yearType,
    )
    .sort((a, b) => b.importance - a.importance || a.id - b.id)
    .slice(0, rules.causes);
}

/** "Ingild took revenge on Hrolna": an event's title with its people named and the site left out. */
function storyPhrase(world: WorldState, def: EventTypeDef | undefined, event: SimEvent): string {
  const data: SimEvent['data'] = { ...event.data, site: '' };
  event.actors.forEach((id, k) => {
    data[k === 0 ? 'actor' : `actor${k + 1}`] = world.people.get(id)?.name ?? 'someone';
  });
  const title = eventTitle({ ...event, data }, def);
  // A title that opens with a value keeps that value's own case ("the bloody flux", "Ketil").
  const lead = /^\{(\w+)\}/.exec(def?.title ?? '')?.[1];
  const first = lead === undefined ? '' : String(data[lead] ?? '');
  const head = first === '' ? title.charAt(0).toLowerCase() : first.charAt(0);
  return head + title.slice(1);
}

/**
 * "Autumn at Svalathorp was a season of old scores: Ketil took revenge on Bjorn, and Ingild took
 * revenge on Hrolna." The theme and the first name come from the most important event; the next
 * one that reads differently is named after it.
 */
function storyText(
  world: WorldState,
  content: SiteContent,
  top: readonly SimEvent[],
  head: string,
  span: string,
): string {
  const rules = content.chronicle.recap;
  if (top.length === 0) return `${head} passed quietly.`;
  const defs = new Map(content.eventTypes.map((d) => [d.id, d]));
  const first = top[0]!;
  const def = defs.get(first.type);
  const theme =
    rules.themes[first.type] ?? rules.themeByCategory[def?.category ?? ''] ?? 'daily toil';
  const named = [storyPhrase(world, def, first)];
  for (const e of top.slice(1)) {
    const phrase = storyPhrase(world, defs.get(e.type), e);
    if (named.includes(phrase)) continue;
    named.push(phrase);
    break;
  }
  return `${head} was a ${span} of ${theme}: ${named.join(', and ')}.`;
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
  // On the year's last evening the year recap speaks for winter too, so there is one line, not two.
  if (next % DAYS_PER_YEAR !== 0) {
    const top = topEvents(content, seasonEvents);
    const head = `${season.charAt(0).toUpperCase()}${season.slice(1)} at ${label.name}`;
    emit({
      type: rules.seasonType,
      place: label.cell,
      causes: top.map((e) => e.id).sort((a, b) => a - b),
      data: {
        site: label.name,
        season,
        story: storyText(world, content, top, head, 'season'),
        tally: tallyText(content, seasonEvents, rules.maxTally.season),
        pop,
        stores: storeDays,
      },
    });
    recap.season = pop;
    return;
  }
  const yearEvents = eventsSince(
    world,
    Math.max(active.enteredDay, next - DAYS_PER_YEAR),
    recap.firstEvent,
  );
  const top = topEvents(content, yearEvents);
  const head = `Year ${Math.floor(day / DAYS_PER_YEAR)} at ${label.name}`;
  emit({
    type: rules.yearType,
    place: label.cell,
    causes: top.map((e) => e.id).sort((a, b) => a - b),
    data: {
      site: label.name,
      story: storyText(world, content, top, head, 'year'),
      tally: tallyText(content, yearEvents, rules.maxTally.year),
      popStart: recap.year,
      pop,
      stores: storeDays,
    },
  });
  recap.season = pop;
  recap.year = pop;
}
