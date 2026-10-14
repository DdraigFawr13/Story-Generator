// Dragons as individuals (M5.6): one at a time, woken in a year of its own, with a name, a temper,
// a lair and a hoard. A greedy one is paid tribute, a wrathful one burns small towns, a slumbering
// one sleeps for decades. What it kills lies in its hoard; the hoard draws seekers, and whoever
// slays it carries the hoard home. Every roll here comes from the `dragons` stream.

import type { CreatureDef, DragonTemper } from '../core/content-types';
import type { Creature, Id, Person, Region, Site } from '../core/types';
import { TIERS } from '../people/tiers';
import { civLosesSite, findRefuge, ruinSite } from './abandon';
import { NO_NEAR, fightHunt, findLair, livingCreatures, nearestSite } from './beasts';
import { itemsHeldBy } from './items';
import { deedSoldiers, isLegend, relocateNotables, slayerFor } from './notables';
import { addDeed, isAdult, isElder, livingList } from './people';
import { siteNeed, totalPop } from './pop';
import { cellDistance } from './settle';
import { causesOf, civName, isLive, type HistoryRun } from './state';

/**
 * Per run, for each dragon slot: the year its next dragon wakes and the last one it woke; and
 * the tribute paid per site.
 */
interface DragonMemory {
  next: (number | undefined)[];
  last: (Id | undefined)[];
  paid: Map<Id, Map<Id, number>>;
}
const memory = new WeakMap<HistoryRun, DragonMemory>();
function memoryOf(run: HistoryRun): DragonMemory {
  let mem = memory.get(run);
  if (!mem) memory.set(run, (mem = { next: [], last: [], paid: new Map() }));
  return mem;
}

/** The creature entry dragons use, absent when the content has none (no dragons then). */
function dragonDef(run: HistoryRun): CreatureDef | undefined {
  return run.content.creatures.find((d) => d.id === run.content.dragons.creatureId);
}

function temperOf(run: HistoryRun, creature: Creature): DragonTemper {
  const tempers = run.content.dragons.tempers;
  return tempers.find((t) => t.id === creature.dragon?.temper) ?? tempers[0]!;
}

/** Temper-scaled raid chance multiplier. */
export function raidFactor(run: HistoryRun, creature: Creature): number {
  return temperOf(run, creature).raidFactor;
}

const nameList = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;

/** Lair cells of the living dragons: nobody founds a site near them. */
export function dragonLairs(run: HistoryRun): number[] {
  return livingCreatures(run).flatMap((c) => (c.dragon ? [c.lair] : []));
}

/** Whether the beast keeps a hoard of what it kills: a dragon, or any other great or legendary beast. */
export function hoards(run: HistoryRun, creature: Creature): boolean {
  if (creature.dragon) return true;
  const def = run.content.creatures.find((d) => d.id === creature.defId);
  return def !== undefined && def.tier !== 'beast';
}

/** The ids of the items in the beast's hoard (a dragon's, else the creature's own list). */
export function hoardListOf(creature: Creature): Id[] {
  return creature.dragon ? creature.dragon.hoard.items : (creature.hoard ??= []);
}

/** Items lying in a living beast's hoard (no one finds them while it lives). */
export function hoardedItems(run: HistoryRun): Set<Id> {
  const out = new Set<Id>();
  for (const creature of livingCreatures(run))
    for (const id of creature.dragon?.hoard.items ?? creature.hoard ?? []) out.add(id);
  return out;
}

/** "second", "third" ... "tenth", then "11th". */
function ordinal(n: number): string {
  const words = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
  ];
  return words[n - 1] ?? `${n}th`;
}

const lastDeed = (creature: Creature) => causesOf(creature.deeds[creature.deeds.length - 1]);

// --- waking -------------------------------------------------------------------------------------

/** True if the sorted `cells` hold `cell`. */
function holds(cells: readonly number[], cell: number): boolean {
  let lo = 0;
  let hi = cells.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cells[mid]! === cell) return true;
    if (cells[mid]! < cell) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** "under the {region}" when the lair lies in or by a mountain region, else "near {near}". */
function placePhrase(run: HistoryRun, lair: number, near: string): string {
  const rules = run.content.dragons;
  let best: Region | undefined;
  let bestDistance = Infinity;
  for (const region of run.world.regions.values()) {
    if (!rules.lairRegionKinds.includes(region.kind)) continue;
    const distance = holds(region.cells, lair)
      ? 0
      : cellDistance(run.cells.width, region.anchor, lair);
    if (distance <= rules.lairRegionReach && distance < bestDistance) {
      best = region;
      bestDistance = distance;
    }
  }
  return best
    ? rules.lairUnder.replace('{region}', best.name)
    : rules.lairNear.replace('{near}', near);
}

/**
 * A given name no dragon has had (the rolled one, else the others in order), else the rolled one
 * with a free ordinal. Returns the given name and the full name.
 */
function freshName(run: HistoryRun, rolled: string, epithet: string): [string, string] {
  const rules = run.content.dragons;
  const used = new Set<string>();
  const givens = new Set<string>();
  for (const creature of run.world.creatures.values()) {
    used.add(creature.name);
    if (creature.dragon) givens.add(creature.name.split(' ')[0]!);
  }
  for (const given of [rolled, ...rules.names])
    if (!givens.has(given)) return [given, `${given} ${epithet}`];
  const base = `${rolled} ${epithet}`;
  for (const ordinal of run.rules.beastNameOrdinals)
    if (!used.has(`${base} ${ordinal}`)) return [rolled, `${base} ${ordinal}`];
  for (let n = run.rules.beastNameOrdinals.length + 2; ; n += 1)
    if (!used.has(`${base} ${n}`)) return [rolled, `${base} ${n}`];
}

/** How many dragons the world holds at once: one per `cellsPerDragon` map cells, 1 to `maxAlive`. */
export function dragonSlots(run: HistoryRun): number {
  const rules = run.content.dragons;
  const fit = Math.floor((run.cells.width * run.cells.height) / rules.cellsPerDragon);
  return Math.max(1, Math.min(rules.maxAlive, fit));
}

/**
 * Yearly, for each dragon slot with no dragon alive: the next wakes once its year comes (the first
 * slot's in year 1 to `firstBy`, the others' in year 1 to `laterFirstBy`; after a death,
 * `successorGap` years on) and a lair can be found at least `lairsApart` from the other dragons'.
 */
export function wakeDragon(run: HistoryRun): void {
  const def = dragonDef(run);
  if (!def) return;
  const rules = run.content.dragons;
  for (let slot = 0; slot < dragonSlots(run); slot += 1) {
    const first = slot === 0 ? rules.firstBy : rules.laterFirstBy;
    wakeInSlot(run, def, slot, first);
  }
}

function wakeInSlot(run: HistoryRun, def: CreatureDef, slot: number, first: number): void {
  const { world, rng } = run;
  const rules = run.content.dragons;
  const mem = memoryOf(run);
  const lastId = mem.last[slot];
  const last = lastId === undefined ? undefined : world.creatures.get(lastId);
  if (last && last.died === undefined) return;
  if (last?.died !== undefined) {
    mem.next[slot] = last.died + rng.dragons.between(rules.successorGap[0], rules.successorGap[1]);
    mem.last[slot] = undefined;
  }
  const next = (mem.next[slot] ??= rng.dragons.between(1, first));
  if (run.year < next) return;
  // Biome first, then anywhere wild enough; failing both, it tries again next year.
  const others = dragonLairs(run);
  const apart = (cell: number) =>
    others.every((lair) => cellDistance(run.cells.width, lair, cell) >= rules.lairsApart);
  let lair = findLair(run, def, rng.dragons, false, apart);
  if (lair < 0) lair = findLair(run, def, rng.dragons, true, apart);
  if (lair < 0) return;
  const rolled = rng.dragons.pick(rules.names);
  let pick = rng.dragons.between(
    1,
    rules.tempers.reduce((sum, t) => sum + t.weight, 0),
  );
  let temper = rules.tempers[rules.tempers.length - 1]!;
  for (const t of rules.tempers) {
    if (pick <= t.weight) {
      temper = t;
      break;
    }
    pick -= t.weight;
  }
  const age = rng.dragons.between(rules.ageOnWaking[0], rules.ageOnWaking[1]);
  const lifespan = rng.dragons.between(def.lifespan[0], def.lifespan[1]);
  const [given, name] = freshName(run, rolled, temper.epithet);
  const lairName = rng.dragons.pick(rules.lairNames).replace('{name}', given);
  const awakeUntil =
    temper.sleep && temper.wake
      ? run.year + rng.dragons.between(temper.wake[0], temper.wake[1])
      : undefined;
  const near = nearestSite(run, lair, Infinity)?.name ?? NO_NEAR;
  const event = run.emit({
    type: 'dragon_woke',
    place: lair,
    causes: [],
    data: {
      beast: name,
      kind: def.name,
      age,
      temper: temper.word,
      lair: lairName,
      placePhrase: placePhrase(run, lair, near),
      near,
    },
  });
  const id = world.nextId.creature;
  world.nextId.creature += 1;
  world.creatures.set(id, {
    id,
    defId: def.id,
    name,
    lair,
    born: run.year,
    lifespan,
    dragon: {
      temper: temper.id,
      ageAtWaking: age,
      lairName,
      ...(awakeUntil === undefined ? {} : { awakeUntil }),
      hoard: { tribute: 0, plunder: 0, items: [] },
      tributeFrom: [],
    },
    deeds: [event.id],
  });
  mem.last[slot] = id;
  mem.next[slot] = undefined;
}

// --- sleep --------------------------------------------------------------------------------------

/**
 * Whether the dragon is up this year. A slumbering one falls asleep once its waking spell is
 * over (`dragon_slept`) and stirs when its sleep is (`dragon_stirred`); asleep it does nothing.
 */
export function dragonAwake(run: HistoryRun, creature: Creature): boolean {
  const state = creature.dragon;
  const temper = temperOf(run, creature);
  if (!state || !temper.sleep || !temper.wake) return true;
  const rng = run.rng.dragons;
  const near = nearestSite(run, creature.lair, Infinity)?.name ?? NO_NEAR;
  if (state.asleepUntil !== undefined) {
    if (run.year < state.asleepUntil) return false;
    const years = run.year - (state.sleptSince ?? run.year);
    delete state.asleepUntil;
    delete state.sleptSince;
    state.awakeUntil = run.year + rng.between(temper.wake[0], temper.wake[1]);
    const event = run.emit({
      type: 'dragon_stirred',
      place: creature.lair,
      causes: lastDeed(creature),
      data: { beast: creature.name, lair: state.lairName, near, years },
    });
    creature.deeds.push(event.id);
    return true;
  }
  if (state.awakeUntil !== undefined && run.year >= state.awakeUntil) {
    delete state.awakeUntil;
    state.asleepUntil = run.year + rng.between(temper.sleep[0], temper.sleep[1]);
    state.sleptSince = run.year;
    const event = run.emit({
      type: 'dragon_slept',
      place: creature.lair,
      causes: lastDeed(creature),
      data: { beast: creature.name, lair: state.lairName, near },
    });
    creature.deeds.push(event.id);
    return false;
  }
  return true;
}

// --- tribute, fire ------------------------------------------------------------------------------

/**
 * A greedy dragon about to raid asks the site for tribute. Returns true if the site paid (no raid
 * follows). If a legend of the town would answer, they refuse and the raid goes ahead.
 */
export function askTribute(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
): boolean {
  const state = creature.dragon;
  if (!state || !temperOf(run, creature).tribute) return false;
  const rules = run.content.dragons;
  const champion = slayerFor(run, site);
  if (champion && isLegend(champion)) {
    const refused = run.emit({
      type: 'dragon_tribute_refused',
      place: site.cell,
      actors: [champion.id],
      causes: lastDeed(creature),
      data: {
        name: champion.name,
        beast: creature.name,
        kind: def.name,
        site: site.name,
        civ: civName(run, site),
      },
    });
    creature.deeds.push(refused.id);
    addDeed(champion, refused.id);
    return false;
  }
  site.goods.food *= 1 - rules.tributeShare;
  state.hoard.tribute += 1;
  if (!state.tributeFrom.includes(site.id)) state.tributeFrom.push(site.id);
  const mem = memoryOf(run);
  let bySite = mem.paid.get(creature.id);
  if (!bySite) mem.paid.set(creature.id, (bySite = new Map()));
  const count = (bySite.get(site.id) ?? 0) + 1;
  bySite.set(site.id, count);
  const event = run.emit({
    type: 'dragon_tribute',
    place: site.cell,
    causes: lastDeed(creature),
    data: {
      beast: creature.name,
      site: site.name,
      civ: civName(run, site),
      share: rules.tributeWord,
      count,
      again: count === 1 ? '' : rules.tributeAgain.replace('{nth}', ordinal(count)),
    },
  });
  creature.deeds.push(event.id);
  return true;
}

/**
 * After a wrathful dragon's raid left the site under its `burnBelow`, the site may burn: part of
 * its people die, the rest flee, and it is left in ruin.
 */
export function burnAfterRaid(
  run: HistoryRun,
  creature: Creature,
  _def: CreatureDef,
  site: Site,
  raid: Id,
): void {
  const temper = temperOf(run, creature);
  const state = creature.dragon;
  if (!state || temper.burnBelow <= 0 || totalPop(site) >= temper.burnBelow) return;
  if (state.burned !== undefined && run.year - state.burned < temper.burnGap) return;
  if (!run.rng.dragons.chance(temper.burnChance)) return;
  state.burned = run.year;
  const { world } = run;
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const refuge = findRefuge(run, site);
  const dead = ruinSite(run, site, run.rng.dragons);
  const event = run.emit({
    type: 'dragon_burned',
    place: site.cell,
    causes: [raid],
    data: { beast: creature.name, site: site.name, civ: civ?.name ?? '', dead },
  });
  creature.deeds.push(event.id);
  if (civ) civLosesSite(run, civ, site, event.id);
  const home = civ && civ.fell === undefined ? world.sites.get(civ.capital) : undefined;
  relocateNotables(run, site, refuge ?? home);
}

// --- the hoard ----------------------------------------------------------------------------------

/** What a hoarding beast killed: the dead figure's items go to the hoard, lost to everyone else. */
export function hoardItems(run: HistoryRun, dead: Person, beast: Creature, deathEvent: Id): void {
  if (!hoards(run, beast)) return;
  const list = hoardListOf(beast);
  const lair = beast.dragon?.lairName ?? `the lair of ${beast.name}`;
  for (const item of itemsHeldBy(run, dead)) {
    item.holder = null;
    item.lostAt = beast.lair;
    list.push(item.id);
    const event = run.emit({
      type: 'item_hoarded',
      place: beast.lair,
      actors: [dead.id],
      causes: [deathEvent, ...item.deeds.slice(-1)],
      data: { item: item.name, from: dead.name, beast: beast.name, lair },
    });
    item.deeds.push(event.id);
  }
}

/**
 * The slayer of a hoarding beast carries its hoard home: the treasures become theirs and, for a
 * dragon, their home gains grain for the tribute and plunder (never past its stores limit). A
 * no-op for an ordinary beast, an empty hoard, or a slain-by-nobody beast.
 */
export function claimHoard(
  run: HistoryRun,
  dragon: Creature,
  claimant: Person | undefined,
  slainEvent: Id,
): void {
  const state = dragon.dragon;
  if (!claimant || !hoards(run, dragon)) return;
  const rules = run.content.dragons;
  const spoils = state ? state.hoard.tribute + state.hoard.plunder : 0;
  const items = hoardListOf(dragon).flatMap((id) => {
    const item = run.world.items.get(id);
    return item && item.holder === null ? [item] : [];
  });
  if (spoils === 0 && items.length === 0) return;
  const site = claimant.siteId == null ? undefined : run.world.sites.get(claimant.siteId);
  const home = site && isLive(site) ? site : undefined;
  if (home && spoils > 0) {
    const cap = run.rules.storesCapYears * siteNeed(home, run.races);
    home.goods.food = Math.max(
      home.goods.food,
      Math.min(cap, home.goods.food + rules.grainPerSpoil * spoils),
    );
  }
  const civ = claimant.civId == null ? undefined : run.world.civs.get(claimant.civId);
  const event = run.emit({
    type: 'dragon_hoard_claimed',
    place: home?.cell ?? dragon.lair,
    actors: [claimant.id],
    causes: [slainEvent],
    data: {
      name: claimant.name,
      beast: dragon.name,
      site: home?.name ?? NO_NEAR,
      civ: civ?.name ?? '',
      items: items.length > 0 ? nameList(items.map((i) => i.name)) : rules.spoilsWord,
    },
  });
  dragon.deeds.push(event.id);
  addDeed(claimant, event.id);
  for (const item of items) {
    item.holder = claimant.id;
    delete item.lostAt;
    item.deeds.push(event.id);
  }
}

// --- seekers ------------------------------------------------------------------------------------

/** "a hoard of 12 tributes and 3 treasures" (kinds with none are left out). */
function hoardPhrase(run: HistoryRun, creature: Creature): string {
  const { hoard } = creature.dragon!;
  const words = run.content.dragons.hoardWords;
  const parts = (
    [
      [hoard.tribute, words.tribute],
      [hoard.plunder, words.plunder],
      [hoard.items.length, words.treasure],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, [one, many]]) => `${n} ${n === 1 ? one : many}`);
  return `a hoard of ${nameList(parts)}`;
}

/**
 * The figure who rides for the hoard: a legend first, then a figure of exceptional power, then a
 * hero; within a rank the strongest (soldier equivalent, then fame), ties by lowest id. They must
 * be an adult and no elder, with a live home within `seekerRange` of the lair and no deed this year.
 */
function pickSeeker(run: HistoryRun, dragon: Creature): Person | undefined {
  const rules = run.content.dragons;
  let best: Person | undefined;
  let bestRank = Infinity;
  let bestScore = -1;
  for (const person of livingList(run)) {
    const rank = isLegend(person)
      ? 0
      : person.magic.power >= TIERS.exceptional.minPower
        ? 1
        : person.title === 'hero'
          ? 2
          : -1;
    if (rank < 0 || !isAdult(run, person) || isElder(run, person)) continue;
    if (run.notables.lastDeed.get(person.id) === run.year) continue;
    const home = person.siteId == null ? undefined : run.world.sites.get(person.siteId);
    const civ = person.civId == null ? undefined : run.world.civs.get(person.civId);
    if (!home || !isLive(home) || !civ || civ.fell !== undefined) continue;
    if (cellDistance(run.cells.width, home.cell, dragon.lair) > rules.seekerRange) continue;
    const score = deedSoldiers(run, person) * 1000 + person.fame;
    if (rank < bestRank || (rank === bestRank && score > bestScore)) {
      best = person;
      bestRank = rank;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Yearly, once per living dragon: the richer its hoard, the likelier a seeker sets out. They fight
 * as an idle legend hunting it would (`fightHunt`); a win claims the hoard, a loss may cost their
 * life and their items to the hoard.
 */
export function runDragonQuests(run: HistoryRun): void {
  const def = dragonDef(run);
  if (!def) return;
  const rules = run.content.dragons;
  for (const dragon of livingCreatures(run)) {
    const state = dragon.dragon;
    if (!state) continue;
    const value =
      state.hoard.tribute + state.hoard.plunder + rules.treasureValue * state.hoard.items.length;
    if (!run.rng.dragons.chance(Math.min(rules.seekerMax, rules.seekerPerHoard * value))) continue;
    const seeker = pickSeeker(run, dragon);
    const home = seeker?.siteId == null ? undefined : run.world.sites.get(seeker.siteId);
    const civ = seeker?.civId == null ? undefined : run.world.civs.get(seeker.civId);
    if (!seeker || !home || !civ) continue;
    const quest = run.emit({
      type: 'dragon_quest',
      place: home.cell,
      actors: [seeker.id],
      causes: lastDeed(dragon),
      data: {
        name: seeker.name,
        beast: dragon.name,
        site: home.name,
        civ: civ.name,
        hoard: hoardPhrase(run, dragon),
      },
    });
    dragon.deeds.push(quest.id);
    addDeed(seeker, quest.id);
    fightHunt(run, seeker, dragon, def, home, civ, quest.id);
  }
}
