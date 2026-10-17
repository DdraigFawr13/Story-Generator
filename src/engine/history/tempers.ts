// Rulers with character and bynames (H2). A ruler or legend has a temper scored from their
// attributes, their people's values and their upbringing (a parent's temper, a parent killed),
// plus a small hash of the person so peers differ; no RNG stream is drawn. The temper multiplies
// odds the engine already rolls (war, tribute, witch hunts, works, courting a dragon, pardons,
// betrayals) and gives the chronicle a "why" clause. Bynames are earned from deeds: each year the
// new events are counted per person and rule, and the first rule a person completes names them.
// Every number and phrase lives in `content/tempers.ts`.

import { ATTRIBUTE_KEYS, type Civ, type Person, type SimEvent } from '../core/types';
import type { BynameRule, TemperChoice, TemperDef } from '../core/content-types';
import { hashString } from '../core/rng';
import { TIERS } from '../people/tiers';
import { isLegend, rulerOf } from './notables';
import { closeKin, livingList } from './people';
import type { HistoryRun } from './state';

interface TemperMemory {
  /** Index into `world.events` up to which bynames have been counted. */
  seen: number;
  /** `${personId}:${ruleIndex}` to the deeds counted towards that rule. */
  counts: Map<string, number>;
}
const memory = new WeakMap<HistoryRun, TemperMemory>();
function memoryOf(run: HistoryRun): TemperMemory {
  let mem = memory.get(run);
  if (!mem) memory.set(run, (mem = { seen: run.world.events.length, counts: new Map() }));
  return mem;
}

const fillIn = (template: string, values: Record<string, unknown>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );

/** The name with the byname once earned ("Aed the Dragonslayer"). */
export function styledName(person: Person): string {
  return person.byname ? `${person.name} ${person.byname.text}` : person.name;
}

function defOf(run: HistoryRun, id: string | undefined): TemperDef | undefined {
  return id === undefined ? undefined : run.rules.tempers.tempers.find((t) => t.id === id);
}

/** Scores every temper for the person and keeps the best (the first of equals). */
function rollTemper(run: HistoryRun, person: Person): string {
  const rules = run.rules.tempers;
  const culture = run.content.cultures.find((c) => c.id === person.cultureId);
  const parents = person.family.parents
    .map((id) => run.world.people.get(id))
    .filter((p): p is Person => p !== undefined);
  const orphaned = parents.some((p) => p.killerId !== undefined && p.died !== undefined);
  let best = rules.tempers[0]!.id;
  let bestScore = -Infinity;
  for (const def of rules.tempers) {
    let score = 0;
    for (const key of ATTRIBUTE_KEYS)
      score += (def.attributes[key] ?? 0) * (person.attributes[key] - 10);
    if (culture)
      for (const [value, weight] of Object.entries(def.values))
        score += weight * ((culture.values[value as keyof typeof culture.values] ?? 5) - 5);
    if (person.title !== undefined) score += def.roles?.[person.title] ?? 0;
    if (def.mage && person.magic.power >= TIERS.strong.minPower) score += def.mage;
    for (const parent of parents) if (parent.temper === def.id) score += rules.parentTemper;
    if (orphaned && def.id === 'cruel') score += rules.orphanedCruel;
    score +=
      (hashString(`${run.world.seed}:temper:${person.id}:${def.id}`) % 1000) *
      (rules.jitter / 1000);
    if (score > bestScore) {
      best = def.id;
      bestScore = score;
    }
  }
  return best;
}

/** The person's temper, scored and kept the first time it is asked for. */
export function temperOf(run: HistoryRun, person: Person): TemperDef {
  person.temper ??= rollTemper(run, person);
  return defOf(run, person.temper) ?? run.rules.tempers.tempers[0]!;
}

/** The multiplier the person's temper puts on a choice; 1 with nobody to choose. */
export function tilt(run: HistoryRun, person: Person | undefined, choice: TemperChoice): number {
  if (!person) return 1;
  return temperOf(run, person).tilts[choice] ?? 1;
}

/** The chronicle's "why" clause when the temper pushed towards the choice, else "". */
export function whyOf(run: HistoryRun, person: Person | undefined, choice: TemperChoice): string {
  if (!person) return '';
  const def = temperOf(run, person);
  const phrases = def.why[choice];
  if (!phrases || phrases.length === 0 || (def.tilts[choice] ?? 1) <= 1) return '';
  const phrase = phrases[hashString(`${person.id}:${choice}:${run.year}`) % phrases.length]!;
  return fillIn(phrase, { ruler: styledName(person) });
}

/** Event data for a choice the temper pushed: `why` and `temper`, or nothing. */
export function temperData(
  run: HistoryRun,
  person: Person | undefined,
  choice: TemperChoice,
): { why?: string; temper?: string } {
  const why = whyOf(run, person, choice);
  return why && person ? { why, temper: person.temper! } : {};
}

/** A ruler's temper as a choice's multiplier and its event data, together. */
export function rulerTilt(
  run: HistoryRun,
  civ: Civ,
  choice: TemperChoice,
): { ruler: Person | undefined; mul: number; data: { why?: string; temper?: string } } {
  const ruler = rulerOf(run, civ);
  return { ruler, mul: tilt(run, ruler, choice), data: temperData(run, ruler, choice) };
}

// --- bynames -----------------------------------------------------------------------------------

function subjectOf(
  run: HistoryRun,
  who: BynameRule['who'],
  event: SimEvent,
  civByName: Map<string, Civ>,
): Person | undefined {
  if ('actor' in who) {
    const id = event.actors[who.actor];
    return id === undefined ? undefined : run.world.people.get(id);
  }
  const civ = civByName.get(String(event.data[who.ruler] ?? ''));
  return civ ? rulerOf(run, civ) : undefined;
}

function matches(run: HistoryRun, rule: BynameRule, event: SimEvent, person: Person): boolean {
  if (!rule.types.includes(event.type)) return false;
  for (const [key, allowed] of Object.entries(rule.data ?? {}))
    if (!allowed.includes(String(event.data[key] ?? ''))) return false;
  if (rule.temper !== undefined && temperOf(run, person).id !== rule.temper) return false;
  if (rule.kin) {
    const [a, b] = event.actors.map((id) => run.world.people.get(id));
    if (!a || !b || !closeKin(a, b)) return false;
  }
  return true;
}

/** The first of the words no living person of the realm (or anyone of that name) wears. */
function freeWord(run: HistoryRun, person: Person, words: string[]): string | undefined {
  const worn = new Set<string>();
  for (const other of run.world.people.values()) {
    if (!other.byname) continue;
    if (other.civId === person.civId && other.died === undefined) worn.add(other.byname.text);
    if (other.name === person.name) worn.add(other.byname.text);
  }
  return words.find((w) => !worn.has(w));
}

function giveByname(
  run: HistoryRun,
  person: Person,
  text: string,
  after: string,
  cause: SimEvent,
): void {
  const event = run.emit({
    type: 'byname_earned',
    place: cause.place,
    actors: [person.id],
    causes: [cause.id],
    data: { name: person.name, byname: text, after },
  });
  person.byname = { text, event: event.id };
  person.deeds.push(event.id);
}

/**
 * Yearly, after every other system: rulers and legends get their tempers; this year's events count
 * towards bynames, and someone whose temper decided enough events earns their temper's byname.
 */
export function runTempers(run: HistoryRun): void {
  const rules = run.rules.tempers;
  const mem = memoryOf(run);
  for (const person of livingList(run))
    if (person.title === 'ruler' || isLegend(person)) temperOf(run, person);
  const civByName = new Map<string, Civ>();
  for (const civ of [...run.world.civs.values()].sort((a, b) => a.id - b.id))
    if (!civByName.has(civ.name)) civByName.set(civ.name, civ);
  const events = run.world.events;
  const end = events.length;
  for (let i = mem.seen; i < end; i += 1) {
    const event = events[i]!;
    // A ruler who rose and fell within the year still had a temper.
    for (const id of event.actors) {
      const actor = run.world.people.get(id);
      if (actor && actor.temper === undefined && actor.title === 'ruler') temperOf(run, actor);
    }
    const by = rules.temperedBy[event.type];
    if (by && event.data.temper !== undefined) {
      const person = subjectOf(run, by, event, civByName);
      if (person && !person.byname && person.temper === event.data.temper) {
        const key = `${person.id}:tempered`;
        const count = (mem.counts.get(key) ?? 0) + 1;
        mem.counts.set(key, count);
        const def = temperOf(run, person);
        const text = count >= rules.temperedChoices && freeWord(run, person, [def.byname]);
        if (text) giveByname(run, person, text, def.bynameAfter, event);
      }
    }
    rules.bynames.forEach((rule, index) => {
      if (!rule.types.includes(event.type)) return;
      const person = subjectOf(run, rule.who, event, civByName);
      if (!person || person.byname || !matches(run, rule, event, person)) return;
      const key = `${person.id}:${index}`;
      const count = (mem.counts.get(key) ?? 0) + 1;
      mem.counts.set(key, count);
      if (count < (rule.min ?? 1)) return;
      const text = freeWord(run, person, rule.words);
      if (text) giveByname(run, person, text, fillIn(rule.after, event.data), event);
    });
  }
  mem.seen = events.length;
}
