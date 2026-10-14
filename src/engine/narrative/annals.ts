// Annals of each people (M4.9): eras named from what filled them, the rulers in order, the wars won
// and lost and a short rise-and-fall summary. Everything is read from the recorded events and the
// world's records; nothing is drawn at random and nothing here changes history.

import { DAYS_PER_YEAR } from '../core/clock';
import type { AnnalRules, ContentBundle, EraTag } from '../core/content-types';
import { ERA_TAGS } from '../core/content-types';
import type { Id, SimEvent, WorldState } from '../core/types';
import type { LegendIndex } from './biography';
import { eventTitle, eventYear, yearText } from './legends';

export interface Era {
  from: number;
  to: number;
  tag: EraTag;
  name: string;
  /** The most important events of the era, oldest first. */
  keyEvents: Id[];
}
export interface AnnalRuler {
  name: string;
  personId?: Id;
  from: number;
  to: number;
}
export interface AnnalWar {
  war: number;
  enemy: string;
  enemyId?: Id;
  from: number;
  to: number;
  result: 'won' | 'lost' | 'undecided';
  /** The war_declared event. */
  eventId: Id;
}
export interface Annals {
  from: number;
  to: number;
  eras: Era[];
  rulers: AnnalRuler[];
  wars: AnnalWar[];
  summary: string[];
}

type AnnalContent = Pick<ContentBundle, 'annals' | 'eventTypes' | 'cultures'>;

const text = (event: SimEvent, key: string): string => {
  const value = event.data[key];
  return typeof value === 'string' ? value : '';
};
/** "the grey pack of Llanlan" -> "Grey Pack of Llanlan": a name inside an era name is title-cased. */
const stripThe = (name: string) =>
  name
    .replace(/^the\s+/i, '')
    .replace(/\b([a-z])([a-z]*)/g, (word, first: string, rest: string) =>
      ['of', 'the', 'and', 'in', 'on'].includes(word) ? word : first.toUpperCase() + rest,
    );
/** "Republic of Chiozoro" -> "Chiozoro", "Altankent Khanate" -> "Altankent": the realm's own name. */
const shortName = (name: string) => {
  const bare = stripThe(name);
  const of = bare.lastIndexOf(' of ');
  if (of >= 0) return bare.slice(of + 4);
  const words = bare.split(' ');
  return words.length > 1 ? words.slice(0, -1).join(' ') : bare;
};
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The side opposite `civ` in a war, battle, razing or conquest event. */
function opponent(event: SimEvent, civ: string): string {
  const sides = [text(event, 'civ'), text(event, 'enemy') || text(event, 'loser')];
  return sides[0] === civ ? sides[1]! : sides[1] === civ ? sides[0]! : '';
}

/** The most frequent non-empty value; ties go to the first seen. */
function commonest(values: string[]): string {
  const count = new Map<string, number>();
  for (const v of values) if (v !== '') count.set(v, (count.get(v) ?? 0) + 1);
  let best = '';
  let top = 0;
  for (const [v, n] of count)
    if (n > top) {
      best = v;
      top = n;
    }
  return best;
}

interface Run {
  from: number;
  to: number;
  tag: EraTag;
}

/** Merges the shortest run (below `floor`, or any run when `force`) into its longer neighbour. */
function mergeShortest(runs: Run[], floor: number, force: boolean): boolean {
  let at = -1;
  for (let k = 0; k < runs.length; k += 1) {
    const len = runs[k]!.to - runs[k]!.from + 1;
    if (at < 0 || len < runs[at]!.to - runs[at]!.from + 1) at = k;
  }
  if (at < 0 || runs.length < 2) return false;
  const run = runs[at]!;
  if (!force && run.to - run.from + 1 >= floor) return false;
  const prev = runs[at - 1];
  const next = runs[at + 1];
  const prevLen = prev ? prev.to - prev.from + 1 : -1;
  const nextLen = next ? next.to - next.from + 1 : -1;
  if (prev && prevLen >= nextLen) prev.to = run.to;
  else if (next) next.from = run.from;
  runs.splice(at, 1);
  // Neighbours of one tag become one era.
  for (let k = runs.length - 1; k > 0; k -= 1) {
    if (runs[k]!.tag === runs[k - 1]!.tag) {
      runs[k - 1]!.to = runs[k]!.to;
      runs.splice(k, 1);
    }
  }
  return true;
}

/** Splits [from, to] into at most `maxEras` runs of one dominant tag each. */
function splitEras(
  rules: AnnalRules,
  from: number,
  to: number,
  tagged: { year: number; tag: EraTag; weight: number }[],
): Run[] {
  const span = to - from + 1;
  const score = new Map<EraTag, number[]>();
  for (const tag of ERA_TAGS) score.set(tag, new Array<number>(span).fill(0));
  // A year counts each kind of trouble once, at its gravest event: a realm's many small sicknesses
  // must not outweigh one war.
  for (const t of tagged) {
    if (t.year < from || t.year > to || (t.tag !== 'growth' && t.weight < rules.minScore)) continue;
    const row = score.get(t.tag)!;
    row[t.year - from] = Math.max(row[t.year - from]!, t.weight);
  }
  const windowed = (tag: EraTag, y: number) => {
    const row = score.get(tag)!;
    let sum = 0;
    for (
      let k = Math.max(0, y - rules.smoothYears);
      k <= Math.min(span - 1, y + rules.smoothYears);
      k += 1
    )
      sum += row[k]!;
    return sum;
  };
  const strong = ERA_TAGS.filter((t) => t !== 'growth' && t !== 'quiet');
  const runs: Run[] = [];
  for (let y = 0; y < span; y += 1) {
    let tag: EraTag = 'quiet';
    let top = 0;
    for (const candidate of strong) {
      const sum = windowed(candidate, y);
      if (sum > top) {
        top = sum;
        tag = candidate;
      }
    }
    if (top === 0 && windowed('growth', y) > 0) tag = 'growth';
    const last = runs[runs.length - 1];
    if (last && last.tag === tag) last.to = from + y;
    else runs.push({ from: from + y, to: from + y, tag });
  }
  while (mergeShortest(runs, rules.minEraYears, false)) {
    // keep merging runs shorter than the floor
  }
  while (runs.length > rules.maxEras && mergeShortest(runs, 0, true)) {
    // keep merging until the annals fit
  }
  return runs;
}

/** The annals of one people, or undefined when it is unknown. */
export function annals(
  world: WorldState,
  index: LegendIndex,
  content: AnnalContent,
  civId: Id,
): Annals | undefined {
  const civ = world.civs.get(civId);
  if (!civ) return undefined;
  const rules = content.annals;
  const final = Math.min(Math.floor(world.day / DAYS_PER_YEAR), world.params.historyYears);
  const from = civ.founded;
  const to = Math.max(from, civ.fell ?? final);
  const events = index.events({ kind: 'civ', id: civId }).flatMap((id) => index.event(id) ?? []);
  const tagOf = new Map<string, Exclude<EraTag, 'quiet'>>();
  for (const [tag, types] of Object.entries(rules.tags))
    for (const type of types) tagOf.set(type, tag as Exclude<EraTag, 'quiet'>);

  // Eras ---------------------------------------------------------------------------------------
  const tagged = events.flatMap((event) => {
    const tag = tagOf.get(event.type);
    return tag
      ? [
          {
            year: eventYear(event),
            tag,
            weight: tag === 'growth' ? event.importance : event.importance * rules.tagWeight[tag],
          },
        ]
      : [];
  });
  const runs = splitEras(rules, from, to, tagged);
  const used = new Set<string>();
  const eras: Era[] = runs.map((run, k) => {
    const inside = events.filter((e) => eventYear(e) >= run.from && eventYear(e) <= run.to);
    const ofTag = (tag: EraTag) => inside.filter((e) => tagOf.get(e.type) === tag);
    const candidates: string[] = [];
    if (run.tag === 'war') {
      const enemy = commonest(ofTag('war').map((e) => opponent(e, civ.name)));
      if (enemy) candidates.push(rules.namedFor.war.replace('{enemy}', shortName(enemy)));
    } else if (run.tag === 'plague') {
      const disease = commonest(ofTag('plague').map((e) => text(e, 'disease')));
      if (disease) candidates.push(rules.namedFor.plague.replace('{disease}', stripThe(disease)));
    } else if (run.tag === 'beasts') {
      const beast = commonest(ofTag('beasts').map((e) => text(e, 'beast')));
      if (beast) candidates.push(rules.namedFor.beasts.replace('{beast}', stripThe(beast)));
    } else if (run.tag === 'quiet' && run.to - run.from + 1 >= rules.longPeaceYears) {
      candidates.push(rules.longPeace);
    }
    candidates.push(...rules.names[run.tag]);
    const start = (civId + k) % candidates.length;
    let name = '';
    for (let j = 0; j < candidates.length && name === ''; j += 1) {
      const pick = candidates[(start + j) % candidates.length]!;
      if (!used.has(pick)) name = pick;
    }
    for (let n = 0; name === ''; n += 1) {
      const ordinal = rules.ordinals[n];
      // Past the written ordinals a number keeps the name unique.
      const base = stripThe(candidates[start]!);
      const pick = (
        ordinal ? rules.repeatName.replace('{ordinal}', ordinal) : `the ${n + 2}th {name}`
      ).replace('{name}', base);
      if (!used.has(pick)) name = pick;
    }
    used.add(name);
    // The events that gave the era its name come first, then the gravest of the rest.
    const named = (e: SimEvent) => (tagOf.get(e.type) === run.tag ? 0 : 1);
    const keyEvents = [...inside]
      .sort((a, b) => named(a) - named(b) || b.importance - a.importance || a.id - b.id)
      .slice(0, rules.keyEvents)
      .sort((a, b) => a.id - b.id)
      .map((e) => e.id);
    return { from: run.from, to: run.to, tag: run.tag, name, keyEvents };
  });

  // Rulers -------------------------------------------------------------------------------------
  const successions = events.filter((e) => e.type === 'ruler_succeeded');
  const rulers: AnnalRuler[] = [];
  const first = successions[0];
  if (first && text(first, 'prior') !== '') {
    const id = first.actors.find((a) => world.people.get(a)?.name === text(first, 'prior'));
    rulers.push({
      name: text(first, 'prior'),
      ...(id !== undefined ? { personId: id } : {}),
      from,
      to: eventYear(first),
    });
  }
  successions.forEach((event, k) => {
    const id = event.actors.find((a) => world.people.get(a)?.name === text(event, 'ruler'));
    const next = successions[k + 1];
    rulers.push({
      name: text(event, 'ruler'),
      ...(id !== undefined ? { personId: id } : {}),
      from: eventYear(event),
      to: next ? eventYear(next) : to,
    });
  });
  if (rulers.length === 0 && civ.rulerId !== undefined) {
    const ruler = world.people.get(civ.rulerId);
    if (ruler) rulers.push({ name: ruler.name, personId: ruler.id, from, to });
  }

  // Wars ---------------------------------------------------------------------------------------
  const warOf = (event: SimEvent): number | undefined => {
    const direct = event.data.war;
    if (typeof direct === 'number') return direct;
    for (const cause of event.causes) {
      const war = index.event(cause)?.data.war;
      if (typeof war === 'number') return war;
    }
    return undefined;
  };
  const wars: AnnalWar[] = [];
  for (const declared of events.filter((e) => e.type === 'war_declared')) {
    const id = declared.data.war;
    if (typeof id !== 'number') continue;
    const enemy = opponent(declared, civ.name);
    let ended: number | undefined;
    let battlesWon = 0;
    let battlesLost = 0;
    let taken = 0;
    let lost = 0;
    let last = eventYear(declared);
    for (const e of events) {
      if (warOf(e) !== id) continue;
      last = Math.max(last, eventYear(e));
      if (e.type === 'peace_made') ended = eventYear(e);
      else if (e.type === 'battle') {
        if (text(e, 'winner') === civ.name) battlesWon += 1;
        else battlesLost += 1;
      } else if (e.type === 'site_conquered' || e.type === 'site_razed') {
        if (text(e, 'civ') === civ.name) taken += 1;
        else if (text(e, 'loser') === civ.name) lost += 1;
      }
    }
    const result: AnnalWar['result'] =
      taken !== lost
        ? taken > lost
          ? 'won'
          : 'lost'
        : battlesWon !== battlesLost
          ? battlesWon > battlesLost
            ? 'won'
            : 'lost'
          : 'undecided';
    const enemyId = enemy === '' ? undefined : index.byName('civ', enemy);
    wars.push({
      war: id,
      enemy,
      ...(enemyId !== undefined ? { enemyId } : {}),
      from: eventYear(declared),
      to: ended ?? last,
      result,
      eventId: declared.id,
    });
  }

  // Summary ------------------------------------------------------------------------------------
  const summary: string[] = [];
  const defOf = new Map(content.eventTypes.map((d) => [d.id, d]));
  const founding = events.find((e) => e.type === 'civ_founded');
  const capital = world.sites.get(civ.capital);
  const culture = content.cultures.find((c) => c.id === civ.cultureId)?.name;
  const where = (founding ? text(founding, 'site') : '') || capital?.name || '';
  summary.push(
    `Founded in Year ${yearText(from)}${where ? ` at ${where}` : ''}${
      culture ? `, a ${culture.toLowerCase()} realm` : ''
    }.`,
  );
  let peak = 0;
  let peakYear = from;
  for (const snap of world.snapshots) {
    let held = 0;
    for (let k = 0; k + 3 < snap.sites.length; k += 4)
      if (snap.sites[k + 1] === civId && snap.sites[k + 3] === 0) held += 1;
    if (held > peak) {
      peak = held;
      peakYear = snap.year;
    }
  }
  if (peak > 0)
    summary.push(
      `At its height, about Year ${yearText(peakYear)}, it held ${peak} ${plural(peak, 'place', 'places')}.`,
    );
  if (rulers.length > 0)
    summary.push(`${rulers.length} ${plural(rulers.length, 'ruler', 'rulers')} held its seat.`);
  if (wars.length > 0) {
    const n = (r: AnnalWar['result']) => wars.filter((w) => w.result === r).length;
    summary.push(
      `Fought ${wars.length} ${plural(wars.length, 'war', 'wars')}: ${n('won')} won, ${n('lost')} lost, ${n('undecided')} undecided.`,
    );
  }
  let worst: SimEvent | undefined;
  for (const event of events) {
    const harm =
      tagOf.get(event.type) === 'plague' ||
      tagOf.get(event.type) === 'famine' ||
      (event.type === 'site_razed' && text(event, 'loser') === civ.name);
    if (harm && (!worst || event.importance > worst.importance)) worst = event;
  }
  if (worst)
    summary.push(
      `Worst disaster: ${lowerFirst(eventTitle(worst, defOf.get(worst.type)))}, Year ${yearText(eventYear(worst))}.`,
    );
  let great: { name: string; fame: number } | undefined;
  for (const person of world.people.values())
    if (person.civId === civId && person.fame > 0 && (!great || person.fame > great.fame))
      great = { name: person.name, fame: person.fame };
  if (great) summary.push(`Greatest figure: ${great.name}.`);
  if (civ.fell !== undefined) {
    const fall = events.find((e) => e.type === 'civ_fell');
    const blow = fall?.causes
      .flatMap((c) => index.event(c) ?? [])
      .find(
        (e) =>
          (e.type === 'site_conquered' || e.type === 'site_razed') && text(e, 'loser') === civ.name,
      );
    summary.push(
      `Fell in Year ${yearText(civ.fell)}${blow ? `, its last place lost to the ${text(blow, 'civ')}` : ''}.`,
    );
  } else {
    const held = [...world.sites.values()].filter(
      (s) => s.civId === civId && s.ruinedYear === undefined,
    ).length;
    summary.push(
      `Still stands in Year ${yearText(final)}, holding ${held} ${plural(held, 'place', 'places')}.`,
    );
  }
  return { from, to, eras, rulers, wars, summary: summary.slice(0, rules.maxSummary) };
}
