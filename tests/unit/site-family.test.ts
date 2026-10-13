import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  afterDeath,
  envOf,
  freeToCourt,
  embark,
  generateWorld,
  killPerson,
  runFamily,
  applySiteSnapshot,
  sitePopulation,
  siteSnapshot,
  stepSite,
  voiceOf,
  type ActiveSite,
  type CultureDef,
  type Household,
  type Id,
  type Person,
  type Site,
  type WorldState,
} from '../../src/engine';

const C = DEFAULT_CONTENT;

// Compact continents (2026-10-13) moved SITE-A's biggest site (no wedding in a year); SITE-I has weddings and births.
let shared: WorldState | undefined;
const base = () => (shared ??= generateWorld('SITE-I', { width: 64, height: 64 }, C));
const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;
function fresh(content = C) {
  const world = structuredClone(base());
  const active = embark(world, content, biggest(world).id);
  const { emit, label } = voiceOf(world, content, active);
  return { world, active, emit, label };
}
const person = (world: WorldState, id: Id): Person => world.people.get(id)!;
const year = (world: WorldState) => world.params.historyYears;

/** A new resident cloned from `template`, `age` years old, in `household` (or on its own). */
function addPerson(
  world: WorldState,
  active: ActiveSite,
  template: Person,
  props: { culture: CultureDef; sex: 'f' | 'm'; age: number; parents?: Id[] },
  household?: Household,
): Person {
  const id = world.nextId.person;
  world.nextId.person += 1;
  const born = year(world) - props.age;
  const p: Person = {
    ...structuredClone(template),
    id,
    name: `Test${id}`,
    raceId: props.culture.raceId,
    cultureId: props.culture.id,
    sex: props.sex,
    born,
    family: { parents: props.parents ?? [], spouses: [], children: [] },
    traits: [],
  };
  delete p.title;
  for (const parent of props.parents ?? []) person(world, parent).family.children.push(id);
  world.people.set(id, p);
  active.residents.push(id);
  active.promoted.push(id);
  if (household) {
    household.members.push(id);
    p.family.householdId = household.id;
  }
  return p;
}

/** A household of one elder head with a daughter older than a son, both grown. */
function elderFamily(inheritance: CultureDef['inheritance']) {
  const run = fresh();
  const { world, active } = run;
  const culture = C.cultures.find((c) => c.inheritance === inheritance)!;
  const race = C.races.find((r) => r.id === culture.raceId)!;
  const template = person(world, active.residents[0]!);
  const household: Household = {
    id: Math.max(...active.households.keys()) + 1,
    members: [],
    head: 0,
    home: null,
  };
  active.households.set(household.id, household);
  const head = addPerson(
    world,
    active,
    template,
    { culture, sex: 'm', age: Math.round(race.lifespanYears * 0.85) },
    household,
  );
  household.head = head.id;
  const grown = race.maturityYears;
  const daughter = addPerson(
    world,
    active,
    template,
    { culture, sex: 'f', age: grown + 10, parents: [head.id] },
    household,
  );
  const son = addPerson(
    world,
    active,
    template,
    { culture, sex: 'm', age: grown + 5, parents: [head.id] },
    household,
  );
  active.residents.sort((a, b) => a - b);
  return { ...run, culture, household, head, daughter, son };
}

const die = (run: ReturnType<typeof fresh>, p: Person) =>
  killPerson(run.world, C, run.active, p, 'illness', undefined, run.emit, run.label);

describe('family', () => {
  it('keeps family links symmetric after a year of marriages and births', () => {
    // Seventy followed people are enough for weddings and births, and keep the run short.
    const small = { ...C, site: { ...C.site, followCap: 70 } };
    const { world, active } = fresh(small);
    const first = world.events.length;
    for (let d = 0; d < 336; d += 1) stepSite(world, small);
    const types = new Set(world.events.slice(first).map((e) => e.type));
    expect(types).toContain(C.family.events.married);
    expect(types).toContain(C.family.events.birth);
    const here = new Set([...active.residents, ...active.dead]);
    for (const id of here) {
      const p = person(world, id);
      for (const s of p.family.spouses) {
        const q = world.people.get(s);
        if (q) expect(q.family.spouses, `spouse ${s} of ${id}`).toContain(id);
      }
      for (const c of p.family.children) {
        const q = world.people.get(c);
        if (q) expect(q.family.parents, `child ${c} of ${id}`).toContain(id);
      }
      for (const par of p.family.parents) {
        const q = world.people.get(par);
        if (q) expect(q.family.children, `parent ${par} of ${id}`).toContain(id);
      }
      if (p.died === undefined) {
        const h = active.households.get(p.family.householdId ?? -1);
        expect(h?.members, `household of ${id}`).toContain(id);
      }
    }
    for (const h of active.households.values()) {
      expect(h.members).toContain(h.head);
      for (const m of h.members) expect(person(world, m).family.householdId).toBe(h.id);
    }
  });

  it('gives the household to the son or the eldest child by the culture rule', () => {
    const bySon = elderFamily('eldest-son');
    die(bySon, bySon.head);
    expect(bySon.household.head).toBe(bySon.son.id);
    const byChild = elderFamily('eldest-child');
    die(byChild, byChild.head);
    expect(byChild.household.head).toBe(byChild.daughter.id);
    const inherited = byChild.world.events.filter((e) => e.type === 'site_inherited');
    expect(inherited).toHaveLength(1);
    expect(inherited[0]!.actors).toEqual([byChild.daughter.id, byChild.head.id]);
  });

  it('takes in an orphan: a guardian and a household with a grown person', () => {
    const run = elderFamily('eldest-child');
    const { world, active, household, head, culture } = run;
    const race = C.races.find((r) => r.id === culture.raceId)!;
    const mother = addPerson(
      world,
      active,
      head,
      { culture, sex: 'f', age: race.maturityYears + 8 },
      household,
    );
    head.family.spouses.push(mother.id);
    mother.family.spouses.push(head.id);
    const child = addPerson(
      world,
      active,
      head,
      { culture, sex: 'm', age: 3, parents: [head.id, mother.id] },
      household,
    );
    // Only the child's own parents are left in the house; the grown children go elsewhere.
    run.daughter.family.parents = [];
    run.son.family.parents = [];
    for (const kid of [run.daughter, run.son]) {
      household.members = household.members.filter((m) => m !== kid.id);
      delete kid.family.householdId;
    }
    active.residents.sort((a, b) => a - b);
    die(run, head);
    die(run, mother);
    afterDeath(world, C, active, mother.id, 0);
    const guardian = child.detail!.guardian;
    expect(guardian).toBeDefined();
    const g = person(world, guardian!);
    expect(g.died).toBeUndefined();
    expect(active.residents).toContain(guardian);
    const home = active.households.get(child.family.householdId ?? -1)!;
    expect(home).toBeDefined();
    expect(home.members).toContain(child.id);
    expect(
      home.members.some((m) => {
        const q = person(world, m);
        return q.died === undefined && year(world) - q.born >= race.maturityYears;
      }),
    ).toBe(true);
    expect(world.events.some((e) => e.type === 'site_orphan_taken_in')).toBe(true);
  });

  it('replaces the plain grief of kin with a graded memory', () => {
    const run = elderFamily('eldest-child');
    die(run, run.head);
    const types = run.daughter.detail!.memories.map((m) => m.type);
    expect(types).toContain('lost-parent');
    expect(types).not.toContain(C.health.griefMemory);
  });

  it("starts nobody with a relationship, and an insult lowers the target's opinion", () => {
    const insult = {
      id: 'insult',
      name: 'insult',
      weight: 1,
      opinion: [-10, -3] as [number, number],
    };
    const content = {
      ...C,
      interactions: [insult],
      social: { ...C.social, perDay: [3, 3] as [number, number] },
    };
    const { world, active } = fresh(content);
    for (const id of active.residents) {
      expect(person(world, id).detail!.relationships.size).toBe(0);
    }
    stepSite(world, content);
    let entries = 0;
    let lowered = 0;
    for (const id of active.residents) {
      for (const [other, rel] of person(world, id).detail!.relationships) {
        entries += 1;
        expect(rel.met).toBeDefined();
        expect(person(world, other).detail!.relationships.has(id)).toBe(true);
        if (rel.opinion < 0) lowered += 1;
        expect(rel.opinion).toBeLessThanOrEqual(0);
      }
    }
    expect(entries).toBeGreaterThan(0);
    expect(lowered).toBeGreaterThan(0);
    // Far fewer pairs than all-pairs: only those who met.
    expect(entries).toBeLessThan(active.residents.length * 20);
  });

  it('keeps someone whose spouse lives at another site from courting', () => {
    const run = elderFamily('eldest-son');
    const { world, active, son } = run;
    const away = structuredClone(son);
    away.id = world.nextId.person;
    world.nextId.person += 1;
    delete away.detail;
    world.people.set(away.id, away);
    expect(freeToCourt(envOf(world, C, active), [son]).has(son.id)).toBe(true);
    son.family.spouses.push(away.id);
    away.family.spouses.push(son.id);
    expect(freeToCourt(envOf(world, C, active), [son]).has(son.id)).toBe(false);
  });

  it('bears a child to a pregnant wife on the due day', () => {
    const { world, active } = fresh();
    const wife = active.residents
      .map((id) => person(world, id))
      .find(
        (p) =>
          p.sex === 'f' &&
          p.family.spouses.some(
            (s) => active.residents.includes(s) && person(world, s).sex === 'm',
          ) &&
          p.family.householdId !== undefined,
      )!;
    const father = wife.family.spouses.find((s) => person(world, s).sex === 'm')!;
    wife.detail!.pregnant = { father, dueDay: world.day };
    const before = active.residents.length;
    const version = active.peopleVersion;
    stepSite(world, C);
    expect(active.residents.length).toBe(before + 1);
    expect(active.peopleVersion).toBeGreaterThan(version);
    const child = person(world, active.residents[active.residents.length - 1]!);
    expect(child.family.parents).toEqual([wife.id, father]);
    expect(wife.family.children).toContain(child.id);
    expect(child.family.householdId).toBe(wife.family.householdId);
    expect(active.promoted).toContain(child.id);
    expect(world.events.some((e) => e.type === 'site_birth')).toBe(true);
  });

  it('splits a married couple off into a vacant home on a month start', () => {
    const run = elderFamily('eldest-son');
    const { world, active, household, son, culture, emit, label } = run;
    const race = C.races.find((r) => r.id === culture.raceId)!;
    const wife = addPerson(
      world,
      active,
      son,
      { culture, sex: 'f', age: race.maturityYears + 4 },
      household,
    );
    son.family.spouses.push(wife.id);
    wife.family.spouses.push(son.id);
    // A crowd of children makes this the largest household.
    for (let n = 0; n < 12; n += 1) {
      addPerson(
        world,
        active,
        son,
        { culture, sex: 'f', age: 2, parents: [son.id, wife.id] },
        household,
      );
    }
    // Free a home: the first other household with one moves out of it.
    const other = [...active.households.values()].find(
      (h) =>
        h !== household &&
        h.home !== null &&
        active.buildings.get(h.home)?.defId === C.steward.homeBuilding,
    )!;
    const vacant = active.buildings.get(other.home!)!;
    vacant.owner = null;
    other.home = null;
    active.residents.sort((a, b) => a - b);
    world.day = Math.ceil(world.day / 28) * 28;
    runFamily(world, C, active, emit, label, world.day);
    const formed = world.events.filter((e) => e.type === 'site_household_formed');
    expect(formed).toHaveLength(1);
    const fresh = active.households.get(son.family.householdId!)!;
    expect(fresh).not.toBe(household);
    expect(fresh.head).toBe(son.id);
    expect(fresh.home).toBe(vacant.id);
    expect(vacant.owner).toBe(son.id);
    expect(fresh.members).toContain(wife.id);
    expect(household.members).not.toContain(son.id);
    expect(household.members).toContain(run.head.id);
  });

  it('mirrors newborns and moved households to the main thread', () => {
    const { world, active } = fresh();
    const mirror = structuredClone(world);
    const wife = active.residents
      .map((id) => person(world, id))
      .find(
        (p) => p.sex === 'f' && p.family.spouses.length > 0 && p.family.householdId !== undefined,
      )!;
    wife.detail!.pregnant = { father: wife.family.spouses[0]!, dueDay: world.day };
    stepSite(world, C);
    const childId = active.residents[active.residents.length - 1]!;
    expect(mirror.people.has(childId)).toBe(false);
    applySiteSnapshot(mirror, siteSnapshot(world, active.layoutVersion, 0));
    const copy = mirror.people.get(childId)!;
    expect(copy.detail).toBeDefined();
    expect(mirror.activeSite!.residents).toContain(childId);
    expect(mirror.activeSite!.households.get(copy.family.householdId!)!.members).toContain(childId);
    expect(mirror.people.get(wife.id)!.family.children).toContain(childId);
    // Nothing new to send when the caller is up to date.
    expect(siteSnapshot(world, active.layoutVersion, active.peopleVersion).roster).toBeUndefined();
  });
});
