// What the People room shows, worked out from a finished world: index rows, a person's roles and
// chips, life rows, family, rivals and deeds. Pure functions over the world and its event log; no
// DOM and no rules of their own (the history already decided everything shown here).

import { pauseKindOf } from '../tales/pauses';
import {
  eventYear,
  tierOfPower,
  type ContentBundle,
  type Faith,
  type Id,
  type Person,
  type SimEvent,
  type WorldState,
} from '../../engine';

type NameContent = Pick<ContentBundle, 'races' | 'schools' | 'biographies'>;

/** Legend-deed event types beyond the 'legend' pause kind (a legend founding, a champion's stand). */
const LEGEND_DEEDS = new Set(['legend_founded', 'champion_fought']);
/** A gold dot: a legend's deed, never importance alone. */
export function isLegendDeed(event: SimEvent): boolean {
  return LEGEND_DEEDS.has(event.type) || pauseKindOf(event.type, event.importance) === 'legend';
}
/** Life rows show events of at least this importance. */
export const LIFE_MIN_IMPORTANCE = 4;
/** Event types that never make a life row. */
const NOT_LIFE = new Set(['year_summary', 'notable_born']);

export const PERSON_FILTERS = [
  { id: 'legends', label: 'Legends' },
  { id: 'rulers', label: 'Rulers' },
  { id: 'mages', label: 'Mages' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'priests', label: 'Priests and prophets' },
  { id: 'living', label: 'Living' },
] as const;
export type PersonFilter = (typeof PERSON_FILTERS)[number]['id'];

const cap = (text: string) => (text === '' ? text : text[0]!.toUpperCase() + text.slice(1));

/** The people a `legend_risen` event named: the world's legends. */
export function legendIds(world: WorldState): Set<Id> {
  const out = new Set<Id>();
  for (const e of world.events) {
    if (e.type === 'legend_risen' && e.actors[0] !== undefined) out.add(e.actors[0]);
  }
  return out;
}

/** The faith of a person's town, else of their realm. */
export function faithOf(world: WorldState, person: Person): Faith | undefined {
  const site = person.siteId == null ? undefined : world.sites.get(person.siteId);
  const civ = person.civId == null ? undefined : world.civs.get(person.civId);
  const id = site?.faithId ?? civ?.faithId;
  return id === undefined ? undefined : world.faiths.get(id);
}

/** The faith a person leads (high priest) or founded (prophet). */
export function faithRole(
  world: WorldState,
  person: Person,
): { role: 'high priest' | 'prophet'; faith: Faith } | undefined {
  for (const faith of world.faiths.values()) {
    if (faith.highPriestId === person.id) return { role: 'high priest', faith };
  }
  for (const faith of world.faiths.values()) {
    if (faith.founderId === person.id) return { role: 'prophet', faith };
  }
  return undefined;
}

/** The school a mage is strongest in, or undefined without magic. */
function primarySchool(person: Person, content: NameContent): string | undefined {
  let best: [string, number] | undefined;
  for (const [id, n] of Object.entries(person.magic.affinities).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!best || n > best[1]) best = [id, n];
  }
  if (!best) return undefined;
  return (content.schools.find((s) => s.id === best![0])?.name ?? best[0]).toLowerCase();
}

export interface Roles {
  /** Every role the person held, most notable first: "ruler", "high priest", "prophet", "mage". */
  labels: string[];
  ruler: boolean;
  priest: boolean;
  prophet: boolean;
  mage: boolean;
  hero: boolean;
  /** The magic phrase: "legendary mage of air". */
  magic: string | undefined;
  /** The one-line role: "Legendary mage of air · ruler of the Council of Perthlys". */
  line: string;
}

/** A person's roles, from their record, their realm's ruler and the faith's leaders. */
export function rolesOf(world: WorldState, person: Person, content: NameContent): Roles {
  const civ = person.civId == null ? undefined : world.civs.get(person.civId);
  const ruler = person.title === 'ruler' || (civ !== undefined && civ.rulerId === person.id);
  const lead = faithRole(world, person);
  const priest = person.title === 'priest' || lead?.role === 'high priest';
  const prophet = person.title === 'prophet' || lead?.role === 'prophet';
  const tier = tierOfPower(person.magic.power);
  const school = primarySchool(person, content);
  const mage = person.title === 'mage' || tier !== 'none';
  const hero = person.title === 'hero' || person.title === 'captain';
  const labels: string[] = [];
  const offices: string[] = [];
  if (ruler) {
    labels.push('ruler');
    offices.push(civ ? `ruler of the ${civ.name}` : 'ruler');
  }
  if (priest) {
    labels.push('high priest');
    offices.push(
      lead?.role === 'high priest' ? `high priest of ${lead.faith.name}` : 'high priest',
    );
  }
  if (prophet) {
    labels.push('prophet');
    offices.push(lead?.role === 'prophet' ? `prophet of ${lead.faith.name}` : 'prophet');
  }
  if (mage) labels.push('mage');
  const magic =
    tier !== 'none' || person.title === 'mage'
      ? `${tier === 'none' ? 'unawakened' : tier} mage${school ? ` of ${school}` : ''}`
      : undefined;
  // The record's own title (hero, smith, noble...) when the magic and offices do not already say it.
  const own = person.title === undefined ? undefined : content.biographies.roles[person.title];
  const plain = own && !['ruler', 'mage', 'high priest', 'prophet'].includes(own) ? own : undefined;
  const parts = [...(magic ? [magic] : []), ...(plain ? [plain] : []), ...offices];
  if (parts.length > 0) parts[0] = cap(parts[0]!);
  if (civ && !ruler) parts.push(civ.name);
  return {
    labels: [...new Set(labels)],
    ruler,
    priest,
    prophet,
    mage,
    hero,
    magic,
    line: parts.join(' \u00b7 ') || 'Notable figure',
  };
}

export interface IndexRow {
  id: Id;
  name: string;
  legend: boolean;
  /** Colour key of the realm: its civ id, or null without one. */
  civId: Id | null;
  realm: string;
  role: string;
  years: string;
  fame: number;
  living: boolean;
  roles: Roles;
  /** Lower-case text the search looks in: name, role, realm, race and faith. */
  haystack: string;
}

const yearsText = (born: number, died: number | undefined) =>
  `${born < 0 ? `−${-born}` : born}–${died === undefined ? '' : died < 0 ? `−${-died}` : died}`;

/** One row per notable figure, the most famous first. */
export function indexRows(world: WorldState, content: NameContent): IndexRow[] {
  const legends = legendIds(world);
  const rows: IndexRow[] = [];
  for (const person of world.people.values()) {
    if (person.title === undefined && !legends.has(person.id)) continue;
    const civ = person.civId == null ? undefined : world.civs.get(person.civId);
    const roles = rolesOf(world, person, content);
    const race = content.races.find((r) => r.id === person.raceId)?.name ?? person.raceId;
    const faith = faithOf(world, person)?.name ?? '';
    rows.push({
      id: person.id,
      name: person.name,
      legend: legends.has(person.id),
      civId: person.civId ?? null,
      realm: civ?.name ?? '',
      role: roles.line,
      years: yearsText(person.born, person.died),
      fame: person.fame,
      living: person.died === undefined,
      roles,
      haystack: [person.name, roles.line, civ?.name ?? '', race, faith].join(' ').toLowerCase(),
    });
  }
  return rows.sort((a, b) => b.fame - a.fame || a.id - b.id);
}

/** Does a row pass every chosen chip and the search text? */
export function filterRows(
  rows: readonly IndexRow[],
  chips: ReadonlySet<PersonFilter>,
  needle: string,
): IndexRow[] {
  // Every word must appear somewhere, in any order.
  const words = needle.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (chips.has('legends') && !r.legend) return false;
    if (chips.has('rulers') && !r.roles.ruler) return false;
    if (chips.has('mages') && !r.roles.mage) return false;
    if (chips.has('heroes') && !r.roles.hero) return false;
    if (chips.has('priests') && !r.roles.priest && !r.roles.prophet) return false;
    if (chips.has('living') && !r.living) return false;
    return words.every((w) => r.haystack.includes(w));
  });
}

export interface LifeRow {
  key: string;
  year: number;
  /** Last year of a collapsed run; absent for a single line. */
  yearEnd?: number;
  /** Years since birth, never below 0. */
  age: number;
  text: string;
  /** Drawn gold: a legend's deed. */
  gold: boolean;
  /** The event this row came from; none for birth and for a collapsed run. */
  eventId?: Id;
  /** The lines a collapsed run stands for. */
  members?: LifeRow[];
}

/** Did the person act in this event, or is it about them by name? */
function actedIn(person: Person, event: SimEvent): boolean {
  if (event.actors.includes(person.id)) return true;
  const { name, hero, enemy } = event.data;
  return event.actors.length === 0 && [name, hero, enemy].includes(person.name);
}

/** The side a person fought for in a battle line: the realm they fought against. */
function foeOf(person: Person, event: SimEvent): string {
  const { attackerLead, civ, enemy } = event.data;
  return String(attackerLead === person.name ? enemy : (civ ?? enemy ?? ''));
}

/** Runs of the same event type within one war, or each within this many years of the last. */
const RUN_GAP_YEARS = 5;
/** Lines that stand alone: a death, a marriage, a founding. */
const NO_FOLD = new Set(['notable_died', 'marriage', 'dynasty_founded', 'legend_risen']);

/**
 * The life line: birth, then the events the person acted in, in order, each with the age and the
 * year. Runs of the same type within one war or five years fold into one line that lists its
 * members. `events` are the person's own events, oldest first; `textOf` renders a chronicle line
 * and `titleOf` names an event type for a folded run.
 */
export function lifeRows(
  world: WorldState,
  person: Person,
  events: readonly SimEvent[],
  textOf: (event: SimEvent) => string,
  options: { legend?: boolean; titleOf?: (event: SimEvent) => string } = {},
): LifeRow[] {
  const site = [...world.sites.values()].find((s) => s.cell === person.birthplaceCell);
  const rows: LifeRow[] = [
    {
      key: 'born',
      year: person.born,
      age: 0,
      text: `Born${site ? ` at ${site.name}` : ''}${
        person.born < 0 ? ', before the first settlements' : ''
      }.`,
      gold: false,
    },
  ];
  const own = events.filter(
    (e) => !NOT_LIFE.has(e.type) && e.importance >= LIFE_MIN_IMPORTANCE && actedIn(person, e),
  );
  const lines = own.map((event) => {
    const year = eventYear(event);
    return {
      event,
      row: {
        key: `e${event.id}`,
        year,
        age: Math.max(0, year - person.born),
        text: textOf(event),
        gold: options.legend === true && isLegendDeed(event),
        eventId: event.id,
      } satisfies LifeRow,
    };
  });
  // A run is one type of event within one war, or each within five years of the last. Other lines
  // may fall between its members; the run stands where it began.
  type Line = (typeof lines)[number];
  const runs: { items: Line[]; last: number }[] = [];
  const latest = new Map<string, (typeof runs)[number]>();
  for (const line of lines) {
    const { type, data } = line.event;
    // Battles fold by the foe, so two wars never read as one.
    const key = type === 'battle' ? `${type}|${foeOf(person, line.event)}` : type;
    const run = NO_FOLD.has(type) ? undefined : latest.get(key);
    const war = run?.items[0]!.event.data.war;
    if (
      run &&
      ((war !== undefined && data.war === war) || line.row.year - run.last <= RUN_GAP_YEARS)
    ) {
      run.items.push(line);
      run.last = line.row.year;
      continue;
    }
    const fresh = { items: [line], last: line.row.year };
    runs.push(fresh);
    latest.set(key, fresh);
  }
  for (const { items } of runs) {
    const first = items[0]!;
    if (items.length < 2) {
      rows.push(first.row);
      continue;
    }
    const last = items[items.length - 1]!.row;
    const span =
      last.year === first.row.year
        ? `Year ${first.row.year}`
        : `Years ${first.row.year}\u2013${last.year}`;
    const title = options.titleOf?.(first.event) ?? first.event.type.replace(/_/g, ' ');
    const text =
      first.event.type === 'battle'
        ? `Fought in ${items.length} battles against the ${foeOf(person, first.event)}, ${span}`
        : `${title}, ${items.length} times, ${span}`;
    rows.push({
      key: `r${first.event.id}`,
      year: first.row.year,
      yearEnd: last.year,
      age: first.row.age,
      text,
      gold: items.some((r) => r.row.gold),
      members: items.map((r) => r.row),
    });
  }
  return rows;
}

export interface FamilyGroups {
  parents: Person[];
  spouses: Person[];
  children: Person[];
  /** Other children of their parents. */
  siblings: Person[];
  /** Children of their children. */
  grandchildren: Person[];
  /** The house they belong to, with its founder and how many of its people are on record. */
  line:
    | { id: Id; name: string; founder: Person | undefined; founded: number; members: number }
    | undefined;
}

/** Parents, siblings, spouses, children, grandchildren and house who are on record. */
export function familyOf(world: WorldState, person: Person): FamilyGroups {
  const pick = (ids: readonly Id[], skip: ReadonlySet<Id> = new Set()) => {
    const seen = new Set<Id>();
    return ids.flatMap((id) => {
      const found = world.people.get(id);
      if (!found || skip.has(id) || seen.has(id)) return [];
      seen.add(id);
      return [found];
    });
  };
  const parents = pick(person.family.parents);
  const children = pick(person.family.children);
  const dynasty =
    person.dynastyId === undefined ? undefined : world.dynasties.get(person.dynastyId);
  let line: FamilyGroups['line'];
  if (dynasty) {
    let members = 0;
    for (const p of world.people.values()) if (p.dynastyId === dynasty.id) members += 1;
    line = {
      id: dynasty.id,
      name: dynasty.name,
      founder: world.people.get(dynasty.founderId),
      founded: dynasty.founded,
      members,
    };
  }
  return {
    parents,
    spouses: pick(person.family.spouses),
    children,
    siblings: pick(
      parents.flatMap((p) => p.family.children),
      new Set([person.id]),
    ),
    grandchildren: pick(children.flatMap((c) => c.family.children)),
    line,
  };
}

export interface Rival {
  person: Person;
  /** Why: "rival", "sworn enemy", "slew Brokli" or "slain by Brokli". */
  why: string;
}

/** Event types that end a life at a named hand, and the actor slots of killer and victim. */
function killPair(event: SimEvent): { killer: Id; victim: Id } | undefined {
  const [a, b] = event.actors;
  if (a === undefined || b === undefined) return undefined;
  const text = (key: string) => String(event.data[key] ?? '');
  switch (event.type) {
    // actors: the dead, then the killer ("in battle, slain by Brokli").
    case 'notable_died':
      return /\b(slain|killed) by\b/.test(text('cause')) ? { killer: b, victim: a } : undefined;
    // actors: winner, loser; the loser died when the outcome says so.
    case 'legend_duel':
      return /\bkilled\b/.test(text('outcome')) ? { killer: a, victim: b } : undefined;
    // actors: avenger, enemy.
    case 'vengeance_raid':
      return /\b(slain|killed)\b/.test(text('outcome')) ? { killer: a, victim: b } : undefined;
    default:
      return undefined;
  }
}

/**
 * Rivals, sworn enemies, their killer and those they killed, each once. Kills come from the
 * person's own events (a duel, a battle, a raid) as well as the `killerId` of the record.
 */
export function rivalsOf(
  world: WorldState,
  person: Person,
  events: readonly SimEvent[] = [],
): Rival[] {
  const out = new Map<Id, Rival>();
  const add = (id: Id | undefined, why: string) => {
    const found = id === undefined ? undefined : world.people.get(id);
    if (found && found.id !== person.id && !out.has(found.id))
      out.set(found.id, { person: found, why });
  };
  add(person.killerId, `slew ${person.name}`);
  for (const e of events) {
    const pair = killPair(e);
    if (pair?.victim === person.id) add(pair.killer, `slew ${person.name}`);
  }
  for (const id of person.rivals ?? []) add(id, 'rival');
  for (const id of person.enemies ?? []) add(id, 'sworn enemy');
  for (const e of events) {
    const pair = killPair(e);
    if (pair?.killer === person.id) add(pair.victim, `slain by ${person.name}`);
  }
  for (const other of world.people.values()) {
    if (other.killerId === person.id) add(other.id, `slain by ${person.name}`);
  }
  return [...out.values()];
}

export const DEED_GROUPS = [
  {
    id: 'spells',
    label: 'Spells and study',
    types: [
      'spell_cast',
      'mage_went_to_study',
      'mage_came_home',
      'college_founded',
      'legend_risen',
    ],
  },
  {
    id: 'battles',
    label: 'Battles and duels',
    types: [
      'battle',
      'champion_fought',
      'legend_duel',
      'vengeance_raid',
      'oath_sworn',
      'site_conquered',
      'site_razed',
      'beast_slain',
      'beast_fought',
      'dragon_quest',
    ],
  },
  {
    id: 'works',
    label: 'Works',
    types: ['artifact_made', 'book_written', 'site_founded', 'outpost_founded', 'dynasty_founded'],
  },
  {
    id: 'treasures',
    label: 'Treasures',
    types: [
      'item_inherited',
      'item_lost',
      'item_stolen',
      'item_found',
      'item_hoarded',
      'expedition_treasure',
      'dragon_hoard_claimed',
    ],
  },
  {
    id: 'faith',
    label: 'Preaching and schisms',
    types: [
      'prophet_rose',
      'faith_schism',
      'holy_war_preached',
      'holy_war_proclaimed',
      'high_priest_named',
      'heresy_denounced',
      'ruler_converted',
      'faith_spread',
    ],
  },
] as const;

export interface DeedGroup {
  id: string;
  label: string;
  events: SimEvent[];
}

/** The person's events sorted into deed groups (spells, battles, works, treasures, faith). */
export function deedsOf(events: readonly SimEvent[]): DeedGroup[] {
  const out: DeedGroup[] = [];
  for (const group of DEED_GROUPS) {
    const types = new Set<string>(group.types);
    const found = events.filter((e) => types.has(e.type));
    if (found.length > 0) out.push({ id: group.id, label: group.label, events: found });
  }
  return out;
}

export interface Chip {
  key: string;
  text: string;
  /** A page the chip opens, when it names one. */
  to?: { kind: 'dynasty' | 'civ' | 'site'; id: Id };
}

/** The header chips: race, birth, age or death, line, fame, faith. */
export function chipsOf(
  world: WorldState,
  person: Person,
  content: NameContent,
  finalYear: number,
): Chip[] {
  const race = content.races.find((r) => r.id === person.raceId)?.name ?? person.raceId;
  const birthSite = [...world.sites.values()].find((s) => s.cell === person.birthplaceCell);
  const dynasty =
    person.dynastyId === undefined ? undefined : world.dynasties.get(person.dynastyId);
  const faith = faithOf(world, person);
  const year = (y: number) => (y < 0 ? `−${-y}` : `${y}`);
  const chips: Chip[] = [
    { key: 'race', text: `${race} · ${person.sex === 'f' ? 'she' : 'he'}` },
    {
      key: 'born',
      text: `Born Year ${year(person.born)}${birthSite ? ` at ${birthSite.name}` : ''}`,
      ...(birthSite ? { to: { kind: 'site' as const, id: birthSite.id } } : {}),
    },
    {
      key: 'age',
      text:
        person.died === undefined
          ? `${finalYear - person.born} years old`
          : `Died Year ${year(person.died)}, aged ${person.died - person.born}`,
    },
  ];
  if (dynasty)
    chips.push({ key: 'line', text: dynasty.name, to: { kind: 'dynasty', id: dynasty.id } });
  chips.push({ key: 'fame', text: `Fame ${person.fame}` });
  if (faith) chips.push({ key: 'faith', text: faith.name });
  return chips;
}

export interface WatchState {
  siteId: Id;
  name: string;
  /** Why watching is unavailable; undefined when it can start. */
  reason: string | undefined;
  /** The town has fallen, so its Legends page is the way to it. */
  fallen: boolean;
}

/** The town to watch for a person (their home, else the birthplace) and whether it can be. */
export function watchOf(
  world: WorldState,
  person: Person,
  enabled: boolean,
): WatchState | undefined {
  const home = person.siteId == null ? undefined : world.sites.get(person.siteId);
  const site = home ?? [...world.sites.values()].find((s) => s.cell === person.birthplaceCell);
  if (!site) return undefined;
  let reason: string | undefined;
  if (site.ruinedYear !== undefined) reason = `Town fell in Year ${site.ruinedYear}`;
  else if (!enabled) reason = 'Watch is available at the present year';
  return { siteId: site.id, name: site.name, reason, fallen: site.ruinedYear !== undefined };
}
