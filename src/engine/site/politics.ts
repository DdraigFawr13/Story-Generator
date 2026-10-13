// Thin politics and trade at the watched site (M3.10). The site has one leader: the civ's ruler
// where they live, else a local head named on the first morning (a notable of the civ, else the
// people's choice by standing). When the leader dies or leaves, the culture's succession rule
// (history's rules, narrowed to the adults at the site) picks the heir; close kin may quarrel over
// it, and the loser holds a grudge. The site is never left without a leader while anyone grown
// lives there. A ruler's heir at the capital becomes the civ's ruler and stays in the world.
//
// Caravans come only from the site's trade partners: live sites that traded with it in the last
// decades of history (the playback's trade rows), and whose civ holds no grievance either way.
// Each partner sends one caravan a year, in a season and on a day spread by site, partner and
// year, so caravans never come everywhere at once. It brings news of home (a history event there
// not told before), stays a few days, and swaps goods by the history trade rule on the goods
// vector: each side's surplus over a year's need goes to the other's shortage, a share per visit.
// Randomness is the `site.politics` stream; people in id order.

import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '../core/clock';
import type { CultureDef } from '../core/content-types';
import { hashString, streamFor } from '../core/rng';
import {
  GOODS,
  type ActiveSite,
  type Civ,
  type GoodId,
  type Id,
  type Person,
  type Site,
  type SitePolitics,
  type WorldState,
} from '../core/types';
import { bandCount, siteNeed, totalPop } from '../history/pop';
import { eventVars, fillTemplate, grouped } from '../narrative/render';
import { type SiteLabel } from './build';
import { bandOfAge, type SiteContent } from './defs';
import { envOf, shiftOpinion, startGrudge } from './social';
import { addItem, goodAmount, itemCount, SEED_ITEM, takeItem } from './stock';
import { histYear, type Emit } from './threat-common';

export function blankPolitics(): SitePolitics {
  return {
    leaderId: null,
    since: 0,
    leaderEvent: null,
    partners: [],
    visits: [],
    plannedYear: -1,
    caravan: null,
    told: [],
    stats: { successions: 0, disputes: 0, caravans: 0, itemsIn: {}, itemsOut: {} },
  };
}

// ---- Small lookups ----

const here = (p: Person | undefined): p is Person =>
  p !== undefined && p.died === undefined && p.detail !== undefined;
const ageOf = (world: WorldState, active: ActiveSite, p: Person) =>
  histYear(world, active) - p.born;
const raceOf = (content: SiteContent, p: Person) => content.races.find((r) => r.id === p.raceId)!;
const isGrown = (world: WorldState, content: SiteContent, active: ActiveSite, p: Person) =>
  ageOf(world, active, p) >= raceOf(content, p).maturityYears;
const eldestFirst = (a: Person, b: Person) => a.born - b.born || a.id - b.id;
const charisma = (p: Person) => p.attributes.charisma;

function residentsHere(world: WorldState, active: ActiveSite): Person[] {
  return active.residents.map((id) => world.people.get(id)).filter(here);
}

const civOf = (world: WorldState, site: Site | undefined): Civ | undefined =>
  site?.civId == null ? undefined : world.civs.get(site.civId);

/** The site's culture: its civ's, else the most common among the residents. */
function siteCulture(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): CultureDef | undefined {
  const civ = civOf(world, world.sites.get(active.siteId));
  let id = civ?.cultureId ?? null;
  if (id === null) {
    const counts = new Map<string, number>();
    for (const p of residentsHere(world, active)) {
      if (p.cultureId) counts.set(p.cultureId, (counts.get(p.cultureId) ?? 0) + 1);
    }
    let best = 0;
    for (const [c, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (n > best) [id, best] = [c, n];
    }
  }
  return content.cultures.find((c) => c.id === id);
}

/** The leader's title: the ruler's where the civ's ruler leads, else the culture's local head. */
export function leaderTitle(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  leader: Person,
): string {
  const rules = content.politics;
  const civ = civOf(world, world.sites.get(active.siteId));
  if (civ && civ.rulerId === leader.id) return rules.rulerTitle;
  const government = siteCulture(world, content, active)?.government ?? '';
  return rules.leaderTitles[government] ?? rules.leaderTitle;
}

// ---- The leader ----

/** The adult the people would choose: one of the site's own culture first, then highest standing, fame, age. */
function peoplesChoice(adults: Person[], cultureId: string | undefined): Person | undefined {
  const own = (p: Person) => (p.cultureId === cultureId ? 1 : 0);
  return [...adults].sort(
    (a, b) =>
      own(b) - own(a) ||
      (b.detail!.status ?? 0) - (a.detail!.status ?? 0) ||
      b.fame - a.fame ||
      eldestFirst(a, b),
  )[0];
}

/** The leader on the first morning: the civ's ruler if here, else a notable of the civ, else the people's choice. */
function firstLeader(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): Person | undefined {
  const civ = civOf(world, world.sites.get(active.siteId));
  const people = residentsHere(world, active);
  const ruler = people.find((p) => civ && p.id === civ.rulerId);
  if (ruler) return ruler;
  const adults = people.filter((p) => isGrown(world, content, active, p));
  const notables = adults
    .filter((p) => p.title !== undefined && p.title !== 'kin' && p.civId === civ?.id)
    .sort((a, b) => b.fame - a.fame || a.id - b.id);
  const culture = siteCulture(world, content, active)?.id;
  return notables[0] ?? peoplesChoice(adults, culture) ?? [...people].sort(eldestFirst)[0];
}

/**
 * The heir by the culture's rule among the grown people at the site, and a rival claimant when the
 * choice is contested (history's `chooseHeir`, narrowed to the site; a child never takes the seat).
 */
export function siteHeir(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  dead: Person,
  rule: string | undefined,
): { heir?: Person | undefined; challenger?: Person | undefined } {
  const margin = content.politics.succession.disputeMargin;
  const adults = residentsHere(world, active).filter(
    (p) => p.id !== dead.id && isGrown(world, content, active, p),
  );
  const byId = new Map(adults.map((p) => [p.id, p]));
  const pick = (ids: readonly Id[]) =>
    ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).sort(eldestFirst);
  const children = pick(dead.family.children);
  const sons = children.filter((p) => p.sex === 'm');
  const siblings = adults
    .filter((p) => p.family.parents.some((id) => dead.family.parents.includes(id)))
    .sort(eldestFirst);
  const siblingIds = new Set(siblings.map((p) => p.id));
  const nieces = adults
    .filter((p) => p.family.parents.some((id) => siblingIds.has(id)))
    .sort(eldestFirst);
  const kin = [...siblings, ...nieces];

  if (rule === 'kin-elected') {
    const score = (p: Person) => p.fame + charisma(p) * 2;
    const pool = [...new Set([...children, ...siblings, ...nieces, ...pick(dead.family.spouses)])];
    pool.sort((a, b) => score(b) - score(a) || a.id - b.id);
    const [top, second] = pool;
    const contested = top && second && score(top) - score(second) <= margin;
    return { heir: top, challenger: contested ? second : undefined };
  }
  if (rule === 'elder-council') {
    const age = (p: Person) => ageOf(world, active, p);
    return {
      heir: [...adults].sort((a, b) => age(b) + b.fame - (age(a) + a.fame) || a.id - b.id)[0],
    };
  }
  if (rule === 'brother-first-gathering') {
    const brothers = siblings.filter((p) => p.sex === 'm');
    // A grown son has a claim against his uncle.
    return {
      heir: brothers[0] ?? sons[0] ?? kin[0],
      challenger: brothers[0] ? sons[0] : undefined,
    };
  }
  if (rule === 'eldest-child') return { heir: children[0] ?? kin[0] };
  return { heir: sons[0] ?? children[0] ?? kin[0] };
}

/** The latest event naming `p` as an actor, for the cause of a leader's going (a death or an exile). */
function lastEventOf(world: WorldState, p: Person): Id | undefined {
  if (p.deathEvent !== undefined) return p.deathEvent;
  for (let i = world.events.length - 1, n = 0; i >= 0 && n < 5000; i -= 1, n += 1) {
    if (world.events[i]!.actors.includes(p.id)) return world.events[i]!.id;
  }
  return undefined;
}

/** The leader is gone: the culture's rule picks the heir, a quarrel may overturn it, or the people choose. */
function succeed(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  prior: Person,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.politics.succession;
  const pol = active.politics;
  const rng = streamFor(world, 'site.politics');
  const culture = siteCulture(world, content, active);
  const gone = lastEventOf(world, prior);
  const causes: Id[] = gone === undefined ? [] : [gone];
  const { heir: chosen, challenger } = siteHeir(world, content, active, prior, culture?.succession);
  let heir = chosen;
  let phrase = culture
    ? (content.notables.successionPhrases[culture.succession] ?? rules.peoplePhrase)
    : rules.peoplePhrase;
  if (heir && challenger && challenger.id !== heir.id && rng.chance(rules.disputeChance)) {
    const score = (p: Person) => p.fame + charisma(p) + rng.between(0, rules.disputeLuck);
    const heirScore = score(heir);
    const challengerScore = score(challenger);
    const [winner, loser] = challengerScore > heirScore ? [challenger, heir] : [heir, challenger];
    const dispute = emit({
      type: content.politics.events.disputed,
      actors: [heir.id, challenger.id],
      place: label.cell,
      causes,
      data: { site: label.name, prior: prior.name, winner: winner.name, loser: loser.name },
    });
    const env = envOf(world, content, active);
    shiftOpinion(env, loser, winner, rules.loserOpinion, dispute.id, false);
    startGrudge(env, loser, winner);
    pol.stats.disputes += 1;
    causes.push(dispute.id);
    heir = winner;
  }
  if (!heir) {
    const people = residentsHere(world, active).filter((p) => p.id !== prior.id);
    heir =
      peoplesChoice(
        people.filter((p) => isGrown(world, content, active, p)),
        culture?.id,
      ) ?? [...people].sort(eldestFirst)[0];
    phrase = rules.peoplePhrase;
  }
  if (!heir) {
    pol.leaderId = null;
    return;
  }
  // The ruler's heir at the capital takes the civ's seat too, and stays in the world on leaving.
  const civ = civOf(world, world.sites.get(active.siteId));
  if (civ && civ.rulerId === prior.id && civ.fell === undefined) {
    civ.rulerId = heir.id;
    heir.title = 'ruler';
    heir.civId = civ.id;
    heir.siteId = active.siteId;
    heir.fame = Math.max(heir.fame, content.notables.fame.ruler);
    active.promoted = active.promoted.filter((id) => id !== heir!.id);
    active.peopleVersion += 1;
  }
  setLeader(world, active, heir);
  const event = emit({
    type: content.politics.events.succeeded,
    actors: [heir.id, prior.id],
    place: label.cell,
    causes,
    data: {
      site: label.name,
      title: leaderTitle(world, content, active, heir),
      rule: phrase,
    },
  });
  pol.leaderEvent = event.id;
  pol.stats.successions += 1;
}

function setLeader(world: WorldState, active: ActiveSite, leader: Person): void {
  active.politics.leaderId = leader.id;
  active.politics.since = world.day;
}

/** Names the first leader, or a successor when the leader has died or left (end of every block). */
export function keepLeader(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const pol = active.politics;
  if (pol.leaderId === null) {
    if (pol.leaderEvent !== null) return;
    const leader = firstLeader(world, content, active);
    if (!leader) return;
    setLeader(world, active, leader);
    pol.leaderEvent = emit({
      type: content.politics.events.leaderNamed,
      actors: [leader.id],
      place: label.cell,
      data: { site: label.name, title: leaderTitle(world, content, active, leader) },
    }).id;
    return;
  }
  const leader = world.people.get(pol.leaderId);
  if (here(leader) && active.residents.includes(leader.id)) return;
  if (leader) succeed(world, content, active, leader, emit, label);
}

// ---- Caravans ----

/** A world good's yearly need for a set of people (history's `goodNeed` and `siteNeed`). */
function yearlyNeed(
  content: SiteContent,
  good: GoodId,
  people: { adults: number; all: number; food: number },
): number {
  if (good === 'food') return people.food;
  const per = content.history.need[good];
  return (good === 'salt' ? people.all : people.adults) * per;
}

/** Grown people, everyone and food need (person-years) among the followed residents. */
function followedNeeds(world: WorldState, content: SiteContent, active: ActiveSite) {
  let adults = 0;
  let food = 0;
  const people = residentsHere(world, active);
  for (const p of people) {
    const race = raceOf(content, p);
    food += race.foodNeed;
    if (bandOfAge(race, ageOf(world, active, p)) === 'adult') adults += 1;
  }
  return { adults, all: people.length, food };
}

/**
 * Live sites that traded with this one in the last `recentYears` of history, by the value traded,
 * strongest first, leaving out civs with a grievance either way; at most `partners` of them.
 */
export function tradePartners(
  world: WorldState,
  content: SiteContent,
  site: Site,
  endYear: number,
): Id[] {
  const rows = world.playback?.trade;
  const rules = content.politics.caravans;
  if (!rows) return [];
  const value = new Map<Id, number>();
  for (let i = 0; i + 3 < rows.length; i += 4) {
    if (rows[i]! < endYear - rules.recentYears) continue;
    const a = rows[i + 1]!;
    const b = rows[i + 2]!;
    const other = a === site.id ? b : b === site.id ? a : 0;
    if (other) value.set(other, (value.get(other) ?? 0) + rows[i + 3]!);
  }
  const mine = civOf(world, site);
  const minGrievance = content.threats.raids.minGrievance;
  const hostile = (from: Civ | undefined, to: Civ | undefined) =>
    from !== undefined && to !== undefined && (from.grievances.get(to.id) ?? 0) >= minGrievance;
  return [...value]
    .filter(([id]) => {
      const other = world.sites.get(id);
      if (!other || other.ruinedYear !== undefined) return false;
      const theirs = civOf(world, other);
      return !hostile(theirs, mine) && !hostile(mine, theirs);
    })
    .sort(([a, va], [b, vb]) => vb - va || a - b)
    .slice(0, rules.partners)
    .map(([id]) => id);
}

/** The day in calendar `year` a partner's caravan comes: a season and day spread by site, partner and year. */
export function caravanDay(
  content: SiteContent,
  siteId: Id,
  partner: Id,
  yearStart: number,
  year: number,
): number {
  const rules = content.politics.caravans;
  const season = rules.seasons[hashString(`${siteId}:${partner}`) % rules.seasons.length]!;
  const offset = hashString(`${siteId}:${partner}:${year}`) % (DAYS_PER_SEASON - rules.stayDays);
  return yearStart + season * DAYS_PER_SEASON + offset;
}

/** At embark and each new year: the year's caravans still to come, soonest first. */
function planVisits(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const pol = active.politics;
  const year = Math.floor(world.day / DAYS_PER_YEAR);
  if (pol.plannedYear === year) return;
  pol.plannedYear = year;
  const yearStart = year * DAYS_PER_YEAR;
  for (const partner of pol.partners) {
    const day = caravanDay(content, active.siteId, partner, yearStart, year);
    if (day >= world.day) pol.visits.push([partner, day]);
  }
  pol.visits.sort(([a, da], [b, db]) => da - db || a - b);
}

/** The newest history event at the partner not yet told, within `newsYears`, as a short phrase. */
function newsOf(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  partner: Site,
): { id: Id; text: string; ago: number } | undefined {
  const rules = content.politics.caravans;
  const types = new Map(content.eventTypes.map((d) => [d.id, d]));
  const now = histYear(world, active);
  const told = new Set(active.politics.told);
  const nameOf = (id: Id) => world.people.get(id)?.name ?? 'someone';
  for (let i = world.events.length - 1; i >= 0; i -= 1) {
    const e = world.events[i]!;
    if (e.day >= active.enteredDay) continue;
    const year = Math.floor(e.day / DAYS_PER_YEAR);
    if (now - year > rules.newsYears) break;
    if (told.has(e.id) || e.importance < rules.newsImportance) continue;
    if (e.place !== partner.cell && e.data['site'] !== partner.name) continue;
    const def = types.get(e.type);
    if (!def?.title) continue;
    try {
      const text = fillTemplate(def.title, eventVars(e, nameOf, def));
      // Mid-sentence: "the plague at …", but a title that opens on a name keeps its capital.
      const names = [
        ...e.actors.map(nameOf),
        ...Object.keys(def.links ?? {}).map((key) => String(e.data[key] ?? '')),
      ].filter((n) => n !== '');
      const named = names.some((n) => text.startsWith(n));
      return {
        id: e.id,
        text: named ? text : text.charAt(0).toLowerCase() + text.slice(1),
        ago: now - year,
      };
    } catch {
      // A title whose key this event lacks says nothing true; look further back.
    }
  }
  return undefined;
}

const agoText = (years: number) =>
  years <= 0 ? 'this year' : years === 1 ? 'last year' : `${years} years ago`;

/** Units of each good moving each way between the followed residents and the partner (history's rule, a share of each gap). */
export function caravanTrade(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  partner: Site,
): { into: Record<GoodId, number>; out: Record<GoodId, number> } {
  const rules = content.politics.caravans;
  const keep = rules.keepYears;
  const mine = followedNeeds(world, content, active);
  const races = new Map(content.races.map((r) => [r.id, r]));
  const theirs = {
    adults: bandCount(partner, 'adult'),
    all: totalPop(partner),
    food: siteNeed(partner, races),
  };
  const into = {} as Record<GoodId, number>;
  const out = {} as Record<GoodId, number>;
  for (const good of GOODS) {
    const have = goodAmount(active, content, good);
    into[good] = 0;
    out[good] = 0;
    if (good === 'luxury') {
      // No need: the richer per head sends a share of half the gap, as history does. Only trade
      // goods count here (wares), not the world items, which are never sold.
      const ratio = mine.all / Math.max(1, theirs.all);
      let wares = 0;
      for (const id of rules.carry[good] ?? [])
        wares += itemCount(active, id) * itemPer(content, id);
      const gap = wares - partner.goods.luxury * ratio;
      const amount = (Math.abs(gap) / 2) * content.history.luxuryTradeShare * rules.share;
      if (gap > 0) out[good] = amount;
      else into[good] = Math.min(amount, partner.goods.luxury);
      continue;
    }
    const myNeed = yearlyNeed(content, good, mine) * keep;
    const theirNeed = yearlyNeed(content, good, theirs) * keep;
    const theirSpare = partner.goods[good] - theirNeed;
    const mySpare = have - myNeed;
    into[good] = Math.max(0, Math.min(theirSpare, myNeed - have) * rules.share);
    out[good] = Math.max(0, Math.min(mySpare, theirNeed - partner.goods[good]) * rules.share);
  }
  return { into, out };
}

const itemPer = (content: SiteContent, id: string) =>
  content.items.find((i) => i.id === id)?.per ?? 1;

/** Swaps the goods, moves them on the partner's counts and both sites' wealth; returns the item lines. */
function swapGoods(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  partner: Site,
): { took: string[]; left: string[] } {
  const rules = content.politics.caravans;
  const site = world.sites.get(active.siteId);
  const { into, out } = caravanTrade(world, content, active, partner);
  const took: string[] = [];
  const left: string[] = [];
  const stats = active.politics.stats;
  const name = (id: string) => content.items.find((i) => i.id === id)?.name ?? id;
  for (const good of GOODS) {
    const carry = rules.carry[good] ?? [];
    const first = carry[0];
    if (!first) continue;
    let value = 0;
    // Brought: the good's first item.
    const brought = Math.floor(into[good] / itemPer(content, first));
    if (brought >= rules.minItems) {
      addItem(active, first, brought);
      const amount = brought * itemPer(content, first);
      partner.goods[good] = Math.max(0, partner.goods[good] - amount);
      value += amount;
      stats.itemsIn[first] = (stats.itemsIn[first] ?? 0) + brought;
      left.push(`${grouped(brought)} ${name(first)}`);
    }
    // Taken: the items carrying the good in order, never the seed corn.
    let owed = out[good];
    let goneOut = 0;
    const lines: string[] = [];
    for (const id of carry) {
      const per = itemPer(content, id);
      const spare =
        id === SEED_ITEM ? itemCount(active, id) - active.harvest.seedKept : itemCount(active, id);
      const want = Math.floor(Math.min(owed / per, Math.max(0, spare)));
      if (want < rules.minItems) continue;
      const got = takeItem(active, id, want);
      owed -= got * per;
      goneOut += got * per;
      stats.itemsOut[id] = (stats.itemsOut[id] ?? 0) + got;
      lines.push(`${grouped(Math.round(got))} ${name(id)}`);
    }
    if (goneOut > 0) {
      partner.goods[good] += goneOut;
      value += goneOut;
      took.push(...lines);
    }
    const worth = value * content.history.goodValue[good];
    partner.wealth += worth;
    if (site) site.wealth += worth;
  }
  return { took, left };
}

const listText = (lines: string[]) =>
  lines.length === 0
    ? 'nothing'
    : lines.length === 1
      ? lines[0]!
      : `${lines.slice(0, -1).join(', ')} and ${lines[lines.length - 1]}`;

/** Caravans: plan the year, turn one back while a threat is here, greet one, and trade as it leaves. */
function runCaravans(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.politics.caravans;
  const events = content.politics.events;
  const pol = active.politics;
  planVisits(world, content, active);
  const caravan = pol.caravan;
  if (caravan && world.day >= caravan.leaves) {
    const partner = world.sites.get(caravan.from);
    pol.caravan = null;
    if (!partner) return;
    const { took, left } = swapGoods(world, content, active, partner);
    emit({
      type:
        took.length > 0 && left.length > 0
          ? events.caravanTraded
          : took.length > 0
            ? events.caravanSold
            : left.length > 0
              ? events.caravanBought
              : events.caravanNothing,
      place: label.cell,
      causes: [caravan.event],
      data: { site: label.name, from: partner.name, took: listText(took), left: listText(left) },
    });
    return;
  }
  const next = pol.visits[0];
  if (caravan || !next || next[1] > world.day) return;
  const partner = world.sites.get(next[0]);
  if (!partner) {
    pol.visits.shift();
    return;
  }
  if (active.threat) {
    next[1] = world.day + rules.waitDays;
    emit({
      type: events.caravanWaits,
      place: label.cell,
      causes: active.threat.signEvent === undefined ? [] : [active.threat.signEvent],
      data: { site: label.name, from: partner.name },
    });
    return;
  }
  pol.visits.shift();
  const host = pol.leaderId === null ? [] : [pol.leaderId];
  const news = newsOf(world, content, active, partner);
  if (news) pol.told.push(news.id);
  const arrived = emit({
    type: news ? events.caravanArrived : events.caravanQuiet,
    actors: host,
    place: label.cell,
    causes: news ? [news.id] : [],
    data: news
      ? { site: label.name, from: partner.name, news: news.text, ago: agoText(news.ago) }
      : { site: label.name, from: partner.name },
  });
  pol.caravan = {
    from: partner.id,
    arrived: world.day,
    leaves: world.day + rules.stayDays,
    event: arrived.id,
  };
  pol.stats.caravans += 1;
}

// ---- The day ----

/** At embark: the trade partners whose caravans may come. */
export function initPolitics(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const site = world.sites.get(active.siteId);
  if (site) active.politics.partners = tradePartners(world, content, site, histYear(world, active));
}

/** Dawn (after health, society and threats): the caravans. The leader is kept at every block's end. */
export function runPoliticsDay(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  runCaravans(world, content, active, emit, label);
}

/** The site's leader, if any (never none while a grown resident lives). */
export function leaderOf(world: WorldState, active: ActiveSite): Person | undefined {
  const id = active.politics.leaderId;
  return id === null ? undefined : world.people.get(id);
}
