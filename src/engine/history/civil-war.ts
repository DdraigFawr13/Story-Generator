// Succession wars and dynasties: a claimant beaten in a disputed succession may refuse to yield
// and raise the towns nearest their own seat as a realm of their own. The two halves fight like
// any war, the stronger side marching each year; whichever takes the other's seat reunites the
// realm (the claimant on the throne, or the revolt crushed), and a war that ends undecided leaves
// the realm split in two for good. Far towns use the turmoil to break away (city-states.ts).

import type { Civ, Id, Person, Site } from '../core/types';
import { swearPact } from './city-states';
import { killNotable, rulerOf, seatHouse } from './notables';
import { isAdult, livingList, livingPerson } from './people';
import { bandCount, totalPop } from './pop';
import { cellDistance } from './settle';
import {
  addGrievance,
  civilWarOf,
  cultureOf,
  liveSites,
  type Claim,
  type HistoryRun,
  type War,
} from './state';

const charisma = (person: Person | undefined) =>
  person ? person.fame + person.attributes.charisma : 0;

const spanOf = (run: HistoryRun, years: number) =>
  years <= 1
    ? run.rules.civilWar.phrases.oneYear
    : run.rules.civilWar.phrases.years.replace('{n}', String(years));

function civSites(run: HistoryRun, civ: Civ): Site[] {
  return liveSites(run).filter((s) => s.civId === civ.id);
}

function adultsOf(sites: readonly Site[]): number {
  return sites.reduce((n, s) => n + bandCount(s, 'adult'), 0);
}

/** Yearly, after the deaths: each beaten claimant of the year may rise against the new ruler. */
export function runCivilWars(run: HistoryRun): void {
  const rules = run.rules.civilWar;
  const claims = run.claims;
  run.claims = [];
  for (const claim of claims) {
    const civ = run.world.civs.get(claim.civ);
    if (!civ || civ.fell !== undefined || civ.free || civilWarOf(run, civ.id)) continue;
    const claimant = livingPerson(run, claim.claimant);
    if (!claimant || claimant.civId !== civ.id || !isAdult(run, claimant)) continue;
    if (claimant.id === civ.rulerId) continue;
    const sites = civSites(run, civ);
    if (sites.length < rules.minSites) continue;
    const warlike = (cultureOf(run, civ)?.values.war ?? 0) / 10;
    if (!run.rng.civilWar.chance(rules.chance * warlike)) continue;
    rise(run, civ, claimant, claim, sites);
  }
}

/** The claimant's seat: their own town if it is not the capital, else the largest far town. */
function seatOf(run: HistoryRun, civ: Civ, claimant: Person, sites: readonly Site[]): Site {
  const { width } = run.cells;
  const capital = run.world.sites.get(civ.capital)!;
  const others = sites.filter((s) => s.id !== civ.capital);
  const own = others.find((s) => s.id === claimant.siteId);
  if (own) return own;
  let best = others[0]!;
  let bestScore = -1;
  for (const site of others) {
    const score = totalPop(site) * cellDistance(width, site.cell, capital.cell);
    if (score > bestScore) {
      best = site;
      bestScore = score;
    }
  }
  return best;
}

function rise(
  run: HistoryRun,
  civ: Civ,
  claimant: Person,
  claim: Claim,
  sites: readonly Site[],
): void {
  const { world } = run;
  const rules = run.rules.civilWar;
  const { width } = run.cells;
  const capital = world.sites.get(civ.capital);
  const culture = cultureOf(run, civ);
  if (!capital || !culture) return;
  const ruler = livingPerson(run, claim.ruler) ?? rulerOf(run, civ);
  const seat = seatOf(run, civ, claimant, sites);
  // The claimant's renown against the ruler's decides how much of the realm follows.
  const mine = charisma(claimant);
  const theirs = charisma(ruler);
  const support = Math.min(
    rules.share[1],
    Math.max(rules.share[0], mine + theirs > 0 ? mine / (mine + theirs) : 0),
  );
  // Towns nearest the seat follow until the claimant holds that share of the realm's people.
  const want = adultsOf(sites) * support;
  const near = (s: Site) => cellDistance(width, s.cell, seat.cell);
  const nearer = sites
    .filter(
      (s) =>
        s.id !== civ.capital &&
        s.id !== seat.id &&
        near(s) < cellDistance(width, s.cell, capital.cell),
    )
    .sort((a, b) => near(a) - near(b) || a.id - b.id);
  const followers = [seat];
  let held = bandCount(seat, 'adult');
  for (const site of nearer) {
    if (held >= want) break;
    followers.push(site);
    held += bandCount(site, 'adult');
  }

  const pattern = run.content.settlement.civNames[culture.government];
  // A seat that rose before gives its realm a numbered name: the Second Warhost of Inisorc.
  const base = pattern.replace('{n}', seat.name);
  const taken = (n: string) => [...world.civs.values()].some((c) => c.name === n);
  let name = base;
  for (const ordinal of rules.ordinals) {
    if (!taken(name)) break;
    name = `${ordinal} ${base}`;
  }
  const rebel: Civ = {
    id: world.nextId.civ,
    name,
    raceId: civ.raceId,
    cultureId: civ.cultureId,
    capital: seat.id,
    founded: run.year,
    grievances: new Map(),
    rebelOf: civ.id,
  };
  world.nextId.civ += 1;
  world.civs.set(rebel.id, rebel);
  const ids = new Set(followers.map((s) => s.id));
  for (const site of followers) site.civId = rebel.id;
  run.territoryDirty = true;

  // The notables of the towns that rose go with them; the ruler goes home to the throne.
  const family = new Set([...claimant.family.spouses, ...claimant.family.children]);
  for (const person of livingList(run)) {
    if (person.civId !== civ.id) continue;
    if (person.id === ruler?.id) {
      if (person.siteId != null && ids.has(person.siteId)) person.siteId = civ.capital;
      continue;
    }
    if (person.id === claimant.id || family.has(person.id)) {
      person.civId = rebel.id;
      person.siteId = seat.id;
    } else if (person.siteId != null && ids.has(person.siteId)) person.civId = rebel.id;
  }
  claimant.title = 'ruler';
  rebel.rulerId = claimant.id;

  const others = followers.length - 1;
  const phrase = rules.phrases[others === 0 ? 'alone' : others === 1 ? 'one' : 'many']
    .replace('{site}', seat.name)
    .replace('{n}', String(others));
  const event = run.emit({
    type: 'civil_war_began',
    actors: [claimant.id, ...(ruler ? [ruler.id] : [])],
    place: seat.cell,
    causes: [claim.dispute],
    data: {
      name: claimant.name,
      ruler: ruler?.name ?? 'the new ruler',
      civ: rebel.name,
      from: civ.name,
      site: seat.name,
      rose: phrase,
      towns: followers.length,
    },
  });
  claimant.deeds.push(event.id);
  seatHouse(run, rebel, claimant, undefined, event.id);
  run.wars.push({
    id: run.wars.length + 1,
    attacker: rebel.id,
    defender: civ.id,
    started: run.year,
    cause: event.id,
    lastEvent: event.id,
    dead: 0,
    attackerDead: 0,
    defenderDead: 0,
    attackerAdults: adultsOf(civSites(run, rebel)),
    defenderAdults: adultsOf(civSites(run, civ)),
    attackerCaptain: claimant.id,
    defenderCaptain: undefined,
    civil: true,
  });
}

/**
 * A civil war's battle took the throne city or the claimant's last town: the realm is one again
 * under the winner. The old realm keeps its name either way; the claimant's realm folds into it.
 */
export function decideCivilWar(
  run: HistoryRun,
  war: War,
  winner: Civ,
  loser: Civ,
  battle: Id,
): void {
  const rules = run.rules.civilWar;
  const old = winner.rebelOf === loser.id ? loser : winner;
  const rebel = old === winner ? loser : winner;
  const claimantWon = winner === rebel;
  const victor = rulerOf(run, winner);
  const beaten = rulerOf(run, loser);
  const rebelSeat = run.world.sites.get(rebel.capital);
  for (const site of liveSites(run)) if (site.civId === rebel.id) site.civId = old.id;
  for (const person of livingList(run)) if (person.civId === rebel.id) person.civId = old.id;
  rebel.fell = run.year;
  run.territoryDirty = true;
  const executed = beaten !== undefined && run.rng.civilWar.chance(rules.executeChance);
  const fate = beaten
    ? rules.phrases[executed ? 'executed' : 'exiled'].replace('{name}', beaten.name)
    : '';
  const capital = run.world.sites.get(old.capital);
  const event = run.emit({
    type: claimantWon ? 'throne_seized' : 'revolt_crushed',
    actors: [victor, beaten].flatMap((p) => (p ? [p.id] : [])),
    place: (claimantWon ? capital : rebelSeat)?.cell ?? null,
    causes: [battle],
    data: {
      name: victor?.name ?? 'the victor',
      prior: beaten?.name ?? 'the beaten claimant',
      civ: old.name,
      rebels: rebel.name,
      site: (claimantWon ? capital : rebelSeat)?.name ?? 'the seat',
      span: spanOf(run, run.year - war.started),
      fate,
    },
  });
  war.lastEvent = event.id;
  if (victor) {
    victor.deeds.push(event.id);
    if (claimantWon) {
      old.rulerId = victor.id;
      victor.siteId = old.capital;
      seatHouse(run, old, victor, beaten, event.id);
    }
  }
  if (!beaten) return;
  beaten.deeds.push(event.id);
  beaten.title = 'kin';
  if (executed) {
    killNotable(run, beaten, { cause: 'execution', killer: victor, causes: [event.id] });
  } else {
    beaten.civId = null;
    beaten.siteId = null;
  }
}

/** A civil war that ended with both seats held: the realm stays two realms. */
export function splitRealm(run: HistoryRun, war: War, rebel: Civ, old: Civ): void {
  const event = run.emit({
    type: 'realm_split',
    actors: [rebel.rulerId, old.rulerId].flatMap((id) => (id === undefined ? [] : [id])),
    place: run.world.sites.get(rebel.capital)?.cell ?? null,
    causes: [war.lastEvent],
    data: {
      civ: rebel.name,
      from: old.name,
      span: spanOf(run, run.year - war.started),
      dead: war.dead,
    },
  });
  war.lastEvent = event.id;
  addGrievance(run, old.id, rebel.id, run.rules.civilWar.splitGrievance, event.id);
  // A claimant left with one town rules a free city, and looks for a friend like any other.
  if (civSites(run, rebel).length === 1) {
    rebel.free = true;
    swearPact(run, rebel);
  }
}
