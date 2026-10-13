// Event importance and yearly rollups (M2.4b): importance = base(type) + fame + scale + novelty,
// and events under `rollupBelow` become a count in that year's `year_summary`. After the last year
// the trivial events nobody cites are pruned from the world's event list, and deeds drop with them.

import type { EmitInput } from '../core/context';
import type { Id, SimEvent } from '../core/types';
import { FAME_MAX } from './people';
import { isLive, type HistoryRun } from './state';

/** Fame of the live site at `place`, plus its civ's capital bonus. */
function fameAt(run: HistoryRun, place: number | null): number {
  if (place === null) return 0;
  const siteId = run.siteAtCell.get(place);
  const site = siteId === undefined ? undefined : run.world.sites.get(siteId);
  if (!site || !isLive(site)) return 0;
  const rules = run.rules.importance;
  let fame = rules.kindFame[site.kind] ?? 0;
  const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
  if (civ && civ.capital === site.id) fame += rules.capitalFame;
  return fame;
}

/** Bonus of the largest scale threshold the event's `dead` (else `count`) reaches. */
function scaleBonus(run: HistoryRun, data: SimEvent['data'] | undefined): number {
  const amount = data?.dead ?? data?.count;
  if (typeof amount !== 'number') return 0;
  let bonus = 0;
  for (const [threshold, value] of run.rules.importance.scale) {
    if (amount >= threshold) bonus = value;
  }
  return bonus;
}

/** Bonus for the best known actor: one point per `famePerImportance` fame, at most `actorFameCap`. */
function actorFameBonus(run: HistoryRun, actors: readonly Id[] | undefined): number {
  const rules = run.content.notables;
  let best = 0;
  for (const id of actors ?? []) best = Math.max(best, run.world.people.get(id)?.fame ?? 0);
  return Math.min(rules.actorFameCap, Math.floor(best / rules.famePerImportance));
}

/** The event's first actor (the doer, by convention) gains the fame its type is worth. */
function creditDeedFame(run: HistoryRun, event: SimEvent): void {
  const gain = run.content.notables.fame.deeds[event.type];
  const doer = event.actors[0] === undefined ? undefined : run.world.people.get(event.actors[0]);
  if (gain && doer) doer.fame = Math.min(FAME_MAX, doer.fame + gain);
}

/** Emits an event with its importance scored; trivial events are counted for the yearly summary. */
export function emitScored(run: HistoryRun, input: EmitInput): SimEvent {
  const rules = run.rules.importance;
  const state = run.importance;
  const place = input.place ?? null;
  let bonus =
    (input.importanceBonus ?? 0) +
    fameAt(run, place) +
    scaleBonus(run, input.data) +
    actorFameBonus(run, input.actors);
  const key = `${input.type}@${place ?? -1}`;
  if (!state.seen.has(input.type)) {
    bonus += rules.novelty;
  } else if (place !== null) {
    const last = state.lastAt.get(key);
    if (last !== undefined && run.year - last <= rules.repeatYears) bonus -= rules.repeatPenalty;
  }
  state.seen.add(input.type);
  if (place !== null) state.lastAt.set(key, run.year);
  const base = state.types.get(input.type)?.baseImportance ?? 0;
  // Importance never drops under zero.
  const event = state.base({ ...input, importanceBonus: Math.max(-base, bonus) });
  creditDeedFame(run, event);
  if (event.type !== 'year_summary' && event.importance < rules.rollupBelow) {
    state.trivial.add(event.id);
    state.yearCounts.set(event.type, (state.yearCounts.get(event.type) ?? 0) + 1);
  }
  return event;
}

/** Emits the year's `year_summary` if any trivial events were counted, then resets the counts. */
export function runYearSummary(run: HistoryRun): void {
  const counts = run.importance.yearCounts;
  if (counts.size === 0) return;
  const data: SimEvent['data'] = { year: run.year, summary: '' };
  const parts: string[] = [];
  for (const [type, n] of counts) {
    const label = run.importance.types.get(type)?.rollup;
    parts.push(`${n} ${label ? (n === 1 ? label[0] : label[1]) : type.replace(/_/g, ' ')}`);
    data[`n_${type}`] = n;
  }
  data.summary = parts.join(', ');
  counts.clear();
  run.emit({ type: 'year_summary', place: null, data });
}

/**
 * Drops trivial history events that no kept event cites. Settle's events and everything not
 * trivial stay; a kept event keeps its causes alive, so cause chains never break.
 */
export function pruneEvents(run: HistoryRun): void {
  const { world, importance } = run;
  const keep = new Set<Id>();
  const events = world.events;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    const kept =
      event.id < importance.firstId || !importance.trivial.has(event.id) || keep.has(event.id);
    if (!kept) continue;
    keep.add(event.id);
    for (const cause of event.causes) keep.add(cause);
  }
  world.events = events.filter((event) => keep.has(event.id));
  // Deeds that point at a pruned event would dangle.
  const exists = new Set<Id>(world.events.map((event) => event.id));
  const live = (ids: Id[]) => ids.filter((id) => exists.has(id));
  for (const person of world.people.values()) person.deeds = live(person.deeds);
  for (const item of world.items.values()) item.deeds = live(item.deeds);
  for (const creature of world.creatures.values()) creature.deeds = live(creature.deeds);
}
