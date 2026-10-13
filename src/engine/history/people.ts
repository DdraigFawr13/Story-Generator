// Notable people (M2.5): the primitives the notable systems share. A notable is a `Person` in
// `world.people`; everyone else stays a count in `Site.pop`. Creating or killing one never changes
// the counts. Ages are `run.year - person.born`. All randomness uses the `notables` stream.

import type { RaceDef } from '../core/content-types';
import { cultureGivenName } from '../people/names';
import { rollAptitude } from '../people/aptitude';
import type { BirthTierId } from '../people/tiers';
import type { Civ, Id, NotableRole, Person, Site } from '../core/types';
import type { HistoryRun } from './state';

/** Share of a lifespan after which a person is an elder. */
const ELDER_SHARE = 0.75;
/** A woman stays fertile this share of a lifespan past maturity. */
const FERTILE_SHARE = 0.35;

export interface PersonSpec {
  raceId: string;
  cultureId: string;
  siteId: Id | null;
  civId: Id | null;
  /** Birthplace cell (its aura shapes the magic roll). */
  cell: number | null;
  title: NotableRole;
  age: number;
  sex?: 'f' | 'm';
  /** Given name; rolled from the culture when absent. */
  name?: string | undefined;
  parents?: Person[];
  dynastyId?: Id;
  fame: number;
  minTier?: BirthTierId | undefined;
}

export const isAlive = (person: Person): boolean => person.died === undefined;

/** The person if they exist and live. */
export function livingPerson(run: HistoryRun, id: Id | undefined | null): Person | undefined {
  const person = id === undefined || id === null ? undefined : run.world.people.get(id);
  return person && isAlive(person) ? person : undefined;
}

export function ageOf(run: HistoryRun, person: Person): number {
  return run.year - person.born;
}

export function raceOf(run: HistoryRun, person: Person): RaceDef {
  return run.races.get(person.raceId)!;
}

export function isAdult(run: HistoryRun, person: Person): boolean {
  return ageOf(run, person) >= raceOf(run, person).maturityYears;
}

export function isElder(run: HistoryRun, person: Person): boolean {
  return ageOf(run, person) >= ELDER_SHARE * raceOf(run, person).lifespanYears;
}

export function isFertile(run: HistoryRun, person: Person): boolean {
  const race = raceOf(run, person);
  const age = ageOf(run, person);
  return (
    age >= race.maturityYears && age <= race.maturityYears + FERTILE_SHARE * race.lifespanYears
  );
}

/** Elder age as a share of lifespan, for death rates. */
export const ELDER_AT = ELDER_SHARE;

/** Living notables in id order (a fresh array, so callers may create or kill while iterating). */
export function livingList(run: HistoryRun): Person[] {
  const out: Person[] = [];
  for (const id of run.notables.living) out.push(run.world.people.get(id)!);
  return out;
}

/** Rebuilds the per-site index of living notables. */
export function rebuildIndex(run: HistoryRun): void {
  const index = run.notables.bySite;
  index.clear();
  for (const person of livingList(run)) {
    if (person.siteId === undefined || person.siteId === null) continue;
    const list = index.get(person.siteId);
    if (list) list.push(person.id);
    else index.set(person.siteId, [person.id]);
  }
}

/** Living notables at a site, in id order (from the yearly index, so checked again). */
export function livingAt(run: HistoryRun, siteId: Id): Person[] {
  const out: Person[] = [];
  for (const id of run.notables.bySite.get(siteId) ?? []) {
    const person = livingPerson(run, id);
    if (person && person.siteId === siteId) out.push(person);
  }
  return out;
}

export function siteOf(run: HistoryRun, person: Person): Site | undefined {
  return person.siteId === undefined || person.siteId === null
    ? undefined
    : run.world.sites.get(person.siteId);
}

/** The cell an event about the person happens at: their site, else where they were born. */
export function placeOf(run: HistoryRun, person: Person): number | null {
  return siteOf(run, person)?.cell ?? person.birthplaceCell;
}

export function civOfPerson(run: HistoryRun, person: Person): Civ | undefined {
  return person.civId === undefined || person.civId === null
    ? undefined
    : run.world.civs.get(person.civId);
}

/** Records an event among a person's deeds. */
export function addDeed(person: Person, event: Id): void {
  if (!person.deeds.includes(event)) person.deeds.push(event);
}

/** People who share a parent with the person (full or half), by id. */
export function siblingsOf(run: HistoryRun, person: Person): Person[] {
  const seen = new Set<Id>();
  for (const parentId of person.family.parents) {
    const parent = run.world.people.get(parentId);
    for (const childId of parent?.family.children ?? [])
      if (childId !== person.id) seen.add(childId);
  }
  return [...seen].sort((a, b) => a - b).map((id) => run.world.people.get(id)!);
}

/** Parent, child or sibling of each other. */
export function closeKin(a: Person, b: Person): boolean {
  if (a.family.parents.includes(b.id) || b.family.parents.includes(a.id)) return true;
  return a.family.parents.some((p) => b.family.parents.includes(p));
}

/** Makes two people rivals, both ways. */
export function makeRivals(a: Person, b: Person): void {
  if (a.id === b.id) return;
  if (!(a.rivals ??= []).includes(b.id)) a.rivals.push(b.id);
  if (!(b.rivals ??= []).includes(a.id)) b.rivals.push(a.id);
}

/** Marries two people (both ways). */
export function wed(a: Person, b: Person): void {
  if (!a.family.spouses.includes(b.id)) a.family.spouses.push(b.id);
  if (!b.family.spouses.includes(a.id)) b.family.spouses.push(a.id);
}

/** True if the person has a living spouse. */
export function isMarried(run: HistoryRun, person: Person): boolean {
  return person.family.spouses.some((id) => livingPerson(run, id) !== undefined);
}

/** Creates a notable: name, sex and aptitude come from the notables stream; family links are made both ways. */
export function createPerson(run: HistoryRun, spec: PersonSpec): Person {
  const { world } = run;
  const rng = run.rng.notables;
  const race = run.races.get(spec.raceId)!;
  const culture = run.content.cultures.find((c) => c.id === spec.cultureId)!;
  const sex = spec.sex ?? (rng.chance(0.5) ? 'f' : 'm');
  const name = spec.name ?? cultureGivenName(culture.names, rng);
  const parents = spec.parents ?? [];
  const aptitude = rollAptitude(
    {
      race,
      parents,
      birthplaceAura: spec.cell === null ? 0 : run.cells.aura[spec.cell]!,
      minTier: spec.minTier,
    },
    rng,
  );
  const person: Person = {
    id: world.nextId.person,
    name,
    raceId: spec.raceId,
    cultureId: spec.cultureId,
    sex,
    born: run.year - spec.age,
    birthplaceCell: spec.cell,
    family: { parents: parents.map((p) => p.id), spouses: [], children: [] },
    attributes: aptitude.attributes,
    potential: aptitude.potential,
    magic: aptitude.magic,
    traits: [],
    skills: {},
    knownAbilities: [],
    fame: spec.fame,
    deeds: [],
    health: 100,
    siteId: spec.siteId,
    civId: spec.civId,
    title: spec.title,
  };
  if (spec.dynastyId !== undefined) person.dynastyId = spec.dynastyId;
  world.nextId.person += 1;
  world.people.set(person.id, person);
  run.notables.living.add(person.id);
  for (const parent of parents) parent.family.children.push(person.id);
  return person;
}

/** A new adult for the civ at the site: age between maturity and maturity + 30% of a lifespan. */
export function createAdult(
  run: HistoryRun,
  civ: Civ,
  site: Site,
  title: NotableRole,
  fame: number,
  name?: string | undefined,
): Person {
  const race = run.races.get(civ.raceId)!;
  const age = run.rng.notables.between(
    race.maturityYears,
    race.maturityYears + Math.floor(0.3 * race.lifespanYears),
  );
  return createPerson(run, {
    raceId: civ.raceId,
    cultureId: civ.cultureId,
    siteId: site.id,
    civId: civ.id,
    cell: site.cell,
    title,
    age,
    fame,
    name,
  });
}

/** The living notable of the civ with the most fame (ties by lowest id), optionally adults only. */
export function mostFamous(run: HistoryRun, civId: Id, adultsOnly = false): Person | undefined {
  let best: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId !== civId || (adultsOnly && !isAdult(run, person))) continue;
    if (!best || person.fame > best.fame) best = person;
  }
  return best;
}
