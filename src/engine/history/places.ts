// Perilous places, hoards and expeditions (M4.7). The land keeps ancient ruins, old delvings and
// aura places from year 0; ruined towns, buried rulers and dead great beasts leave more. Companies
// of the living go into them for what lies there (items, lore, glory) or after a beast that raided
// them. Every roll here comes from the `places` stream; the places themselves have no events until
// someone acts on them.

import type { CreatureDef, PlaceKindDef } from '../core/content-types';
import { DAYS_PER_YEAR } from '../core/clock';
import type { Civ, Creature, Id, Item, PerilousPlace, Person, SimEvent, Site } from '../core/types';
import { cultureGivenName } from '../people/names';
import { TIERS } from '../people/tiers';
import { NO_NEAR, atSite, freshName, livingCreatures, nearestSite, whereIs } from './beasts';
import { claimHoard, hoardListOf, hoardedItems } from './dragons';
import { fill, itemsHeldBy, newItem, uniqueName } from './items';
import {
  beastKillChance,
  createHero,
  creditSlaying,
  deedSoldiers,
  isLegend,
  killNotable,
  markDeed,
} from './notables';
import {
  addDeed,
  createAdult,
  isAdult,
  isElder,
  livingAt,
  livingList,
  livingPerson,
} from './people';
import { bandCount, removePeople, stochasticRound } from './pop';
import { cellDistance, mineralIndexes } from './settle';
import {
  addGrievance,
  causesOf,
  civOf,
  cultureOf,
  isLive,
  liveSites,
  logOf,
  type HistoryRun,
} from './state';

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** "great boar" -> "Great Boar". */
const capWords = (text: string) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const NUMERALS = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const nameList = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

/** Events that leave a site in ruin, searched for the place's first deed. */
const RUIN_EVENTS = ['site_abandoned', 'site_razed', 'dragon_burned'];

const kindOf = (run: HistoryRun, id: string): PlaceKindDef =>
  run.content.places.kinds.find((k) => k.id === id)!;

/** The place at a cell, if any (the first by id). */
function placeAt(run: HistoryRun, cell: number): PerilousPlace | undefined {
  for (const place of run.world.places.values()) if (place.cell === cell) return place;
  return undefined;
}

/** Cells of the places not yet emptied: what lies there is for expeditions alone. */
export function openPlaceCells(run: HistoryRun): Set<number> {
  const out = new Set<number>();
  for (const place of run.world.places.values())
    if (place.emptied === undefined) out.add(place.cell);
  return out;
}

/** The event with this id (events are in id order), or undefined. */
function eventById(run: HistoryRun, id: Id): SimEvent | undefined {
  const events = run.world.events;
  let lo = 0;
  let hi = events.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const at = events[mid]!;
    if (at.id === id) return at;
    if (at.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

// --- making places ------------------------------------------------------------------------------

/** The first candidate no other place carries, else the first with a numeral. */
function uniquePlaceName(run: HistoryRun, candidates: string[]): string {
  const taken = new Set<string>();
  for (const place of run.world.places.values()) taken.add(place.name);
  const free = candidates.find((name) => !taken.has(name));
  if (free) return free;
  const first = candidates[0]!;
  for (const numeral of NUMERALS)
    if (!taken.has(`${first} ${numeral}`)) return `${first} ${numeral}`;
  return `${first} ${run.world.nextId.place}`;
}

/** A place of the kind with a fresh name, danger and finds from the kind's ranges. */
function addPlace(
  run: HistoryRun,
  kind: PlaceKindDef,
  values: Record<string, string>,
  fields: Pick<PerilousPlace, 'cell' | 'since'> & Partial<PerilousPlace>,
): PerilousPlace {
  const { world } = run;
  const rng = run.rng.places;
  const picked = rng.pick(kind.names);
  const name = uniquePlaceName(run, fill(kind.names, picked, values));
  const place: PerilousPlace = {
    ...fields,
    id: world.nextId.place,
    kind: kind.id,
    name,
    danger: rng.between(kind.danger[0], kind.danger[1]),
    finds: rng.between(kind.finds[0], kind.finds[1]),
    deeds: [],
  };
  world.nextId.place += 1;
  world.places.set(place.id, place);
  return place;
}

/**
 * Year 0: the ancient places, one of each ancient kind per `cellsPerAncient` cells, on dry wild
 * land away from sites and from each other. Ruins and old delvings take elder names; no events.
 */
export function initPlaces(run: HistoryRun): void {
  const { cells, world, content } = run;
  const rules = content.places;
  const rng = run.rng.places;
  const size = cells.width * cells.height;
  const each = Math.floor(size / rules.cellsPerAncient);
  const metals = mineralIndexes(content);
  const unused = [...rules.elderNames];
  const apart = (cell: number) =>
    [...world.sites.values()].every(
      (s) => cellDistance(cells.width, s.cell, cell) >= rules.placeSpacing,
    ) &&
    [...world.places.values()].every(
      (p) => cellDistance(cells.width, p.cell, cell) >= rules.placeSpacing,
    );
  const fits = (kindId: string, cell: number) => {
    if (cells.water[cell] !== 0 || cells.wildness[cell]! < rules.ancientMinWildness) return false;
    if (kindId === 'aura' && cells.aura[cell]! < rules.auraMin) return false;
    if (kindId === 'old-mine') {
      const metal = (cells.resources.get(cell) ?? []).some((d) => metals.has(d.resource));
      if (!metal && cells.elevation[cell]! < rules.mineElevation) return false;
    }
    return apart(cell);
  };
  for (const kindId of rules.ancientKinds) {
    const kind = kindOf(run, kindId);
    for (let n = 0; n < each; n += 1) {
      let found = -1;
      // Every try is drawn, so the stream advances the same however early a cell is found.
      for (let tries = 0; tries < rules.ancientTries; tries += 1) {
        const cell = rng.int(size);
        if (found < 0 && fits(kindId, cell)) found = cell;
      }
      if (found < 0) continue;
      const values: Record<string, string> = {};
      if (kind.adjectives) values.adj = rng.pick(kind.adjectives);
      if (kind.names.some((p) => p.includes('{site}'))) {
        values.site =
          unused.length > 0
            ? unused.splice(rng.int(unused.length), 1)[0]!
            : rng.pick(rules.elderNames);
      }
      addPlace(run, kind, values, { cell: found, since: 0 });
    }
  }
}

/** The event that ruined the site this year, searched from the newest back. */
function ruinEvent(run: HistoryRun, site: Site): Id | undefined {
  const from = (site.ruinedYear ?? 0) * DAYS_PER_YEAR;
  const events = run.world.events;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.day < from) break;
    if (event.place === site.cell && RUIN_EVENTS.includes(event.type)) return event.id;
  }
  return undefined;
}

/** Yearly: every ruined site of a kind in `ruinFrom` that is not yet a place becomes one. */
export function runPlaces(run: HistoryRun): void {
  const rules = run.content.places;
  const have = new Set<Id>();
  for (const place of run.world.places.values())
    if (place.siteId !== undefined) have.add(place.siteId);
  for (const site of run.world.sites.values()) {
    if (site.ruinedYear === undefined || have.has(site.id) || !rules.ruinFrom.includes(site.kind))
      continue;
    const kind = kindOf(run, rules.mineSiteKinds.includes(site.kind) ? 'old-mine' : 'ruin');
    const place = addPlace(
      run,
      kind,
      { site: site.name },
      { cell: site.cell, since: site.ruinedYear, siteId: site.id },
    );
    const cause = ruinEvent(run, site);
    if (cause !== undefined) place.deeds.push(cause);
  }
}

// --- barrows, lairs, carried-off treasure -------------------------------------------------------

/** A dry cell 2 to 6 cells (`reach`) from the capital that is no site's and no place's, or -1. */
function barrowCell(run: HistoryRun, capital: Site): number {
  const { cells } = run;
  const rules = run.content.places.barrow;
  const rng = run.rng.places;
  const [low, high] = rules.reach;
  const cx = capital.cell % cells.width;
  const cy = Math.floor(capital.cell / cells.width);
  let found = -1;
  for (let tries = 0; tries < rules.tries; tries += 1) {
    const x = cx + rng.between(-high, high);
    const y = cy + rng.between(-high, high);
    if (found >= 0 || x < 0 || y < 0 || x >= cells.width || y >= cells.height) continue;
    const cell = y * cells.width + x;
    const distance = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    if (distance < low || distance > high || cells.water[cell] !== 0) continue;
    if (run.siteAtCell.has(cell) || placeAt(run, cell)) continue;
    found = cell;
  }
  return found;
}

/**
 * A ruler of a standing civ has died: with the barrow chance (scaled by the culture's faith) they
 * are laid in a mound near the capital with their lowest-id artifact.
 */
export function buryRuler(run: HistoryRun, ruler: Person, civ: Civ, death: Id): void {
  const rules = run.content.places;
  const culture = cultureOf(run, civ);
  const capital = run.world.sites.get(civ.capital);
  if (!culture || !capital) return;
  if (!run.rng.places.chance(Math.min(1, (rules.barrow.chance * culture.values.faith) / 10)))
    return;
  const cell = barrowCell(run, capital);
  if (cell < 0) return;
  const grave = itemsHeldBy(run, ruler).find((i) => i.kind === 'artifact');
  const place = addPlace(
    run,
    kindOf(run, 'barrow'),
    { name: ruler.name },
    { cell, since: run.year, personId: ruler.id, civId: civ.id },
  );
  const event = run.emit({
    type: 'barrow_raised',
    actors: [ruler.id],
    place: cell,
    causes: [death],
    data: {
      name: ruler.name,
      civ: civ.name,
      peril: place.name,
      site: capital.name,
      grave: grave ? ` with ${grave.name}` : ' with grave goods',
      item: grave?.name ?? '',
    },
  });
  place.deeds.push(event.id);
  addDeed(ruler, event.id);
  if (grave) {
    grave.holder = null;
    grave.lostAt = cell;
    grave.deeds.push(event.id);
  }
}

/** A figure who died in a perilous place: their items stay there, not with an heir. */
export function leaveItemsAt(run: HistoryRun, dead: Person, place: PerilousPlace, death: Id): void {
  for (const item of itemsHeldBy(run, dead)) {
    item.holder = null;
    item.lostAt = place.cell;
    const event = run.emit({
      type: 'item_lost',
      actors: [dead.id],
      place: place.cell,
      causes: [death, ...item.deeds.slice(-1)],
      data: { item: item.name, from: dead.name, site: place.name },
    });
    item.deeds.push(event.id);
    place.deeds.push(event.id);
  }
}

/**
 * A great or legendary beast died of age: its lair becomes a place (a dragon's holds two finds
 * more) and, if its hoard still holds items, the land learns they lie there.
 */
export function lairAbandoned(run: HistoryRun, creature: Creature, def: CreatureDef): void {
  if (def.tier === 'beast') return;
  const items = hoardListOf(creature)
    .map((id) => run.world.items.get(id))
    .filter((i): i is Item => i !== undefined && i.holder === null);
  let place = placeAt(run, creature.lair);
  if (place) delete place.emptied;
  else {
    place = addPlace(
      run,
      kindOf(run, 'lair'),
      { beast: creature.name },
      { cell: creature.lair, since: run.year, creatureId: creature.id },
    );
  }
  if (creature.dragon) place.finds += 2;
  if (items.length === 0) return;
  const event = run.emit({
    type: 'lair_abandoned',
    place: creature.lair,
    causes: causesOf(creature.deeds[creature.deeds.length - 1]),
    data: {
      beast: creature.name,
      peril: place.name,
      items: nameList(items.map((i) => i.name)),
      lair: creature.dragon?.lairName ?? '',
    },
  });
  creature.deeds.push(event.id);
  place.deeds.push(event.id);
}

/** A great or legendary beast's raid may carry an artifact held at the site off to its hoard. */
export function carryOff(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
  raid: Id,
): void {
  if (def.tier === 'beast' || !run.rng.places.chance(run.content.places.raidCarryOff)) return;
  const held: { item: Item; holder: Person }[] = [];
  for (const item of run.world.items.values()) {
    if (item.kind !== 'artifact') continue;
    const holder = livingPerson(run, item.holder);
    if (holder && holder.siteId === site.id) held.push({ item, holder });
  }
  if (held.length === 0) return;
  const { item, holder } = run.rng.places.pick(held);
  item.holder = null;
  item.lostAt = creature.lair;
  hoardListOf(creature).push(item.id);
  const event = run.emit({
    type: 'item_carried_off',
    actors: [holder.id],
    place: site.cell,
    causes: [raid, ...item.deeds.slice(-1)],
    data: {
      item: item.name,
      from: holder.name,
      beast: creature.name,
      site: site.name,
      civ: civOf(run, site)?.name ?? '',
      lair: creature.dragon?.lairName ?? `the lair of ${creature.name}`,
    },
  });
  item.deeds.push(event.id);
  creature.deeds.push(event.id);
  addDeed(holder, event.id);
}

/**
 * A great or legendary beast was slain: its remains bring luxury to the slayer's home, and the
 * home's crafter may make an artifact from them for the slayer.
 */
export function beastParts(
  run: HistoryRun,
  def: CreatureDef,
  creature: Creature,
  slayer: Person,
  home: Site,
  slain: Id,
): void {
  if (def.tier === 'beast') return;
  const rules = run.content.places.parts;
  const civ = civOf(run, home);
  if (!civ || !isLive(home)) return;
  home.goods.luxury += rules.luxuryPerDanger * def.danger;
  const rng = run.rng.places;
  if (!rng.chance(rules.craftChance)) return;
  const crafter =
    livingAt(run, home.id).find((p) => p.title === 'crafter') ??
    createAdult(run, civ, home, 'crafter', run.content.notables.fame.crafter);
  const picked = rng.pick(rules.items);
  const values = { Beast: capWords(def.name), beast: creature.name };
  const name = uniqueName(
    run,
    fill(
      rules.items.map((i) => i.name),
      picked.name,
      values,
    ),
  );
  const item = newItem(run, {
    kind: 'artifact',
    name,
    form: picked.form,
    makerId: crafter.id,
    holder: slayer.id,
  });
  const event = run.emit({
    type: 'beast_parts_crafted',
    actors: [crafter.id, slayer.id],
    place: home.cell,
    causes: [slain],
    data: {
      item: name,
      form: picked.form,
      maker: crafter.name,
      hero: slayer.name,
      beast: creature.name,
      kind: def.name,
      site: home.name,
      civ: civ.name,
    },
  });
  item.deeds.push(event.id);
  creature.deeds.push(event.id);
  addDeed(crafter, event.id);
  addDeed(slayer, event.id);
}

// --- expeditions --------------------------------------------------------------------------------

/** Items lying free at a cell (no holder, not in a living hoard), by cell, in id order. */
function itemsLying(run: HistoryRun): Map<number, Item[]> {
  const hoarded = hoardedItems(run);
  const out = new Map<number, Item[]>();
  for (const item of run.world.items.values()) {
    if (item.holder !== null || item.lostAt === undefined || hoarded.has(item.id)) continue;
    const list = out.get(item.lostAt);
    if (list) list.push(item);
    else out.set(item.lostAt, [item]);
  }
  return out;
}

interface Target {
  place?: PerilousPlace;
  beast?: Creature;
  def?: CreatureDef;
  /** The civ's nearest live site: where the party sets out from. */
  site: Site;
  /** The event the set-out follows. */
  cause?: Id | undefined;
}

/** The nearest of the sites to a cell (ties by lowest id) and how far it is. */
function nearestOf(run: HistoryRun, sites: Site[], cell: number) {
  let best: Site | undefined;
  let distance = Infinity;
  for (const site of sites) {
    const d = cellDistance(run.cells.width, site.cell, cell);
    if (d < distance) {
      best = site;
      distance = d;
    }
  }
  return best ? { site: best, distance } : undefined;
}

/** The target the civ goes for: places and bounty beasts in range, weighted, drawn from the stream. */
function pickTarget(
  run: HistoryRun,
  sites: Site[],
  lying: Map<number, Item[]>,
): Target | undefined {
  const ex = run.content.places.expedition;
  const entries: (readonly [Target, number])[] = [];
  const weight = (value: number, distance: number) =>
    Math.max(1, Math.round((value * 100) / (1 + distance / 10)));
  for (const place of run.world.places.values()) {
    if (place.emptied !== undefined) continue;
    if (place.lastVisit !== undefined && run.year - place.lastVisit < ex.restYears) continue;
    const near = nearestOf(run, sites, place.cell);
    if (!near || near.distance > ex.range) continue;
    const value = (lying.get(place.cell)?.length ?? 0) * 2 + place.finds + 1;
    entries.push([
      { place, site: near.site, cause: place.deeds[place.deeds.length - 1] },
      weight(value, near.distance),
    ]);
  }
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const beast of livingCreatures(run)) {
    const def = defs.get(beast.defId);
    // Dragons have quests of their own (dragons.ts).
    if (!def || def.tier === 'beast' || beast.dragon) continue;
    const raid = sites
      .map((s) => logOf(run, s.id).raided)
      .find(
        (r) =>
          r !== undefined &&
          run.year - r.year <= ex.bountyYears &&
          eventById(run, r.event)?.data.beast === beast.name,
      );
    if (!raid) continue;
    const near = nearestOf(run, sites, whereIs(beast));
    if (!near || near.distance > ex.range) continue;
    entries.push([
      { beast, def, site: near.site, cause: raid.event },
      weight(ex.bountyWeight, near.distance),
    ]);
  }
  if (entries.length === 0) return undefined;
  return run.rng.places.weighted(entries);
}

/**
 * The civ's strongest willing figure living at a live site within range of the target: a legend
 * first, then an exceptional figure, a hero, a captain, a noble of the ruling kin; within a rank the soldier equivalent then
 * fame, ties by lowest id. They must be an adult and no elder, without a deed this year, and not
 * the ruler unless a legend.
 */
function pickLeader(run: HistoryRun, civ: Civ, cell: number): Person | undefined {
  const range = run.content.places.expedition.range;
  let best: Person | undefined;
  let bestRank = Infinity;
  let bestScore = -1;
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || person.siteId == null) continue;
    const rank = isLegend(person)
      ? 0
      : person.magic.power >= TIERS.exceptional.minPower
        ? 1
        : person.title === 'hero'
          ? 2
          : person.title === 'captain'
            ? 3
            : person.title === 'kin'
              ? 4
              : -1;
    if (rank < 0 || (rank > 0 && person.id === civ.rulerId)) continue;
    if (!isAdult(run, person) || isElder(run, person)) continue;
    if (run.notables.lastDeed.get(person.id) === run.year) continue;
    const home = run.world.sites.get(person.siteId);
    if (!home || !isLive(home) || cellDistance(run.cells.width, home.cell, cell) > range) continue;
    const score = deedSoldiers(run, person) * 1000 + person.fame;
    if (rank < bestRank || (rank === bestRank && score > bestScore)) {
      best = person;
      bestRank = rank;
      bestScore = score;
    }
  }
  return best;
}

/** The robbed dead wake: a restless-dead creature with the barrow as its lair. */
function wakeDead(run: HistoryRun, place: PerilousPlace, robbery: Id): void {
  const ex = run.content.places.expedition;
  const def = run.content.creatures.find((d) => d.id === ex.restlessDeadId);
  if (!def || livingCreatures(run).filter((c) => c.defId === def.id).length >= def.maxAlive) return;
  const rng = run.rng.places;
  const near = nearestSite(run, place.cell, Infinity)?.name ?? NO_NEAR;
  const name = freshName(run, def, rng.pick(def.names), near);
  const lifespan = rng.between(def.lifespan[0], def.lifespan[1]);
  const event = run.emit({
    type: 'barrow_woke',
    place: place.cell,
    causes: [robbery],
    data: { beast: name, kind: def.name, peril: place.name, near },
  });
  const { world } = run;
  const id = world.nextId.creature;
  world.nextId.creature += 1;
  world.creatures.set(id, {
    id,
    defId: def.id,
    name,
    lair: place.cell,
    born: run.year,
    lifespan,
    deeds: [event.id],
  });
  place.deeds.push(event.id);
}

/** Yearly: each standing civ may send a company into a place or after a beast that raided it. */
export function runExpeditions(run: HistoryRun): void {
  const ex = run.content.places.expedition;
  let lying: Map<number, Item[]> | undefined;
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    const values = cultureOf(run, civ)?.values;
    if (!values) continue;
    const chance = (ex.chance * (values.war + values.wealth + values.learning)) / 15;
    if (!run.rng.places.chance(chance)) continue;
    const sites = liveSites(run).filter((s) => s.civId === civ.id);
    lying ??= itemsLying(run);
    const target = pickTarget(run, sites, lying);
    if (target) sendExpedition(run, civ, target, lying);
  }
}

function sendExpedition(
  run: HistoryRun,
  civ: Civ,
  target: Target,
  lying: Map<number, Item[]>,
): void {
  const ex = run.content.places.expedition;
  const rng = run.rng.places;
  const { place, beast, def, site } = target;
  const adults = bandCount(site, 'adult');
  if (adults < ex.partyMin * 3) return;
  const cell = place ? place.cell : whereIs(beast!);
  let leader = pickLeader(run, civ, cell);
  // A noble leads only half the time; otherwise the commoners go on their own.
  if (leader?.title === 'kin' && !isLegend(leader) && !rng.chance(ex.bandChance))
    leader = undefined;
  if (beast && !leader) return;
  if (place && !leader && place.danger > ex.commonerMaxDanger) return;
  const party = Math.max(ex.partyMin, Math.min(ex.partyMax, Math.round(adults * ex.partyShare)));
  const danger = place ? place.danger : def!.danger;
  const need = danger * run.rules.slayAdultsPerDanger;
  const strength = party + (leader ? deedSoldiers(run, leader) : 0);
  let chance = Math.min(ex.successMax, (ex.successBase * strength) / need);
  if (def) chance *= run.rules.slayTierFactor[def.tier];
  const odds = { fighters: Math.round(strength), danger, odds: Math.round(chance * 100) };
  const who = leader ? leader.name : ex.bandWord;
  const goal = place ? place.name : beast!.name;
  const kind = place ? kindOf(run, place.kind) : undefined;
  const guardians = kind ? kind.guardians[place!.id % kind.guardians.length]! : '';
  const record = (event: SimEvent) => {
    place?.deeds.push(event.id);
    beast?.deeds.push(event.id);
    if (leader) {
      addDeed(leader, event.id);
      markDeed(run, leader);
    }
  };
  const setOut = run.emit({
    type: 'expedition_set_out',
    actors: leader ? [leader.id] : [],
    place: site.cell,
    causes: causesOf(target.cause),
    data: {
      who,
      site: site.name,
      civ: civ.name,
      party,
      company: (leader ? ex.companyLed : ex.companyBand).replace('{party}', String(party)),
      goal: place ? `into ${goal}` : `after ${goal}`,
      why: place
        ? ex.whyPlace.replace('{guardians}', guardians)
        : ex.whyBounty.replace('{site}', site.name),
      peril: place?.name ?? '',
      beast: beast?.name ?? '',
      ...odds,
    },
  });
  record(setOut);
  if (place) place.lastVisit = run.year;

  if (!rng.chance(chance)) {
    const dead = removePeople(site, stochasticRound(rng, party * ex.failLoss), ['adult']);
    const dies = leader !== undefined && rng.chance(beastKillChance(run, leader, danger));
    const failed = run.emit({
      type: 'expedition_failed',
      actors: leader ? [leader.id] : [],
      place: cell,
      causes: [setOut.id],
      data: {
        who,
        outcome: dies ? ex.outcomes.lost : ex.outcomes.driven,
        goal: `from ${goal}`,
        loss: dead > 0 ? ex.lossPhrase.replace('{dead}', String(dead)) : '',
        site: site.name,
        civ: civ.name,
        party,
        dead,
        peril: place?.name ?? '',
        beast: beast?.name ?? '',
        ...odds,
      },
    });
    record(failed);
    if (dies && leader) {
      if (beast)
        killNotable(run, leader, { cause: 'beast', causes: [failed.id], beast, fought: true });
      else killNotable(run, leader, { cause: 'peril', causes: [failed.id], peril: place });
    }
    return;
  }

  const dead = removePeople(site, stochasticRound(rng, party * ex.winLoss), ['adult']);
  const loss = dead > 0 ? ex.lossPhrase.replace('{dead}', String(dead)) : '';
  if (beast && def && leader) {
    beast.died = run.year;
    beast.slainBy = leader.name;
    beast.slayerId = leader.id;
    const slain = run.emit({
      type: 'beast_slain',
      place: whereIs(beast),
      actors: [leader.id],
      causes: [setOut.id],
      data: {
        hero: leader.name,
        beast: beast.name,
        kind: def.name,
        site: site.name,
        civ: civ.name,
        at: atSite(beast, site).replace(' at ', ' near '),
        party,
        dead,
        ...odds,
      },
    });
    record(slain);
    creditSlaying(run, leader, def.danger, slain.id);
    claimHoard(run, beast, leader, slain.id);
    beastParts(run, def, beast, leader, site, slain.id);
    return;
  }
  if (place)
    placeWon(run, civ, place, site, leader, { party, dead, loss, odds, lying, record, setOut });
}

interface Win {
  party: number;
  dead: number;
  loss: string;
  odds: { fighters: number; danger: number; odds: number };
  lying: Map<number, Item[]>;
  record: (event: SimEvent) => void;
  setOut: SimEvent;
}

/** A won expedition into a place: an item lying there, else lore, else treasure, else glory. */
function placeWon(
  run: HistoryRun,
  civ: Civ,
  place: PerilousPlace,
  site: Site,
  leader: Person | undefined,
  win: Win,
): void {
  const ex = run.content.places.expedition;
  const rules = run.content.notables;
  const rng = run.rng.places;
  const kind = kindOf(run, place.kind);
  const lyingHere = win.lying.get(place.cell) ?? [];
  let taken: Item | undefined = lyingHere[0];
  let made: 'book' | 'artifact' | undefined;
  if (!taken && place.finds > 0 && rng.chance(kind.loreChance)) made = 'book';
  else if (!taken && place.finds > 0 && rng.chance(kind.treasureChance)) made = 'artifact';
  // A band of commoners that brings something home makes a hero of the finder.
  let finder = leader;
  let role = '';
  if (!finder && (taken || made)) {
    const culture = cultureOf(run, civ);
    finder = culture
      ? createHero(run, site, cultureGivenName(culture.names, run.rng.names), place.danger)
      : undefined;
    if (finder) role = ex.commonerRole.replace('{site}', site.name);
    else {
      taken = undefined;
      made = undefined;
    }
  }
  let item = taken;
  if (!item && made && finder) {
    const forms = made === 'book' ? rules.bookForms.mundane! : rules.artifactForms;
    const form = rng.pick(forms);
    const epithet = made === 'artifact' ? rng.pick(rules.artifactEpithets) : '';
    const patterns = made === 'book' ? ex.loreNames : ex.treasureNames;
    const name = uniqueName(
      run,
      fill(patterns, rng.pick(patterns), {
        Epithet: cap(epithet),
        Form: cap(form),
        form,
        place: place.name,
      }),
    );
    item = newItem(run, { kind: made, name, form, makerId: null, holder: finder.id });
    place.finds -= 1;
  } else if (item && finder) {
    win.lying.set(place.cell, lyingHere.slice(1));
    item.holder = finder.id;
    delete item.lostAt;
  }
  const left = (win.lying.get(place.cell) ?? []).length;
  const emptied = place.finds <= 0 && left === 0;
  if (emptied) place.emptied = run.year;
  const type = !item
    ? 'expedition_glory'
    : item.kind === 'book'
      ? 'expedition_lore'
      : 'expedition_treasure';
  const event = run.emit({
    type,
    actors: finder ? [finder.id] : [],
    place: place.cell,
    causes: [win.setOut.id],
    data: {
      who: finder ? finder.name : ex.bandWord,
      role,
      item: item?.name ?? '',
      peril: place.name,
      guardians: kind.guardians[place.id % kind.guardians.length]!,
      site: site.name,
      civ: civ.name,
      loss: win.loss,
      empty: emptied ? ex.emptiedPhrase : '',
      party: win.party,
      dead: win.dead,
      ...win.odds,
    },
  });
  win.record(event);
  if (item && finder) {
    item.deeds.push(event.id);
    addDeed(finder, event.id);
    markDeed(run, finder);
  }
  if (leader) creditSlaying(run, leader, place.danger, event.id);
  if (item && place.kind === 'barrow') {
    const owner = place.civId === undefined ? undefined : run.world.civs.get(place.civId);
    if (owner && owner.fell === undefined && owner.id !== civ.id)
      addGrievance(run, owner.id, civ.id, ex.barrowGrievance, event.id);
    if (rng.chance(ex.wakeDeadChance)) wakeDead(run, place, event.id);
  }
}
