// Biographies (M2.6): a legend index over the event list, and per-entity summaries and chronicle
// lines. Summaries come from records (Person, Site, Civ, ...) because the trivial events that
// would tell a life are pruned; lines come from the surviving events. Nothing here invents facts.

import { DAYS_PER_YEAR } from '../core/clock';
import type { ContentBundle } from '../core/content-types';
import { hashString } from '../core/rng';
import type { Id, Person, SimEvent, WorldState } from '../core/types';
import { tierOfPower } from '../people/tiers';
import { fillTemplate, type Narrator } from './render';

export type LegendKind = 'person' | 'civ' | 'site' | 'beast' | 'item' | 'dynasty';
export interface LegendRef {
  kind: LegendKind;
  id: Id;
}

export interface LegendIndex {
  /** Event ids per entity, oldest first. */
  events(ref: LegendRef): readonly Id[];
  /** An indexed event by id. */
  event(id: Id): SimEvent | undefined;
  byName(kind: Exclude<LegendKind, 'person'>, name: string): Id | undefined;
  /** Every entity the event is indexed under: actors (in order) first, then links and the site. */
  refs(eventId: Id): readonly LegendRef[];
  /** Later events whose `causes` include this one, in event order. */
  effects(eventId: Id): readonly Id[];
}

export interface BiographyLine {
  eventId: Id;
  year: number;
  importance: number;
  text: string;
}
export interface Biography {
  ref: LegendRef;
  name: string;
  summary: string[];
  lines: BiographyLine[];
}

type BioContent = Pick<
  ContentBundle,
  'eventTypes' | 'biographies' | 'races' | 'cultures' | 'history' | 'creatures'
>;

const keyOf = (kind: LegendKind, id: Id) => `${kind}:${id}`;
const yearOf = (event: SimEvent) => Math.floor(event.day / DAYS_PER_YEAR);

/** Indexes the world's events under every entity they touch, in one pass. */
export function buildLegendIndex(
  world: WorldState,
  content: Pick<ContentBundle, 'eventTypes'>,
): LegendIndex {
  const names: Record<Exclude<LegendKind, 'person'>, Map<string, Id>> = {
    civ: new Map(),
    site: new Map(),
    beast: new Map(),
    item: new Map(),
    dynasty: new Map(),
  };
  for (const civ of world.civs.values()) names.civ.set(civ.name, civ.id);
  for (const site of world.sites.values()) names.site.set(site.name, site.id);
  for (const beast of world.creatures.values()) names.beast.set(beast.name, beast.id);
  for (const item of world.items.values()) names.item.set(item.name, item.id);
  for (const dynasty of world.dynasties.values()) names.dynasty.set(dynasty.name, dynasty.id);
  const siteAtCell = new Map<number, Id>();
  for (const site of world.sites.values()) siteAtCell.set(site.cell, site.id);
  const links = new Map(content.eventTypes.map((def) => [def.id, def.links]));

  const byEntity = new Map<string, Id[]>();
  const byId = new Map<Id, SimEvent>();
  const refsOf = new Map<Id, LegendRef[]>();
  const ledTo = new Map<Id, Id[]>();
  for (const event of world.events) {
    byId.set(event.id, event);
    for (const cause of event.causes) {
      const list = ledTo.get(cause);
      if (list) list.push(event.id);
      else ledTo.set(cause, [event.id]);
    }
    const keys = new Set<string>();
    const refs: LegendRef[] = [];
    const mark = (kind: LegendKind, id: Id) => {
      const key = keyOf(kind, id);
      if (keys.has(key)) return;
      keys.add(key);
      refs.push({ kind, id });
    };
    for (const actor of event.actors) mark('person', actor);
    const linkDef = links.get(event.type);
    if (linkDef) {
      for (const [field, kind] of Object.entries(linkDef)) {
        const value = event.data[field];
        if (typeof value !== 'string' || value === '') continue;
        const id = names[kind].get(value);
        if (id !== undefined) mark(kind, id);
      }
    }
    if (event.place !== null) {
      const siteId = siteAtCell.get(event.place);
      if (siteId !== undefined) mark('site', siteId);
    }
    refsOf.set(event.id, refs);
    for (const key of keys) {
      const list = byEntity.get(key);
      if (list) list.push(event.id);
      else byEntity.set(key, [event.id]);
    }
  }
  return {
    events: (ref) => byEntity.get(keyOf(ref.kind, ref.id)) ?? [],
    event: (id) => byId.get(id),
    byName: (kind, name) => names[kind].get(name),
    refs: (eventId) => refsOf.get(eventId) ?? [],
    effects: (eventId) => ledTo.get(eventId) ?? [],
  };
}

/** Fills the sentence `name`, choosing its variant by the entity's id hash. */
function sentence(
  rules: BioContent['biographies'],
  ref: LegendRef,
  name: string,
  vars: Record<string, string | number>,
): string {
  const variants = rules.sentences[name];
  if (!variants || variants.length === 0) throw new Error(`Biography sentence "${name}" missing`);
  const template = variants[hashString(`${ref.kind}${ref.id}${name}`) % variants.length]!;
  return fillTemplate(template, vars);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const nameList = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

function personSummary(
  world: WorldState,
  content: BioContent,
  ref: LegendRef,
  person: Person,
  finalYear: number,
): string[] {
  const rules = content.biographies;
  const say = (name: string, vars: Record<string, string | number>) =>
    sentence(rules, ref, name, { He: person.sex === 'f' ? 'She' : 'He', ...vars });
  const out: string[] = [];
  const civ = person.civId == null ? undefined : world.civs.get(person.civId);
  const dynasty =
    person.dynastyId === undefined ? undefined : world.dynasties.get(person.dynastyId);
  const house = dynasty ? `, of ${dynasty.name}` : '';
  let where = '';
  if (person.birthplaceCell !== null) {
    for (const site of world.sites.values()) {
      if (site.cell === person.birthplaceCell) where = ` at ${site.name}`;
    }
  }
  const parents = person.family.parents
    .map((id) => world.people.get(id)?.name)
    .filter((n): n is string => n !== undefined);
  const birth = {
    name: person.name,
    where,
    parents: parents.length > 0 ? `, child of ${nameList(parents)}` : '',
  };
  // Founders can be born before settlement (negative history years).
  out.push(
    person.born < 0
      ? say('personBornBefore', { ...birth, ago: -person.born })
      : say('personBorn', { ...birth, born: person.born }),
  );
  if (person.title !== undefined) {
    const title = rules.roles[person.title];
    out.push(
      civ
        ? say('personRole', { title, civ: civ.name, house })
        : say('personRoleAlone', { title, house }),
    );
  }
  const spouses = person.family.spouses
    .map((id) => world.people.get(id)?.name)
    .filter((n): n is string => n !== undefined);
  const kids = person.family.children.length;
  const tier = tierOfPower(person.magic.power);
  if (spouses.length > 0 || kids > 0) {
    const wed = spouses.length > 0 ? `wed ${nameList(spouses)}` : '';
    const had = kids > 0 ? `had ${kids} ${plural(kids, 'child', 'children')}` : '';
    out.push(say('personFamily', { family: [wed, had].filter(Boolean).join(' and ') }));
  }
  if (tier !== 'none') out.push(say('personMagic', { tier }));
  if (person.died !== undefined) {
    const killer =
      person.killerId === undefined ? undefined : world.people.get(person.killerId)?.name;
    out.push(
      say('personDied', {
        died: person.died,
        age: person.died - person.born,
        cause: person.causeOfDeath ? rules.causes[person.causeOfDeath] : 'of unknown causes',
        killer: killer ? `, at the hand of ${killer}` : '',
      }),
    );
  } else {
    out.push(say('personLiving', { age: finalYear - person.born }));
  }
  return out;
}

function siteSummary(world: WorldState, content: BioContent, ref: LegendRef): string[] {
  const site = world.sites.get(ref.id);
  if (!site) return [];
  const rules = content.biographies;
  const say = (name: string, vars: Record<string, string | number>) =>
    sentence(rules, ref, name, vars);
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const base = { name: site.name, kind: site.kind, founded: site.founded, civ: civ?.name ?? '' };
  const out: string[] = [];
  const ruined = site.ruinedYear;
  if (ruined !== undefined) {
    out.push(say(civ ? 'siteRuined' : 'siteRuinedFree', { ...base, ruined }));
  } else {
    out.push(say(civ ? 'siteLive' : 'siteFree', base));
  }
  const pop = site.pop.reduce((sum, band) => sum + band.count, 0);
  if (ruined !== undefined) out.push(say('sitePeak', { peak: site.peakPop }));
  else out.push(say('sitePop', { peak: site.peakPop, pop }));
  const raceCounts = new Map<string, number>();
  for (const band of site.pop) {
    raceCounts.set(band.raceId, (raceCounts.get(band.raceId) ?? 0) + band.count);
  }
  const races = content.races
    .filter((race) => (raceCounts.get(race.id) ?? 0) > 0)
    .map((race) => race.name);
  if (races.length > 0 && ruined === undefined)
    out.push(say('siteRaces', { races: nameList(races) }));
  const living = [...world.people.values()]
    .filter((p) => p.died === undefined && p.siteId === site.id)
    .sort((a, b) => b.fame - a.fame || a.id - b.id)
    .slice(0, 3)
    .map((p) => p.name);
  if (living.length > 0)
    out.push(
      say('siteNotables', {
        names: nameList(living),
        verb: living.length === 1 ? 'lives' : 'live',
      }),
    );
  return out;
}

function civSummary(
  world: WorldState,
  content: BioContent,
  index: LegendIndex,
  ref: LegendRef,
): string[] {
  const civ = world.civs.get(ref.id);
  if (!civ) return [];
  const say = (name: string, vars: Record<string, string | number>) =>
    sentence(content.biographies, ref, name, vars);
  const race = (content.races.find((r) => r.id === civ.raceId)?.name ?? civ.raceId).toLowerCase();
  const culture = content.cultures.find((c) => c.id === civ.cultureId)?.name ?? civ.cultureId;
  // "Kingdom of Ashabum" -> kingdom; "Qarabalik Khanate" -> khanate.
  const gov = (
    civ.name.includes(' of ')
      ? civ.name.slice(0, civ.name.indexOf(' of '))
      : (civ.name.split(' ').pop() ?? 'realm')
  ).toLowerCase();
  const capital = world.sites.get(civ.capital)?.name ?? 'an unknown place';
  const head = { name: civ.name, gov, race, culture, founded: civ.founded, capital };
  const out = [
    say(civ.fell === undefined ? 'civLive' : 'civFell', { ...head, fell: civ.fell ?? 0 }),
  ];
  let rulers = 1;
  let wars = 0;
  for (const id of index.events(ref)) {
    const event = index.event(id);
    if (event?.type === 'ruler_succeeded' && event.data.civ === civ.name) rulers += 1;
    if (event?.type === 'war_declared') wars += 1;
  }
  const rulerWord = plural(rulers, 'ruler', 'rulers');
  const ruler = civ.rulerId === undefined ? undefined : world.people.get(civ.rulerId)?.name;
  if (civ.fell === undefined && ruler) out.push(say('civRulers', { rulers, rulerWord, ruler }));
  else out.push(say('civRulersFell', { rulers, rulerWord }));
  let live = 0;
  for (const site of world.sites.values()) {
    if (site.civId === civ.id && site.ruinedYear === undefined) live += 1;
  }
  const warVars = { wars: wars === 0 ? 'no' : wars, warWord: plural(wars, 'war', 'wars') };
  out.push(
    civ.fell === undefined
      ? say('civSites', { ...warVars, live, placeWord: plural(live, 'place', 'places') })
      : say('civWarsFell', warVars),
  );
  return out;
}

function otherSummary(world: WorldState, content: BioContent, ref: LegendRef): string[] {
  const say = (name: string, vars: Record<string, string | number>) =>
    sentence(content.biographies, ref, name, vars);
  if (ref.kind === 'beast') {
    const beast = world.creatures.get(ref.id);
    if (!beast) return [];
    const kind = content.creatures.find((c) => c.id === beast.defId)?.name ?? beast.defId;
    const base = { name: beast.name, kind, born: beast.born };
    if (beast.died === undefined) return [say('beastLive', base)];
    return [
      say('beastDead', {
        ...base,
        died: beast.died,
        slain: beast.slainBy ? `, slain by ${beast.slainBy}` : '',
      }),
    ];
  }
  if (ref.kind === 'item') {
    const item = world.items.get(ref.id);
    if (!item) return [];
    const holder = item.holder === null ? undefined : world.people.get(item.holder)?.name;
    const base = { name: item.name, form: item.form, made: item.made };
    return [holder ? say('itemHeld', { ...base, holder }) : say('itemLost', base)];
  }
  const dynasty = world.dynasties.get(ref.id);
  if (!dynasty) return [];
  const civ = dynasty.civId === null ? undefined : world.civs.get(dynasty.civId);
  return [
    say('dynasty', {
      Name: dynasty.name.charAt(0).toUpperCase() + dynasty.name.slice(1),
      founded: dynasty.founded,
      founder: world.people.get(dynasty.founderId)?.name ?? 'an unknown founder',
      civ: civ ? `, of the ${civ.name}` : '',
    }),
  ];
}

/** The entity's summary sentences and its most important chronicle lines. */
export function biography(
  world: WorldState,
  content: BioContent,
  narrator: Narrator,
  index: LegendIndex,
  ref: LegendRef,
): Biography {
  const finalYear = Math.floor(world.day / DAYS_PER_YEAR);
  let name = '';
  let summary: string[] = [];
  if (ref.kind === 'person') {
    const person = world.people.get(ref.id);
    if (person) {
      name = person.name;
      summary = personSummary(world, content, ref, person, finalYear);
    }
  } else if (ref.kind === 'site') {
    name = world.sites.get(ref.id)?.name ?? '';
    summary = siteSummary(world, content, ref);
  } else if (ref.kind === 'civ') {
    name = world.civs.get(ref.id)?.name ?? '';
    summary = civSummary(world, content, index, ref);
  } else {
    name =
      (ref.kind === 'beast'
        ? world.creatures.get(ref.id)?.name
        : ref.kind === 'item'
          ? world.items.get(ref.id)?.name
          : world.dynasties.get(ref.id)?.name) ?? '';
    summary = otherSummary(world, content, ref);
  }

  const floor = content.history.importance.rollupBelow;
  const candidates: SimEvent[] = [];
  for (const id of index.events(ref)) {
    const event = index.event(id);
    if (event && event.type !== 'year_summary' && event.importance >= floor) candidates.push(event);
  }
  const keep = new Set<Id>();
  if (candidates.length > 0) {
    keep.add(candidates[0]!.id);
    keep.add(candidates[candidates.length - 1]!.id);
  }
  const ranked = [...candidates].sort((a, b) => b.importance - a.importance || a.id - b.id);
  for (const event of ranked) {
    if (keep.size >= content.biographies.maxLines) break;
    keep.add(event.id);
  }
  const lines = candidates
    .filter((event) => keep.has(event.id))
    .map((event) => ({
      eventId: event.id,
      year: yearOf(event),
      importance: event.importance,
      text: narrator.renderEvent(event),
    }));
  return { ref, name, summary, lines };
}
