// Family at the watched site (M3.6, REBOOT_PLAN §6): courtship and marriage by culture, children
// born and growing up, households forming, and what a death sets going (graded grief, a new head
// by the culture's inheritance rule, orphans taken in). Every number is content (`content/family.ts`).

import { DAYS_PER_MONTH, DAYS_PER_YEAR } from '../core/clock';
import { sortedById } from '../core/math';
import type { EmitInput } from '../core/context';
import { streamFor, type RngStream } from '../core/rng';
import type { ActiveSite, Household, Id, Person, SimEvent, WorldState } from '../core/types';
import { lifeRates } from '../history/demography';
import { rollAptitude } from '../people/aptitude';
import { cultureGivenName } from '../people/names';
import { bandOfAge, type SiteContent } from './defs';
import { beginChildbirth } from './health';
import { rollTraits, startingNeeds } from './promote';
import {
  hasLabel,
  isMonthStart,
  opinionOf,
  relationOf,
  remember,
  setLabel,
  shiftOpinion,
  envOf,
  type SocialEnv,
} from './social';

// ---- Small lookups ----

const yearsIn = (env: SocialEnv) => Math.floor((env.day - env.active.enteredDay) / DAYS_PER_YEAR);
const ageOf = (env: SocialEnv, p: Person) => env.world.params.historyYears + yearsIn(env) - p.born;
const raceOf = (env: SocialEnv, p: Person) => env.content.races.find((r) => r.id === p.raceId)!;
const cultureOf = (env: SocialEnv, p: Person) =>
  env.content.cultures.find((c) => c.id === p.cultureId);
const person = (env: SocialEnv, id: Id): Person | undefined => env.world.people.get(id);
/** Alive and at the site (a spouse who stayed in the world tier, or died, is not here). */
const here = (p: Person | undefined): p is Person =>
  p !== undefined && p.died === undefined && p.detail !== undefined;
const isGrown = (env: SocialEnv, p: Person) => ageOf(env, p) >= raceOf(env, p).maturityYears;
const isAdultBand = (env: SocialEnv, p: Person) =>
  bandOfAge(raceOf(env, p), ageOf(env, p)) === 'adult';
const byAge = (a: Person, b: Person) => a.born - b.born || a.id - b.id;
const householdOf = (env: SocialEnv, p: Person): Household | undefined =>
  env.active.households.get(p.family.householdId ?? -1);
/** The people list changed (born, moved, married, died): rebuild the profiles and refresh the mirror. */
const bump = (env: SocialEnv) => {
  env.active.peopleVersion += 1;
};
const residentsHere = (env: SocialEnv): Person[] =>
  env.active.residents.map((id) => person(env, id)).filter(here);

// ---- Kin ----

/** Parent, child, sibling or spouse. */
export function isKin(_world: WorldState, a: Person, b: Person): boolean {
  return (
    a.family.parents.includes(b.id) ||
    a.family.children.includes(b.id) ||
    a.family.spouses.includes(b.id) ||
    a.family.parents.some((id) => b.family.parents.includes(id))
  );
}

/** Parent, child, sibling, grandparent, aunt or uncle, or first cousin (dead records count). */
function closeKin(world: WorldState, a: Person, b: Person): boolean {
  const parents = (p: Person) => p.family.parents;
  const grand = (p: Person) =>
    parents(p).flatMap((id) => world.people.get(id)?.family.parents ?? []);
  const pa = parents(a);
  const pb = parents(b);
  const ga = grand(a);
  const gb = grand(b);
  const meets = (x: readonly Id[], y: readonly Id[]) => x.some((id) => y.includes(id));
  return (
    pa.includes(b.id) ||
    pb.includes(a.id) ||
    meets(pa, pb) ||
    ga.includes(b.id) ||
    gb.includes(a.id) ||
    meets(pb, ga) ||
    meets(pa, gb) ||
    meets(ga, gb)
  );
}

// ---- Courtship ----

function livingSpouses(env: SocialEnv, p: Person): Person[] {
  return p.family.spouses.map((id) => person(env, id)).filter(here);
}

/** Spouses still alive anywhere (a notable's spouse may live at another site): they bar a new match. */
function aliveSpouses(env: SocialEnv, p: Person): number {
  let n = 0;
  for (const id of p.family.spouses) {
    const q = person(env, id);
    if (q && q.died === undefined) n += 1;
  }
  return n;
}

/** Whether any spouse is still alive, here or elsewhere. */
export function hasLivingSpouse(env: SocialEnv, p: Person): boolean {
  return aliveSpouses(env, p) > 0;
}

/** A leader where the custom allows more than one wife (the ruler, or a notable who heads a household). */
function mayTakeMore(env: SocialEnv, p: Person): boolean {
  if (p.sex !== 'm' || cultureOf(env, p)?.marriage.custom !== 'leaders-many-spouses') return false;
  const h = householdOf(env, p);
  if (!h || h.head !== p.id) return false;
  const site = env.world.sites.get(env.active.siteId);
  const ruler = site?.civId == null ? undefined : env.world.civs.get(site.civId)?.rulerId;
  return (
    (p.title !== undefined || ruler === p.id) &&
    aliveSpouses(env, p) < env.content.family.maxSpouses
  );
}

/** Grown, not an elder, and without a living spouse here (after mourning); `extra` lets a leader take another. */
function canWed(env: SocialEnv, p: Person, extra = false): boolean {
  if (!here(p) || !isAdultBand(env, p)) return false;
  if (aliveSpouses(env, p) > 0) return extra && mayTakeMore(env, p);
  const widowed = p.detail!.widowedDay;
  return widowed === undefined || env.day - widowed >= env.content.family.court.remarryAfterDays;
}

function loverOf(env: SocialEnv, p: Person): Person | undefined {
  for (const [id, rel] of p.detail?.relationships ?? []) {
    if (!rel.labels.includes('lover')) continue;
    const q = person(env, id);
    if (here(q)) return q;
  }
  return undefined;
}

/** Same race, opposite sex, near in age, not close kin. */
function compatible(env: SocialEnv, a: Person, b: Person): boolean {
  return (
    a.raceId === b.raceId &&
    a.sex !== b.sex &&
    Math.abs(a.born - b.born) <=
      (env.content.family.court.ageGap * raceOf(env, a).lifespanYears) /
        env.content.history.referenceLifespan &&
    !closeKin(env.world, a, b)
  );
}

/** Both free to court each other (cheap checks first: this runs for many candidate pairs). */
export function pairCanCourt(env: SocialEnv, a: Person, b: Person): boolean {
  if (a.sex === b.sex || a.raceId !== b.raceId) return false;
  // The evening's list of the free (see `freeToCourt`) answers the per-person checks at once.
  if (env.free) return env.free.has(a.id) && env.free.has(b.id) && compatible(env, a, b);
  if (hasLivingSpouse(env, a) || hasLivingSpouse(env, b)) return false;
  return (
    canWed(env, a) &&
    canWed(env, b) &&
    compatible(env, a, b) &&
    loverOf(env, a) === undefined &&
    loverOf(env, b) === undefined
  );
}

/** Everyone free to court this evening: grown, unwed (after mourning) and without a lover. */
export function freeToCourt(env: SocialEnv, people: readonly Person[]): Set<Id> {
  const free = new Set<Id>();
  for (const p of people) {
    if (!hasLivingSpouse(env, p) && canWed(env, p) && loverOf(env, p) === undefined) free.add(p.id);
  }
  return free;
}

/** A flirt from `a` to `b`: it lands by how much `b` thinks of `a`; two warm hearts become lovers. */
export function flirt(env: SocialEnv, rng: RngStream, a: Person, b: Person): void {
  const c = env.content.family.court;
  const chance = Math.min(
    c.successMax,
    Math.max(c.successMin, (opinionOf(b, a.id) + c.successShift) / 100),
  );
  if (!rng.chance(chance)) {
    shiftOpinion(env, a, b, c.failOpinion);
    remember(env, a, c.rejectedMemory, b.id);
    return;
  }
  const ra = shiftOpinion(env, b, a, c.successOpinion);
  const rb = shiftOpinion(env, a, b, c.successOpinion);
  if (ra.opinion < c.loversAt || rb.opinion < c.loversAt) return;
  const event = env.emit({
    type: env.content.social.events.lovers,
    actors: [a.id, b.id],
    place: env.label.cell,
    data: { site: env.label.name },
  });
  for (const rel of [ra, rb]) {
    setLabel(env, rel, 'lover', true);
    rel.cause = event.id;
  }
  env.free?.delete(a.id);
  env.free?.delete(b.id);
}

// ---- Households ----

function rehead(env: SocialEnv, h: Household, head: Id): void {
  const old = h.head;
  h.head = head;
  h.members = [head, ...h.members.filter((id) => id !== head)];
  const home = h.home === null ? undefined : env.active.buildings.get(h.home);
  if (home && home.owner === old) home.owner = head;
}

function dropHousehold(env: SocialEnv, h: Household): void {
  env.active.households.delete(h.id);
  const home = h.home === null ? undefined : env.active.buildings.get(h.home);
  if (home && home.owner === h.head) home.owner = null;
}

/** Takes a person out of their household; a head is replaced by the eldest grown member, an empty household goes. */
export function leave(env: SocialEnv, p: Person): void {
  const h = householdOf(env, p);
  delete p.family.householdId;
  if (!h) return;
  h.members = h.members.filter((id) => id !== p.id);
  if (h.members.length === 0) {
    dropHousehold(env, h);
    return;
  }
  if (h.head !== p.id) return;
  const rest = h.members.map((id) => person(env, id)).filter(here);
  const pool = rest.filter((q) => isGrown(env, q));
  rehead(env, h, (pool.length > 0 ? pool : rest).sort(byAge)[0]?.id ?? h.members[0]!);
}

function moveTo(env: SocialEnv, p: Person, h: Household): void {
  if (p.family.householdId === h.id) return;
  leave(env, p);
  if (!h.members.includes(p.id)) h.members.push(p.id);
  p.family.householdId = h.id;
}

/** A child follows their mother; with no living mother here, their father. */
function follows(env: SocialEnv, child: Person, parent: Person): boolean {
  if (parent.sex === 'f') return true;
  return !child.family.parents.some((id) => {
    const q = person(env, id);
    return q !== undefined && q.id !== parent.id && q.sex === 'f' && here(q);
  });
}

/** Moves a person and the children under maturity who follow them. */
function moveWithMinors(env: SocialEnv, p: Person, to: Household): void {
  const from = householdOf(env, p);
  const kids = (from?.members ?? [])
    .map((id) => person(env, id))
    .filter(here)
    .filter(
      (c) =>
        c.id !== p.id && c.family.parents.includes(p.id) && !isGrown(env, c) && follows(env, c, p),
    );
  moveTo(env, p, to);
  for (const kid of kids) moveTo(env, kid, to);
}

// ---- Marriage ----

function marry(env: SocialEnv, a: Person, b: Person, how: 'love' | 'arranged', via?: Id): void {
  const groom = a.sex === 'm' ? a : b;
  const bride = groom === a ? b : a;
  const rules = env.content.family;
  const gift = cultureOf(env, groom)?.marriage.gift ?? 'none';
  for (const [x, y] of [
    [groom, bride],
    [bride, groom],
  ] as const) {
    if (!x.family.spouses.includes(y.id)) x.family.spouses.push(y.id);
  }
  const event = env.emit({
    type: rules.events.married,
    actors: [groom.id, bride.id],
    place: env.label.cell,
    causes: via === undefined ? [] : [via],
    data: { site: env.label.name, gift: rules.gifts[gift], how: rules.how[how] },
  });
  for (const [x, y] of [
    [groom, bride],
    [bride, groom],
  ] as const) {
    const rel = relationOf(x, y.id);
    if (rel) setLabel(env, rel, 'lover', false);
    remember(env, x, rules.memoryOf.married, y.id, event.id);
  }
  // The bride joins the groom's household, unless she heads one with others in it.
  const gh = householdOf(env, groom);
  const bh = householdOf(env, bride);
  if (gh && bh && gh !== bh) {
    if (bh.head === bride.id && bh.members.length > 1) moveWithMinors(env, groom, bh);
    else moveWithMinors(env, bride, gh);
  } else if (gh && !bh) moveTo(env, bride, gh);
  else if (bh && !gh) moveTo(env, groom, bh);
  bump(env);
}

function monthlyMarriages(env: SocialEnv, rng: RngStream): void {
  const { court, arranged } = env.content.family;
  const people = residentsHere(env);
  // Lovers who have kept company long enough.
  for (const p of people) {
    for (const [id, rel] of [...p.detail!.relationships]) {
      if (!rel.labels.includes('lover') || p.id > id) continue;
      const q = person(env, id);
      if (!here(q) || !hasLabel(q, p.id, 'lover')) continue;
      if (!canWed(env, p) || !canWed(env, q)) continue;
      if (rel.since === undefined || env.day - rel.since < court.courtDays) continue;
      if (rng.chance(court.marryChance)) marry(env, p, q, 'love', rel.cause);
    }
  }
  // Households arrange matches for their grown members in cultures that do.
  for (const h of sortedById(env.active.households.values())) {
    for (const id of [...h.members].sort((a, b) => a - b)) {
      const p = person(env, id);
      const culture = p && cultureOf(env, p);
      if (!here(p) || !culture?.marriage.arranged) continue;
      if (ageOf(env, p) < raceOf(env, p).maturityYears + arranged.afterYears) continue;
      if (!canWed(env, p, true) || loverOf(env, p)) continue;
      if (!rng.chance(arranged.chance)) continue;
      let best: Person | undefined;
      let bestSum = -Infinity;
      for (const q of residentsHere(env)) {
        if (q.id === p.id || q.cultureId !== p.cultureId || !canWed(env, q) || loverOf(env, q))
          continue;
        if (!compatible(env, p, q)) continue;
        if (hasLabel(p, q.id, 'enemy') || hasLabel(q, p.id, 'enemy')) continue;
        const sum = opinionOf(p, q.id) + opinionOf(q, p.id);
        if (sum < arranged.minOpinionSum) continue;
        if (sum > bestSum || (sum === bestSum && best !== undefined && q.id < best.id)) {
          best = q;
          bestSum = sum;
        }
      }
      if (best) marry(env, p, best, 'arranged');
    }
  }
}

// ---- Households forming ----

function formHousehold(env: SocialEnv): void {
  const { active, content } = env;
  const households = sortedById(active.households.values());
  const taken = new Set(households.flatMap((h) => [h.home, h.lodgingHome ?? null]));
  const heads = new Set(households.map((h) => h.head));
  const home = [...active.buildings.values()]
    .filter(
      (b) =>
        b.defId === content.steward.homeBuilding &&
        b.followed &&
        b.progress === undefined &&
        !b.burnt &&
        !taken.has(b.id) &&
        (b.owner === null || !heads.has(b.owner)),
    )
    .sort((a, b) => a.id - b.id)[0];
  if (!home) return;
  // The largest household with a married couple beyond its head and the head's spouses.
  for (const h of [...households].sort(
    (a, b) => b.members.length - a.members.length || a.id - b.id,
  )) {
    const head = person(env, h.head);
    if (!head) continue;
    const members = h.members.map((id) => person(env, id)).filter(here);
    const husband = members
      .filter((m) => m.sex === 'm' && m.id !== head.id && !head.family.spouses.includes(m.id))
      .sort((a, b) => a.id - b.id)
      .find((m) =>
        members.some(
          (w) =>
            w.id !== head.id &&
            !head.family.spouses.includes(w.id) &&
            m.family.spouses.includes(w.id),
        ),
      );
    if (!husband) continue;
    const wife = members.find(
      (w) =>
        husband.family.spouses.includes(w.id) &&
        w.id !== head.id &&
        !head.family.spouses.includes(w.id),
    )!;
    const minors = members.filter(
      (c) =>
        !isGrown(env, c) &&
        (c.family.parents.includes(husband.id) || c.family.parents.includes(wife.id)),
    );
    const id = Math.max(0, ...active.households.keys()) + 1;
    const fresh: Household = { id, members: [], head: husband.id, home: home.id };
    active.households.set(id, fresh);
    for (const m of [husband, wife, ...minors]) moveTo(env, m, fresh);
    home.owner = husband.id;
    env.emit({
      type: content.family.events.householdFormed,
      actors: [husband.id, h.head],
      place: env.label.cell,
      data: { site: env.label.name },
    });
    bump(env);
    return;
  }
}

// ---- Births and growing up ----

/** Wired to M3.5's childbirth risk: the mother may die in labour (beginChildbirth); returns whether she did. */
function childbirthKillsMother(env: SocialEnv, mother: Person): boolean {
  return beginChildbirth(env.world, env.content, env.active, mother, env.emit, env.label);
}

function monthlyConceptions(env: SocialEnv, rng: RngStream): void {
  const { content, active, world } = env;
  const births = content.family.births;
  const site = world.sites.get(active.siteId);
  // The followed stand for the whole site: crowding is the site's people (followed / share) over capacity.
  const crowding =
    site && site.capacity > 0
      ? Math.min(1, active.residents.length / active.share / site.capacity)
      : 1;
  const people = residentsHere(env);
  for (const race of content.races) {
    const adults = people.filter((p) => p.raceId === race.id && isAdultBand(env, p)).length;
    const wives = people
      .filter(
        (p) =>
          p.raceId === race.id &&
          p.sex === 'f' &&
          !p.detail!.pregnant &&
          ageOf(env, p) >= race.maturityYears &&
          ageOf(env, p) < births.fertileUntil * race.lifespanYears &&
          livingSpouses(env, p).some((s) => s.sex === 'm'),
      )
      .sort((a, b) => a.id - b.id);
    if (wives.length === 0) continue;
    // Births a year match history's (rate × adults), shared among the fertile wives, capped.
    const yearly = Math.min(
      births.maxPerWife,
      (lifeRates(race, content.history, crowding).birth * adults) / Math.max(1, wives.length),
    );
    for (const wife of wives) {
      if (!rng.chance(yearly / (DAYS_PER_YEAR / DAYS_PER_MONTH))) continue;
      const father = livingSpouses(env, wife)
        .filter((s) => s.sex === 'm')
        .sort((a, b) => a.id - b.id)[0]!;
      wife.detail!.pregnant = { father: father.id, dueDay: env.day + births.pregnancyDays };
    }
  }
}

function dailyBirths(env: SocialEnv, rng: RngStream): void {
  for (const id of [...env.active.residents]) {
    const mother = person(env, id);
    const pregnant = mother?.detail?.pregnant;
    if (!here(mother) || !pregnant || pregnant.dueDay > env.day) continue;
    mother.detail!.pregnant = undefined;
    bear(env, rng, mother, pregnant.father);
  }
}

function bear(env: SocialEnv, rng: RngStream, mother: Person, fatherId: Id): void {
  const { world, content, active } = env;
  const site = world.sites.get(active.siteId);
  if (!site) return;
  const race = raceOf(env, mother);
  const culture = cultureOf(env, mother) ?? content.cultures.find((c) => c.raceId === race.id)!;
  const father = person(env, fatherId);
  const parents = father ? [mother, father] : [mother];
  const aptitude = rollAptitude(
    { race, parents, birthplaceAura: world.cells?.aura[site.cell] ?? 0 },
    rng,
  );
  const names = new Set(residentsHere(env).map((p) => p.name));
  const sex = rng.chance(0.5) ? 'f' : 'm';
  let name = cultureGivenName(culture.names, rng, sex);
  for (let t = 0; t < 12 && names.has(name); t += 1)
    name = cultureGivenName(culture.names, rng, sex);
  const id = world.nextId.person;
  world.nextId.person += 1;
  const child: Person = {
    id,
    name,
    raceId: race.id,
    cultureId: culture.id,
    sex,
    born: world.params.historyYears + yearsIn(env),
    birthplaceCell: site.cell,
    family: { parents: parents.map((p) => p.id), spouses: [], children: [] },
    attributes: aptitude.attributes,
    potential: aptitude.potential,
    magic: aptitude.magic,
    traits: [],
    skills: {},
    knownAbilities: [],
    fame: 0,
    deeds: [],
    health: 100,
    siteId: active.siteId,
    civId: site.civId,
  };
  rollTraits(content, child, streamFor(world, 'site.traits'));
  for (const parent of parents) parent.family.children.push(id);
  const md = mother.detail!;
  child.detail = {
    needs: startingNeeds(content, culture.values.faith),
    mood: 0,
    stress: 0,
    memories: [],
    relationships: new Map(),
    pos: md.pos ? [md.pos[0], md.pos[1]] : [0, 0],
    activity: 'sleep',
    placeId: md.placeId ?? null,
    moodParts: [],
    lastAte: env.day,
    lastMet: Object.fromEntries(
      Object.keys(startingNeeds(content, culture.values.faith)).map((n) => [n, env.day]),
    ),
    conditions: [],
    today: [],
  };
  world.people.set(id, child);
  active.promoted.push(id);
  active.residents.push(id);
  const home = householdOf(env, mother);
  if (home) moveTo(env, child, home);
  const key = `${race.id}|${culture.id}|child`;
  active.popDelta[key] = (active.popDelta[key] ?? 0) + 1;
  const event = env.emit({
    type: content.family.events.birth,
    actors: [id, mother.id, fatherId],
    place: env.label.cell,
    data: { site: env.label.name },
  });
  for (const parent of parents) {
    remember(env, parent, content.family.memoryOf.childBorn, id, event.id);
  }
  bump(env);
  childbirthKillsMother(env, mother);
}

/** On each site anniversary, whoever has just reached their race's maturity comes of age. */
function comingOfAge(env: SocialEnv): void {
  const { content } = env;
  for (const p of residentsHere(env)) {
    if (ageOf(env, p) !== raceOf(env, p).maturityYears) continue;
    const event = env.emit({
      type: content.family.events.cameOfAge,
      actors: [p.id],
      place: env.label.cell,
      data: { site: env.label.name },
    });
    remember(env, p, content.family.memoryOf.cameOfAge, undefined, event.id);
  }
}

/** The evening's family business: births due, coming of age, and on a month's first day conceptions, matches and new households. */
export function runFamily(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: (input: EmitInput) => SimEvent,
  label: { name: string; cell: number },
  day: number,
): void {
  const env: SocialEnv = { world, content, active, emit, label, day };
  const rng = streamFor(world, 'site.family');
  dailyBirths(env, rng);
  if (day > active.enteredDay && (day - active.enteredDay) % DAYS_PER_YEAR === 0) comingOfAge(env);
  if (!isMonthStart(day)) return;
  monthlyConceptions(env, rng);
  monthlyMarriages(env, rng);
  formHousehold(env);
}

// ---- Death ----

/**
 * The household's next head by the culture's inheritance rule, among its living members (the dead
 * are already out of `members`). The rules follow history's `heirOf`, widened to the household.
 */
export function successorOf(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  h: Household,
  dead: Person,
): Id {
  const env = envOf(world, content, active);
  const members = h.members.map((id) => person(env, id)).filter(here);
  const adults = members.filter((m) => isGrown(env, m)).sort(byAge);
  const kids = adults.filter((m) => dead.family.children.includes(m.id));
  const spouse = adults.find((m) => dead.family.spouses.includes(m.id));
  const eldest = adults[0];
  let heir: Person | undefined;
  switch (cultureOf(env, dead)?.inheritance) {
    case 'eldest-son':
    case 'sons-temple-tithe':
      heir = kids.find((m) => m.sex === 'm') ?? kids[0] ?? spouse ?? eldest;
      break;
    case 'all-children':
      heir = spouse ?? kids[0] ?? eldest;
      break;
    case 'youngest-keeps-hearth':
      heir = kids[kids.length - 1] ?? spouse ?? eldest;
      break;
    case 'eldest-daughter':
      heir = kids.find((m) => m.sex === 'f') ?? kids[0] ?? spouse ?? eldest;
      break;
    case 'best-apprentice': {
      // Children come first, so ties go to them; anyone else needs strictly more intellect.
      let best: Person | undefined;
      for (const m of [...kids, ...adults.filter((a) => !kids.includes(a))]) {
        if (!best || m.attributes.intellect > best.attributes.intellect) best = m;
      }
      heir = best ?? spouse ?? eldest;
      break;
    }
    default:
      heir = kids[0] ?? spouse ?? eldest;
  }
  return (heir ?? [...members].sort(byAge)[0])?.id ?? h.members[0]!;
}

/** The graded grief for a tie to the dead, if any. */
function griefFor(env: SocialEnv, mourner: Person, dead: Person): string | undefined {
  const m = env.content.family.memoryOf;
  if (dead.family.spouses.includes(mourner.id) || mourner.family.spouses.includes(dead.id))
    return m.lostSpouse;
  if (mourner.family.parents.includes(dead.id)) return m.lostParent;
  if (dead.family.parents.includes(mourner.id)) return m.lostChild;
  if (mourner.family.parents.some((id) => dead.family.parents.includes(id))) return m.lostSibling;
  const rel = relationOf(mourner, dead.id);
  if (rel?.grudge) return m.outlivedEnemy;
  if (rel?.labels.includes('friend')) return m.lostFriend;
  return undefined;
}

/** A guardian for an orphan: grandparent, adult sibling, aunt or uncle, else a fitting household's head. */
function guardianFor(env: SocialEnv, child: Person): Person | undefined {
  const people = residentsHere(env).filter((p) => p.id !== child.id && isGrown(env, p));
  const parents = child.family.parents;
  const grandIds = parents.flatMap((id) => person(env, id)?.family.parents ?? []);
  const kin =
    people.filter((p) => grandIds.includes(p.id)).sort(byAge)[0] ??
    people.filter((p) => p.family.parents.some((id) => parents.includes(id))).sort(byAge)[0] ??
    people
      .filter(
        (p) => !parents.includes(p.id) && p.family.parents.some((id) => grandIds.includes(id)),
      )
      .sort(byAge)[0];
  if (kin) return kin;
  // Else the head of a household of the child's people with a grown couple and the fewest children.
  let best: { head: Person; minors: number; couple: boolean; id: number } | undefined;
  for (const h of sortedById(env.active.households.values())) {
    const head = person(env, h.head);
    if (!here(head) || !isGrown(env, head)) continue;
    const members = h.members.map((id) => person(env, id)).filter(here);
    const adults = members.filter((m) => isGrown(env, m));
    const couple = adults.some((m) => m.family.spouses.some((s) => adults.some((o) => o.id === s)));
    const entry = {
      head,
      minors: members.length - adults.length,
      couple: couple && head.cultureId === child.cultureId,
      id: h.id,
    };
    const better =
      !best ||
      (entry.couple && !best.couple) ||
      (entry.couple === best.couple && entry.minors < best.minors);
    if (better) best = entry;
  }
  return best?.head;
}

/**
 * Everything a death sets going beyond what `killPerson` (health.ts) has done (marked them dead,
 * left the household and given its head to `successorOf`, passed their items): graded grief that
 * replaces the plain grief memory, widowhood, the new head's line, orphans taken in, and the dead
 * struck from everyone's relationships. `wasHead`: they headed their household.
 */
export function afterDeath(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  deadId: Id,
  deathEventId: Id,
  wasHead = false,
): void {
  const dead = world.people.get(deadId);
  if (!dead) return;
  const env = envOf(world, content, active);
  const living = residentsHere(env).filter((p) => p.id !== deadId);
  const plain = content.health.griefMemory;
  for (const p of living) {
    const type = griefFor(env, p, dead);
    if (!type) continue;
    const detail = p.detail!;
    detail.memories = detail.memories.filter((m) => !(m.type === plain && m.about === deadId));
    remember(env, p, type, deadId, deathEventId);
    if (type === content.family.memoryOf.outlivedEnemy) delete relationOf(p, deadId)!.grudge;
    if (type === content.family.memoryOf.lostSpouse) detail.widowedDay = env.day;
  }
  for (const p of living) p.detail!.relationships.delete(deadId);

  // The household's new head, named in the chronicle.
  const h = householdOf(env, dead);
  if (h && wasHead && h.members.length > 0) {
    if (h.head === deadId) rehead(env, h, successorOf(world, content, active, h, dead));
    env.emit({
      type: content.family.events.inherited,
      actors: [h.head, deadId],
      place: env.label.cell,
      causes: [deathEventId],
      data: {
        site: env.label.name,
        custom: content.family.inheritance[cultureOf(env, dead)?.inheritance ?? 'eldest-child'],
      },
    });
  }

  // Children with no parent left here are taken in; brothers and sisters go together.
  const orphans = living
    .filter((c) => !isGrown(env, c))
    .filter((c) => !c.family.parents.some((id) => here(person(env, id))))
    .filter(
      (c) =>
        dead.family.children.includes(c.id) ||
        c.detail!.guardian === deadId ||
        (h !== undefined && c.family.householdId === h.id && !hasGrown(env, h)),
    )
    .sort(byAge);
  const chosen = new Map<string, Person>();
  for (const child of orphans) {
    const key = [...child.family.parents].sort((a, b) => a - b).join(',');
    let guardian = chosen.get(key);
    if (!guardian || !here(guardian)) guardian = guardianFor(env, child);
    if (!guardian) continue;
    chosen.set(key, guardian);
    const home = householdOf(env, guardian);
    if (home) moveTo(env, child, home);
    child.detail!.guardian = guardian.id;
    env.emit({
      type: content.family.events.orphanTakenIn,
      actors: [guardian.id, child.id],
      place: env.label.cell,
      causes: [deathEventId],
      data: { site: env.label.name },
    });
  }
  bump(env);
}

const hasGrown = (env: SocialEnv, h: Household): boolean =>
  h.members.some((id) => {
    const p = person(env, id);
    return here(p) && isGrown(env, p);
  });
