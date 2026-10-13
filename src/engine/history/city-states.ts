// Free cities (playtest add-on): small realms of one city. A few stand at the start, set apart
// from the capitals; later a far town of a large realm may break away after a famine, a war or a
// disputed succession, and the old realm holds a grievance that often means a war to take it back.
// Each decade a free city may swear a pact of defence with a neighbour; the ally's spears then
// stand behind it when it is attacked, and the attacker resents the ally for it.

import { DAYS_PER_YEAR } from '../core/clock';
import type { EmitInput } from '../core/context';
import type { CultureDef } from '../core/content-types';
import { streamFor } from '../core/rng';
import type { Civ, Id, Person, SimEvent, Site, WorldState } from '../core/types';
import { culturePlaceName } from '../people/names';
import { emptyGoods } from './goods';
import { createAdult, isAdult, livingAt } from './people';
import { bandCount, totalPop } from './pop';
import {
  cellDistance,
  popBands,
  siteCapacity,
  sizeKind,
  type SettleContent,
  type SettleSearch,
} from './settle';
import {
  addGrievance,
  atWar,
  causesOf,
  cultureOf,
  isLive,
  liveSites,
  logOf,
  pairKey,
  type HistoryRun,
  type War,
} from './state';

const DECADE = 10;

function cityName(names: readonly string[], pick: number, site: string): string {
  return names[pick % names.length]!.replace('{n}', site);
}

/**
 * Year 0, at the end of settlement: a few free cities of the peoples already there, each on the
 * best open land for its culture well away from every capital.
 */
export function foundFreeCities(
  world: WorldState,
  content: SettleContent,
  search: SettleSearch,
  emit: (input: EmitInput) => SimEvent,
): Site[] {
  const cells = world.cells!;
  const rules = content.settlement.freeCities;
  const rng = streamFor(world, 'history.freeCities');
  const { width } = cells;
  let land = 0;
  for (let i = 0; i < cells.water.length; i += 1) if (cells.water[i] !== 3) land += 1;
  const count = Math.max(
    rules.start.min,
    Math.min(rules.start.max, Math.floor(land / rules.start.landCellsPerCity)),
  );
  const civs = [...world.civs.values()];
  const made: Site[] = [];
  if (civs.length === 0) return made;
  const capitals = civs.flatMap((c) => {
    const site = world.sites.get(c.capital);
    return site ? [site.cell] : [];
  });
  for (let n = 0; n < count; n += 1) {
    const kin = civs[rng.int(civs.length)]!;
    const culture = content.cultures.find((c) => c.id === kin.cultureId);
    const race = content.races.find((r) => r.id === kin.raceId);
    if (!culture || !race) continue;
    const sites = [...world.sites.values()];
    let best = -1;
    let bestScore = -Infinity;
    for (const cell of search.candidates) {
      if (capitals.some((c) => cellDistance(width, c, cell) < rules.capitalSpacing)) continue;
      if (sites.some((s) => cellDistance(width, s.cell, cell) < rules.siteSpacing)) continue;
      const score = search.scoreCell(culture, cell);
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (best < 0) continue;
    const site = makeCity(world, content, search, culture, best, rng.between(...rules.pop));
    site.name = uniqueName(world, culture, rng);
    const civ: Civ = {
      id: world.nextId.civ,
      name: cityName(rules.names, rng.int(rules.names.length), site.name),
      raceId: race.id,
      cultureId: culture.id,
      capital: site.id,
      founded: 0,
      grievances: new Map(),
      free: true,
    };
    world.nextId.civ += 1;
    world.civs.set(civ.id, civ);
    site.civId = civ.id;
    made.push(site);
    capitals.push(best);
    emit({
      type: 'civ_founded',
      place: site.cell,
      data: { civ: civ.name, culture: culture.name, site: site.name },
    });
  }
  return made;
}

function uniqueName(
  world: WorldState,
  culture: CultureDef,
  rng: ReturnType<typeof streamFor>,
): string {
  let name = '';
  for (let tries = 0; tries < 5; tries += 1) {
    name = culturePlaceName(culture.names, rng);
    if (![...world.sites.values()].some((s) => s.name === name)) break;
  }
  return name;
}

function makeCity(
  world: WorldState,
  content: SettleContent,
  search: SettleSearch,
  culture: CultureDef,
  cell: number,
  wanted: number,
): Site {
  const cells = world.cells!;
  const rules = content.settlement;
  const race = content.races.find((r) => r.id === culture.raceId)!;
  const features = search.featuresAt[cell]!;
  const capacity = siteCapacity(cells, cell, race, content, features);
  const total = Math.min(
    wanted,
    Math.max(rules.minPop, Math.floor(capacity * rules.popCapacityShare)),
  );
  const site: Site = {
    id: world.nextId.site,
    name: '',
    kind: sizeKind(total, rules),
    cell,
    civId: null,
    founded: 0,
    pop: popBands(total, race, culture, rules),
    goods: { ...emptyGoods(), food: Math.round(total * race.foodNeed * rules.storesYears) },
    wealth: 0,
    capacity,
    features: [...features],
    peakPop: total,
  };
  world.nextId.site += 1;
  world.sites.set(site.id, site);
  return site;
}

// --- breaking away ----------------------------------------------------------------------------

/** The newest event of a type for the civ (by name) since the start of last decade. */
function recent(run: HistoryRun, type: string, civName: string): Id | undefined {
  const since = (run.year - DECADE) * DAYS_PER_YEAR;
  const events = run.world.events;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.day < since) break;
    if (event.type === type && event.data.civ === civName) return event.id;
  }
  return undefined;
}

function freeCount(run: HistoryRun): number {
  let n = 0;
  for (const civ of run.world.civs.values()) if (civ.free && civ.fell === undefined) n += 1;
  return n;
}

/** Each decade: a far town of a large realm may throw off its rule. */
function runBreakaways(run: HistoryRun): void {
  const rules = run.rules.cityStates.secede;
  const rng = run.rng.cityStates;
  const { width } = run.cells;
  for (const civ of [...run.world.civs.values()]) {
    if (civ.fell !== undefined || civ.free || freeCount(run) >= rules.maxFree) continue;
    const sites = liveSites(run).filter((s) => s.civId === civ.id);
    if (sites.length < rules.minSites) continue;
    const capital = run.world.sites.get(civ.capital);
    if (!capital) continue;
    const freedom = (cultureOf(run, civ)?.values.freedom ?? 0) / 10;
    const atWarNow = run.wars.find(
      (w) => w.ended === undefined && (w.attacker === civ.id || w.defender === civ.id),
    );
    const dispute = recent(run, 'succession_disputed', civ.name);
    for (const site of sites) {
      if (site.id === civ.capital || totalPop(site) < rules.minPop) continue;
      if (cellDistance(width, site.cell, capital.cell) < rules.minDistance) continue;
      const famine = logOf(run, site.id).famine;
      const hungry = famine && run.year - famine.year <= DECADE ? famine : undefined;
      const odds =
        rules.chance *
        freedom *
        (hungry ? rules.famine : 1) *
        (atWarNow ? rules.war : 1) *
        (dispute !== undefined ? rules.dispute : 1);
      if (!rng.chance(odds)) continue;
      breakAway(run, civ, site, causesOf(hungry?.event, atWarNow?.lastEvent, dispute));
      break;
    }
  }
}

function breakAway(run: HistoryRun, old: Civ, site: Site, causes: Id[]): void {
  const { world } = run;
  const rules = run.rules.cityStates;
  const civ: Civ = {
    id: world.nextId.civ,
    name: cityName(
      run.content.settlement.freeCities.names,
      run.rng.cityStates.int(run.content.settlement.freeCities.names.length),
      site.name,
    ),
    raceId: old.raceId,
    cultureId: old.cultureId,
    capital: site.id,
    founded: run.year,
    grievances: new Map(),
    free: true,
  };
  world.nextId.civ += 1;
  world.civs.set(civ.id, civ);
  site.civId = civ.id;
  run.territoryDirty = true;
  // The notables living there go with the city; the old realm's ruler goes home.
  let leader: Person | undefined;
  for (const person of livingAt(run, site.id)) {
    if (person.civId !== old.id) continue;
    if (person.id === old.rulerId) {
      person.siteId = old.capital;
      continue;
    }
    person.civId = civ.id;
    if (isAdult(run, person) && (!leader || person.fame > leader.fame)) leader = person;
  }
  const fame = run.content.notables.fame.ruler;
  if (leader) {
    leader.title = 'ruler';
    leader.fame = Math.max(leader.fame, fame);
  } else {
    leader = createAdult(run, civ, site, 'ruler', fame);
  }
  civ.rulerId = leader.id;
  const event = run.emit({
    type: 'city_freed',
    actors: [leader.id],
    place: site.cell,
    causes: causesOf(...causes, logOf(run, site.id).origin),
    data: { site: site.name, civ: civ.name, from: old.name, name: leader.name },
  });
  leader.deeds.push(event.id);
  addGrievance(run, old.id, civ.id, rules.secede.grievance, event.id);
  // The old realm needs time to gather its spears; the city uses it to look for a friend.
  run.truce.set(pairKey(old.id, civ.id), run.year + rules.secede.graceYears);
  swearPact(run, civ);
}

// --- pacts -------------------------------------------------------------------------------------

function linkedCivIds(run: HistoryRun, civ: Civ): Id[] {
  const out = new Set<Id>();
  for (const site of liveSites(run)) {
    if (site.civId !== civ.id) continue;
    for (const id of run.links.get(site.id) ?? []) {
      const other = run.world.sites.get(id);
      if (other && isLive(other) && other.civId !== null && other.civId !== civ.id) {
        out.add(other.civId);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

function adultsOfCiv(run: HistoryRun, civId: Id): number {
  let n = 0;
  for (const site of liveSites(run)) if (site.civId === civId) n += bandCount(site, 'adult');
  return n;
}

function inPact(run: HistoryRun, a: Id, b: Id): boolean {
  return run.pacts.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
}

/** Pacts end when a side falls or the two go to war. */
function keepPacts(run: HistoryRun): void {
  run.pacts = run.pacts.filter((pact) => {
    const a = run.world.civs.get(pact.a);
    const b = run.world.civs.get(pact.b);
    if (!a || !b || a.fell !== undefined || b.fell !== undefined) return false;
    if (!atWar(run, pact.a, pact.b)) return true;
    run.emit({
      type: 'pact_broken',
      place: run.world.sites.get(a.capital)?.cell ?? null,
      causes: [pact.event],
      data: { civ: a.name, other: b.name },
    });
    return false;
  });
}

/** Each decade: a free city without a pact may swear one with its strongest friendly neighbour. */
function swearPacts(run: HistoryRun): void {
  for (const civ of [...run.world.civs.values()]) {
    if (!civ.free || civ.fell !== undefined) continue;
    if (run.pacts.some((p) => p.a === civ.id || p.b === civ.id)) continue;
    swearPact(run, civ);
  }
}

/** The free city swears a pact with its strongest linked neighbour that bears it no grudge, with `pact.chance`. */
function swearPact(run: HistoryRun, civ: Civ): void {
  const rules = run.rules.cityStates.pact;
  const rng = run.rng.cityStates;
  let partner: Civ | undefined;
  let most = -1;
  for (const id of linkedCivIds(run, civ)) {
    const other = run.world.civs.get(id);
    if (!other || other.fell !== undefined || atWar(run, civ.id, id) || inPact(run, civ.id, id))
      continue;
    if ((civ.grievances.get(id) ?? 0) > rules.maxGrievance) continue;
    if ((other.grievances.get(civ.id) ?? 0) > rules.maxGrievance) continue;
    const adults = adultsOfCiv(run, id);
    if (adults > most) {
      most = adults;
      partner = other;
    }
  }
  if (!partner || !rng.chance(rules.chance)) return;
  const opened = run.tradeOpened.get(pairKey(civ.id, partner.id));
  const event = run.emit({
    type: 'pact_sworn',
    place: run.world.sites.get(civ.capital)?.cell ?? null,
    actors: [civ.rulerId, partner.rulerId].flatMap((id) => (id === undefined ? [] : [id])),
    causes: causesOf(opened),
    data: { civ: civ.name, other: partner.name },
  });
  run.pacts.push({ a: civ.id, b: partner.id, since: run.year, event: event.id, aided: [] });
}

/** The living allies of a civ. */
function alliesOf(run: HistoryRun, civ: Civ): Civ[] {
  const out: Civ[] = [];
  for (const pact of run.pacts) {
    const other = pact.a === civ.id ? pact.b : pact.b === civ.id ? pact.a : undefined;
    const ally = other === undefined ? undefined : run.world.civs.get(other);
    if (ally && ally.fell === undefined) out.push(ally);
  }
  return out;
}

/** Strength a civ's allies would lend it, for weighing a war (no line is written). */
export function pactStrength(run: HistoryRun, civ: Civ, strengthOf: (c: Civ) => number): number {
  let total = 0;
  for (const ally of alliesOf(run, civ))
    total += strengthOf(ally) * run.rules.cityStates.pact.aidShare;
  return total;
}

/**
 * Allies stand behind a defender in battle: a share of their strength joins it. The first time
 * in a war, `ally_aided` says so and the attacker resents the ally.
 */
export function allyAid(
  run: HistoryRun,
  war: War,
  attacker: Civ,
  defender: Civ,
  strengthOf: (c: Civ) => number,
): number {
  const rules = run.rules.cityStates.pact;
  let total = 0;
  for (const ally of alliesOf(run, defender)) {
    if (ally.id === attacker.id || atWar(run, ally.id, defender.id)) continue;
    total += strengthOf(ally) * rules.aidShare;
    const pact = run.pacts.find(
      (p) => (p.a === ally.id && p.b === defender.id) || (p.b === ally.id && p.a === defender.id),
    )!;
    if (pact.aided.includes(war.id)) continue;
    pact.aided.push(war.id);
    const event = run.emit({
      type: 'ally_aided',
      place: run.world.sites.get(defender.capital)?.cell ?? null,
      causes: [war.lastEvent, pact.event],
      data: { civ: ally.name, friend: defender.name, enemy: attacker.name },
    });
    addGrievance(run, attacker.id, ally.id, rules.grievance, event.id);
  }
  return total;
}

/** Yearly: pacts end with a fall or a war; each decade, towns break away and free cities swear pacts. */
export function runCityStates(run: HistoryRun): void {
  keepPacts(run);
  if (run.year % DECADE !== 0) return;
  runBreakaways(run);
  swearPacts(run);
}
