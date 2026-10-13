// Society at the watched site (M3.7): standing, thin crime, punishment by the site's culture, holy
// days and funerals. Each morning (block 0) `runSocietyMorning` refreshes standing, lets the hungry
// pilfer, judges yesterday's cases, holds the funerals and festival due and ends sentences. Murder
// and brawls come from revenge (social.ts) and festivals; thefts from breakdowns (life.ts). Every
// number and phrase is content (`content/society.ts`); randomness is the `site.society` stream.

import { DAYS_PER_YEAR, dateOf } from '../core/clock';
import type { EmitInput } from '../core/context';
import {
  PUNISHMENTS,
  type Crime,
  type CultureDef,
  type FestivalDef,
  type JusticeDef,
  type Punishment,
} from '../core/content-types';
import { clamp, manhattan } from '../core/math';
import { streamFor } from '../core/rng';
import type {
  ActiveSite,
  CrimeCase,
  Id,
  Person,
  Relationship,
  SimEvent,
  Site,
  SiteSociety,
  WorldState,
} from '../core/types';
import type { SiteLabel } from './build';
import { bandOfAge, type Band, type SiteContent } from './defs';
import { leave } from './family';
import { killPerson, woundPerson } from './health';
import { foodMeals, itemCount, SEED_ITEM, takeFood, takeItem } from './stock';
import { remember, shiftOpinion, startGrudge, isMonthStart, type SocialEnv } from './social';
import { canDo, heldItems, refreshWork, transferItem } from './work';

type Emit = (input: EmitInput) => SimEvent;

export function blankSociety(): SiteSociety {
  return {
    cases: [],
    funerals: [],
    exiles: [],
    stats: { crimes: {}, unsolved: 0, punishments: {}, festivals: 0, funerals: 0 },
  };
}

const count = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};
const alive = (p: Person | null | undefined): p is Person =>
  p !== undefined && p !== null && p.died === undefined;
/** Alive and at the site (a spouse who stayed in the world tier is not here). */
const here = (p: Person | null | undefined): p is Person => alive(p) && p.detail !== undefined;
const ageOf = (world: WorldState, active: ActiveSite, p: Person) =>
  world.params.historyYears + Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR) - p.born;

// ---- The site's culture, law and holy days ----

interface Memo {
  people: number;
  culture: CultureDef | undefined;
  day: number;
  festival: FestivalDef | undefined;
}
const memos = new WeakMap<ActiveSite, Memo>();

/** The site's culture, and today's festival, kept until the people or the day change. */
function memoOf(world: WorldState, content: SiteContent, active: ActiveSite): Memo {
  let memo = memos.get(active);
  if (!memo || memo.people !== active.peopleVersion) {
    // The civ's culture; a site with no civ follows the most common culture among its residents.
    let id = world.civs.get(world.sites.get(active.siteId)?.civId ?? -1)?.cultureId;
    if (id === undefined) {
      const tally = new Map<string, number>();
      for (const rid of active.residents) {
        const c = world.people.get(rid)?.cultureId;
        if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
      }
      let best = 0;
      for (const [c, n] of tally) if (n > best || (n === best && c < id!)) [id, best] = [c, n];
    }
    memo = {
      people: active.peopleVersion,
      culture: content.cultures.find((c) => c.id === id),
      day: -1,
      festival: undefined,
    };
    memos.set(active, memo);
  }
  if (memo.day !== world.day) {
    const date = dateOf(world.day);
    memo.day = world.day;
    memo.festival = content.society.festivals.find(
      (f) =>
        f.religionId === memo!.culture?.religion.id &&
        f.month === date.month &&
        f.day === date.dayOfMonth,
    );
  }
  return memo;
}

/** The holy day of the site's religion that falls today, if any. */
export function festivalToday(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): FestivalDef | undefined {
  return memoOf(world, content, active).festival;
}

const lawOf = (content: SiteContent, culture: CultureDef | undefined): JusticeDef | undefined =>
  content.society.laws.find((l) => l.cultureId === culture?.id);

// ---- Standing ----

/** Standing 0-100 for those missing it, or for everyone at a month start; shame fades then. */
function refreshStatus(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const rules = content.society.status;
  const monthly = isMonthStart(world.day);
  const people = active.residents
    .map((id) => world.people.get(id))
    .filter(here)
    .filter((p) => monthly || p.detail!.status === undefined);
  if (people.length === 0) return;
  const held = new Map<Id, number>();
  for (const item of world.items.values()) {
    if (item.holder !== null) held.set(item.holder, (held.get(item.holder) ?? 0) + 1);
  }
  const heads = new Set([...active.households.values()].map((h) => h.head));
  for (const p of people) {
    const detail = p.detail!;
    const race = content.races.find((r) => r.id === p.raceId)!;
    const kin = [...p.family.parents, ...p.family.spouses, ...p.family.children];
    const notable = kin.some((id) => {
      const q = world.people.get(id);
      return alive(q) && q.title !== undefined;
    });
    const points =
      (rules.jobs[detail.jobId ?? ''] ?? 0) +
      // M3.10: the site's leader counts as titled, unless their own title is worth more.
      (active.politics?.leaderId === p.id
        ? Math.max(rules.titles[p.title ?? ''] ?? 0, content.politics.standing)
        : (rules.titles[p.title ?? ''] ?? 0)) +
      (heads.has(p.id) ? rules.head : 0) +
      (bandOfAge(race, ageOf(world, active, p)) === 'elder' ? rules.elder : 0) +
      Math.min(rules.itemsMax, rules.perItem * (held.get(p.id) ?? 0)) +
      Math.min(rules.fameMax, p.fame / rules.fameDiv) +
      (notable ? rules.notableKin : 0);
    detail.status = Math.round(clamp(points - (detail.shame ?? 0), 0, 100));
    if (monthly) detail.shame = Math.max(0, (detail.shame ?? 0) - rules.recoverPerMonth);
  }
  // High standing is relative: only the top tenth (and never below the content's floor).
  const all = active.residents
    .map((id) => world.people.get(id)?.detail?.status ?? 0)
    .sort((a, b) => b - a);
  const top = all[Math.floor(all.length * rules.highShare)] ?? 0;
  active.society.highAt = Math.max(rules.high, top + 1);
}

/** The standing at which a resident counts as high at this site. */
const highAt = (content: SiteContent, active: ActiveSite): number =>
  active.society.highAt ?? content.society.status.high;

// ---- Crime ----

/**
 * A crime is done. Seen (or found out) it is judged next morning; else it goes unsolved. A known
 * offender costs a living victim their good opinion.
 */
export function reportCrime(
  env: SocialEnv,
  crime: Crime,
  offender: Person,
  victim: Person | null,
  eventId: Id,
  witnessed: boolean,
): void {
  const { society } = env.active;
  const rules = env.content.society;
  if (!witnessed && !streamFor(env.world, 'site.society').chance(rules.crime.foundOut)) {
    env.emit({
      type: rules.events.unsolved,
      place: env.label.cell,
      causes: [eventId],
      data: { site: env.label.name },
    });
    society.stats.unsolved += 1;
    return;
  }
  society.cases.push({
    crime,
    offender: offender.id,
    victim: victim?.id ?? null,
    eventId,
    day: env.day,
  });
  count(society.stats.crimes, crime);
  if (here(victim)) {
    remember(env, victim, rules.memoryOf.wronged, offender.id, eventId);
    shiftOpinion(env, victim, offender, rules.crime.wrongedOpinion, eventId, false);
  }
}

/** A brawl between two residents; both are hurt and it is reported as seen. */
function brawl(env: SocialEnv, a: Person, b: Person, causes: Id[]): SimEvent {
  const { content, world, active } = env;
  const rng = streamFor(world, 'site.society');
  const event = env.emit({
    type: content.society.events.brawl,
    actors: [a.id, b.id],
    place: env.label.cell,
    causes,
    data: { site: env.label.name },
  });
  for (const p of [a, b]) {
    const tier = rng.pick(content.society.crime.brawlWounds);
    woundPerson(world, content, active, p, tier, 'in a brawl', env.emit, env.label, event.id);
  }
  reportCrime(env, 'brawl', a, b, event.id, true);
  return event;
}

/**
 * An avenger's grudge may end in murder (a hot-tempered one with an old, bitter grudge) or a brawl.
 * Returns the event, or undefined for the spiteful act of social.ts. After a murder `target.died` is set.
 */
export function violentRevenge(
  env: SocialEnv,
  avenger: Person,
  target: Person,
  rel: Relationship,
): SimEvent | undefined {
  const { content, world, active } = env;
  const rules = content.society;
  const crime = rules.crime;
  const rng = streamFor(world, 'site.society');
  const grudgeEvent = rel.grudge?.eventId === undefined ? [] : [rel.grudge.eventId];
  if (
    avenger.traits.includes(crime.murderTrait) &&
    rel.grudge !== undefined &&
    env.day - rel.grudge.since >= crime.murderAfterDays &&
    rel.opinion <= crime.murderBelow &&
    rng.chance(crime.murderChance)
  ) {
    const event = env.emit({
      type: rules.events.murder,
      actors: [avenger.id, target.id],
      place: env.label.cell,
      causes: grudgeEvent,
      data: { site: env.label.name },
    });
    const how = { ...rules.deaths.murder, causes: [event.id] };
    killPerson(world, content, active, target, 'murder', undefined, env.emit, env.label, how);
    reportCrime(env, 'murder', avenger, target, event.id, true);
    return event;
  }
  const culture = content.cultures.find((c) => c.id === avenger.cultureId);
  let chance = crime.brawlShare;
  if (avenger.traits.includes(content.social.grudge.hotTrait)) chance *= crime.brawlHotMul;
  if ((culture?.values.war ?? 0) >= crime.brawlWarAt) chance *= 2;
  return rng.chance(chance) ? brawl(env, avenger, target, grudgeEvent) : undefined;
}

/** Residents of the afflicted person's family still at the site. */
const kinHere = (world: WorldState, p: Person): Person[] =>
  [...p.family.spouses, ...p.family.parents, ...p.family.children]
    .map((id) => world.people.get(id))
    .filter(here);

/** The hungry take food, or the seed corn, from bare or short stores. */
function pilfer(env: SocialEnv, culture: CultureDef | undefined): void {
  const { world, content, active } = env;
  const rules = content.society.crime;
  if (!(active.mealShare < 1 || foodMeals(active, content) < 1)) return;
  const rng = streamFor(world, 'site.society');
  const food = content.needs.find((n) => n.id === 'food');
  if (!food) return;
  const cause = active.shortMealsEvent ?? active.storesEmptyEvent;
  for (const id of active.residents) {
    const p = world.people.get(id);
    const detail = p?.detail;
    if (!p || !detail || detail.abed || detail.breakdown) continue;
    const race = content.races.find((r) => r.id === p.raceId)!;
    if (bandOfAge(race, ageOf(world, active, p)) === 'child') continue;
    if ((detail.needs[food.id] ?? 100) >= rules.pilferHungerBelow) continue;
    const own = content.cultures.find((c) => c.id === p.cultureId) ?? culture;
    let chance = rules.pilferChance * (1 - (own?.values.order ?? 0) / rules.orderDiv);
    for (const t of p.traits) chance *= rules.pilferTraits[t] ?? 1;
    if (!rng.chance(chance)) continue;
    // Stores are counted in items scaled by the followed share, like a meal.
    const meals = rules.pilferMeals * race.foodNeed * active.share;
    let what = 'food';
    let got = takeFood(active, content, meals, false).taken;
    if (got <= 0) {
      what = 'the seed corn';
      got = takeItem(active, SEED_ITEM, meals);
    }
    if (got <= 0) continue;
    detail.needs[food.id] = Math.min(100, (detail.needs[food.id] ?? 0) + (food.restore.steal ?? 0));
    const event = env.emit({
      type: content.society.events.pilfered,
      actors: [p.id],
      place: env.label.cell,
      causes: cause === null ? [] : [cause],
      data: { site: env.label.name, what },
    });
    reportCrime(env, 'theft', p, null, event.id, false);
  }
}

// ---- Judgement ----

/** The nearest other live site, preferring the same civ; null if there is none. */
export function refuge(world: WorldState, active: ActiveSite): Site | null {
  const from = world.sites.get(active.siteId);
  if (!from) return null;
  const width = world.params.width;
  let best: Site | null = null;
  let key: [number, number, number] = [2, 0, 0];
  for (const s of world.sites.values()) {
    if (s.id === from.id || s.ruinedYear !== undefined || !s.pop.some((b) => b.count > 0)) continue;
    const d = manhattan(
      s.cell % width,
      Math.floor(s.cell / width),
      from.cell % width,
      Math.floor(from.cell / width),
    );
    const k: [number, number, number] = [s.civId === from.civId ? 0 : 1, d, s.id];
    if (
      !best ||
      k[0] < key[0] ||
      (k[0] === key[0] && (k[1] < key[1] || (k[1] === key[1] && k[2] < key[2])))
    ) {
      best = s;
      key = k;
    }
  }
  return best;
}

/** Steps along the punishments, clamped to [none, top]. */
const step = (from: Punishment, by: number, top: Punishment): Punishment => {
  const at = clamp(PUNISHMENTS.indexOf(from) + by, 0, PUNISHMENTS.indexOf(top));
  return PUNISHMENTS[at]!;
};

/** The victim's amends, once a fine is paid or worked off. */
function amends(env: SocialEnv, offender: Person, victim: Person, cause: Id): void {
  env.emit({
    type: env.content.society.events.amendsMade,
    actors: [offender.id, victim.id],
    place: env.label.cell,
    causes: [cause],
    data: { site: env.label.name },
  });
  shiftOpinion(env, victim, offender, env.content.society.justice.amends, cause, false);
}

/** Moves people out of the watched site to another site's counts (they carry on there). */
export function relocate(env: SocialEnv, people: readonly Person[], dest: Site): void {
  const { world, content, active } = env;
  const gone = new Set(people.map((p) => p.id));
  for (const p of people) {
    const race = content.races.find((r) => r.id === p.raceId)!;
    const band = bandOfAge(race, ageOf(world, active, p));
    const key = `${p.raceId}|${p.cultureId}|${band}`;
    leave(env, p);
    delete p.detail;
    p.siteId = dest.id;
    active.popDelta[key] = (active.popDelta[key] ?? 0) - 1;
    const pop = dest.pop.find(
      (b) => b.raceId === p.raceId && b.cultureId === p.cultureId && b.band === band,
    );
    if (pop) pop.count += 1;
    else dest.pop.push({ raceId: p.raceId, cultureId: p.cultureId ?? '', band, count: 1 });
    active.society.exiles.push([p.id, dest.id]);
  }
  active.residents = active.residents.filter((id) => !gone.has(id));
  active.promoted = active.promoted.filter((id) => !gone.has(id));
  active.peopleVersion += 1;
  refreshWork(content, active);
}

/** Sends the offender (and the young children with no other parent here) to another site. */
function exile(env: SocialEnv, offender: Person, dest: Site, judged: SimEvent): void {
  const { world, content, active } = env;
  const leavers = [
    offender,
    ...offender.family.children
      .map((id) => world.people.get(id))
      .filter(here)
      .filter(
        (c) =>
          ageOf(world, active, c) < content.races.find((r) => r.id === c.raceId)!.maturityYears &&
          c.family.parents.every((id) => id === offender.id || !here(world.people.get(id))),
      ),
  ];
  const gone = new Set(leavers.map((p) => p.id));
  const kin = kinHere(world, offender).filter((q) => !gone.has(q.id));
  relocate(env, leavers, dest);
  env.emit({
    type: content.society.events.exiled,
    actors: leavers.map((p) => p.id),
    place: env.label.cell,
    causes: [judged.id],
    data: { site: env.label.name, dest: dest.name },
  });
  for (const q of kin) remember(env, q, content.society.memoryOf.exiledKin, offender.id, judged.id);
}

/** Judges one case by the site's law; returns nothing when the offender is dead or gone. */
function judge(
  env: SocialEnv,
  law: JusticeDef,
  culture: CultureDef | undefined,
  c: CrimeCase,
): void {
  const { world, content, active, day } = env;
  const rules = content.society;
  const offender = world.people.get(c.offender);
  if (!here(offender)) return;
  const detail = offender.detail!;
  const victimPerson = c.victim === null ? undefined : world.people.get(c.victim);
  const victim = here(victimPerson) ? victimPerson : null;
  const high = highAt(content, active);
  let by = 0;
  if (detail.lastOffence !== undefined && day - detail.lastOffence <= rules.justice.repeatDays)
    by += 1;
  if ((victimPerson?.detail?.status ?? 0) >= high) by += 1;
  let punishment = step(law.punish[c.crime], by, law.max);
  const base = PUNISHMENTS.indexOf(law.punish[c.crime]);
  if (
    (detail.status ?? 0) >= high &&
    (culture?.values.order ?? 0) < rules.justice.lenientOrderBelow &&
    base > PUNISHMENTS.indexOf('fine')
  ) {
    punishment =
      PUNISHMENTS[Math.max(PUNISHMENTS.indexOf('fine'), PUNISHMENTS.indexOf(punishment) - 1)]!;
  }
  const race = content.races.find((r) => r.id === offender.raceId)!;
  if (bandOfAge(race, ageOf(world, active, offender)) === 'child') {
    punishment = step(punishment, 0, rules.justice.childMax);
  }
  // With nowhere to go, an exile works off the wrong instead.
  const dest = punishment === 'exile' ? refuge(world, active) : null;
  if (punishment === 'exile' && !dest) punishment = 'labour';
  const judged = env.emit({
    type: rules.events.judged,
    actors: victim ? [offender.id, victim.id] : [offender.id],
    place: env.label.cell,
    causes: [c.eventId],
    data: {
      site: env.label.name,
      punishment: rules.justice.words[punishment],
      crime: rules.justice.crimeWords[c.crime],
      law: law.phrase,
    },
  });
  count(active.society.stats.punishments, punishment);
  detail.lastOffence = day;
  detail.shame = (detail.shame ?? 0) + (rules.status.shame[punishment] ?? 0);
  // Everyone sees hard punishment done.
  if (punishment === 'labour' || punishment === 'exile' || punishment === 'execution') {
    for (const id of active.residents) {
      const q = world.people.get(id);
      if (q && q !== offender) remember(env, q, rules.memoryOf.sawJustice, offender.id, judged.id);
    }
  }
  if (punishment === 'fine') {
    const item = heldItems(world, content, offender.id)[0];
    if (item && victim) {
      transferItem(content, active, item.item, victim.id, judged.id);
      amends(env, offender, victim, judged.id);
    } else {
      detail.sentence = {
        kind: 'fine',
        untilDay: day + rules.justice.fineDays[c.crime],
        eventId: judged.id,
        victim: victim?.id ?? null,
      };
    }
    remember(env, offender, rules.memoryOf.shamed, undefined, judged.id);
  } else if (punishment === 'labour') {
    detail.sentence = {
      kind: 'labour',
      untilDay: day + rules.justice.labourDays[c.crime],
      eventId: judged.id,
      victim: victim?.id ?? null,
    };
    remember(env, offender, rules.memoryOf.sentenced, undefined, judged.id);
  } else if (punishment === 'exile' || punishment === 'execution') {
    const kin = kinHere(world, offender);
    if (punishment === 'exile') exile(env, offender, dest!, judged);
    else {
      const executed = env.emit({
        type: rules.events.executed,
        actors: [offender.id],
        place: env.label.cell,
        causes: [judged.id],
        data: { site: env.label.name, law: law.phrase },
      });
      const how = { ...rules.deaths.execution, causes: [executed.id] };
      killPerson(
        world,
        content,
        active,
        offender,
        'execution',
        undefined,
        env.emit,
        env.label,
        how,
      );
      for (const q of kin) remember(env, q, rules.memoryOf.executedKin, offender.id, executed.id);
    }
    // Kin of the punished hold it against the one who brought the charge.
    // Only those still here: kin (or the victim) may have gone into exile with the offender.
    if (here(victim)) {
      for (const q of kin) if (here(q) && q.id !== victim.id) startGrudge(env, q, victim);
    }
  }
}

// ---- Funerals and festivals ----

/** Meals (stock items) these people eat in one day, times `days`. */
function mealsFor(
  content: SiteContent,
  active: ActiveSite,
  people: readonly Person[],
  days: number,
): number {
  let need = 0;
  for (const p of people) need += content.races.find((r) => r.id === p.raceId)!.foodNeed;
  return need * active.share * days;
}

/** True when the stores hold more than `days` days of food for everyone. */
function wellStocked(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  days: number,
): boolean {
  const all = active.residents.map((id) => world.people.get(id)).filter(here);
  return foodMeals(active, content) > mealsFor(content, active, all, days);
}

function holdFuneral(env: SocialEnv, dead: Person, deathEvent: Id): void {
  const { world, content, active } = env;
  const rules = content.society;
  const culture = content.cultures.find((c) => c.id === dead.cultureId);
  const rite = rules.funerals.find((f) => f.religionId === culture?.religion.id);
  let phrase = rules.funeral.plainRite;
  const cost = Object.entries(rite?.cost ?? {});
  if (rite && cost.every(([id, n]) => itemCount(active, id) >= n)) {
    for (const [id, n] of cost) takeItem(active, id, n);
    phrase = rite.phrase;
  }
  const people = active.residents.map((id) => world.people.get(id)).filter(here);
  const mourners = new Set<Id>();
  if ((dead.detail?.status ?? 0) >= highAt(content, active))
    for (const p of people) mourners.add(p.id);
  else {
    const house = active.households.get(dead.family.householdId ?? -1);
    for (const id of house?.members ?? []) mourners.add(id);
    for (const p of people) {
      const tie =
        dead.family.parents.includes(p.id) ||
        dead.family.children.includes(p.id) ||
        dead.family.spouses.includes(p.id) ||
        p.family.parents.some((id) => dead.family.parents.includes(id)) ||
        dead.detail?.relationships.get(p.id)?.labels.includes('friend');
      if (tie) mourners.add(p.id);
    }
  }
  const who = people.filter((p) => mourners.has(p.id));
  const event = env.emit({
    type: rules.events.funeral,
    actors: [dead.id],
    place: env.label.cell,
    causes: [deathEvent],
    data: { site: env.label.name, rite: phrase, mourners: String(who.length) },
  });
  active.society.stats.funerals += 1;
  if (wellStocked(world, content, active, rules.funeral.feastDaysAbove)) {
    takeFood(active, content, mealsFor(content, active, who, rules.funeral.feastMeals), true);
  }
  for (const p of who) remember(env, p, rules.memoryOf.mourned, dead.id, event.id);
}

function holdFestival(env: SocialEnv, festival: FestivalDef): void {
  const { world, content, active } = env;
  const rules = content.society;
  const people = active.residents.map((id) => world.people.get(id)).filter(here);
  const event = env.emit({
    type: rules.events.festival,
    place: env.label.cell,
    data: { site: env.label.name, festival: festival.name, rite: festival.rite },
  });
  active.society.stats.festivals += 1;
  const feast = wellStocked(world, content, active, rules.festival.feastDaysAbove);
  if (feast)
    takeFood(active, content, mealsFor(content, active, people, rules.festival.feastMeals), true);
  const type = feast ? rules.memoryOf.feasted : rules.memoryOf.leanFeast;
  for (const p of people) remember(env, p, type, undefined, event.id);
  // Old quarrels flare once, a pair at a time.
  const rng = streamFor(world, 'site.society');
  const seen = new Set<string>();
  for (const a of people) {
    for (const [id, rel] of [...a.detail!.relationships]) {
      const b = world.people.get(id);
      if (!here(b) || !(rel.labels.includes('rival') || rel.labels.includes('enemy'))) continue;
      const key = a.id < id ? `${a.id}.${id}` : `${id}.${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (rng.chance(rules.crime.festivalBrawl)) brawl(env, a, b, [event.id]);
    }
  }
}

// ---- The morning ----

/** Block 0 of each day, after the day's health: standing, pilfering, judgement, rites, sentences. */
export function runSocietyMorning(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const day = world.day;
  const env: SocialEnv = { world, content, active, emit, label, day };
  const { society } = active;
  const memo = memoOf(world, content, active);
  refreshStatus(world, content, active);
  pilfer(env, memo.culture);

  // Cases from before today (a theft found out this morning waits for tomorrow).
  const law = lawOf(content, memo.culture);
  const due = society.cases.filter((c) => c.day < day);
  society.cases = society.cases.filter((c) => c.day >= day);
  if (law) for (const c of due) judge(env, law, memo.culture, c);

  const funerals = society.funerals.filter((f) => f.day <= day);
  society.funerals = society.funerals.filter((f) => f.day > day);
  for (const f of funerals) {
    const dead = world.people.get(f.dead);
    if (dead) holdFuneral(env, dead, f.deathEvent);
  }
  if (memo.festival) holdFestival(env, memo.festival);

  // Sentences that run out today: a fine worked off is amends to the wronged.
  for (const id of active.residents) {
    const offender = world.people.get(id);
    const sentence = offender?.detail?.sentence;
    if (!offender || !sentence || sentence.untilDay > day) continue;
    offender.detail!.sentence = undefined;
    const victim = sentence.victim === null ? undefined : world.people.get(sentence.victim);
    if (sentence.kind === 'fine' && here(victim)) amends(env, offender, victim, sentence.eventId);
  }
}

/** Block 0, after the steward: those serving a sentence work at the sentence's job today. */
export function serveSentences(
  world: WorldState,
  content: SiteContent,
  workers: readonly { person: Person; band: Band }[],
): void {
  const job = content.jobs.find((j) => j.id === content.society.justice.labourJob);
  if (!job) return;
  for (const w of workers) {
    const detail = w.person.detail;
    if (!detail?.sentence || detail.sentence.untilDay <= world.day || detail.abed) continue;
    const kind = detail.breakdown?.kind;
    if (kind === 'despair' || kind === 'wandering') continue;
    if (canDo(w.person, job, w.band)) detail.jobId = job.id;
  }
}
