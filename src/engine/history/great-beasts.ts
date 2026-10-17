// Great beasts as individuals: the boar, afanc, wyvern, giant and water horse get a given name, a
// temper and a lair name. A savage one raids often, a vengeful one holds a grudge against a town
// that fought it and failed, a toll-taker is paid in food. The restless dead of a robbed barrow
// are named for the ruler buried there, walk toward the robbers, and rest when the robbers fall or
// the priests lay them down. Every roll here comes from the `greatBeasts` stream.

import type { CreatureDef, GreatBeastKind, GreatBeastTemper } from '../core/content-types';
import type { Creature, GreatBeastState, Id, Person, Site } from '../core/types';
import { freshName, nearestSite, whereIs } from './beasts';
import { ordinal, placePhrase } from './dragons';
import { priestPhrase, siteFaith } from './faith';
import { markDeed } from './notables';
import { addDeed, livingPerson } from './people';
import { cellDistance } from './settle';
import { causesOf, civName, isLive, type HistoryRun } from './state';

/** Per run: how many tolls each beast took from each site. */
const paid = new WeakMap<HistoryRun, Map<Id, Map<Id, number>>>();

const lastDeed = (creature: Creature) => causesOf(creature.deeds[creature.deeds.length - 1]);

/** The covered kind for this creature entry, if it is one. */
export function greatKind(run: HistoryRun, def: CreatureDef): GreatBeastKind | undefined {
  return run.content.greatBeasts.kinds.find((k) => k.creatureId === def.id);
}

function temperOf(run: HistoryRun, creature: Creature): GreatBeastTemper | undefined {
  return run.content.greatBeasts.tempers.find((t) => t.id === creature.great?.temper);
}

/**
 * A given name no great beast has had (the rolled one, else the kind's others in order), else the
 * rolled one with a free ordinal. Returns the given name and the full name.
 */
function freshGiven(
  run: HistoryRun,
  kind: GreatBeastKind,
  rolled: string,
  epithet: string,
): [string, string] {
  const used = new Set<string>();
  const givens = new Set<string>();
  for (const creature of run.world.creatures.values()) {
    used.add(creature.name);
    if (creature.great) givens.add(creature.great.given);
  }
  for (const given of [rolled, ...kind.names])
    if (!givens.has(given) && !used.has(`${given} ${epithet}`))
      return [given, `${given} ${epithet}`];
  const base = `${rolled} ${epithet}`;
  for (const word of run.rules.beastNameOrdinals)
    if (!used.has(`${base} ${word}`)) return [rolled, `${base} ${word}`];
  for (let n = run.rules.beastNameOrdinals.length + 2; ; n += 1)
    if (!used.has(`${base} ${n}`)) return [rolled, `${base} ${n}`];
}

/** What a new great beast of a covered kind is: its full name, its state and the appearance event's data. */
export function appearance(
  run: HistoryRun,
  def: CreatureDef,
  kind: GreatBeastKind,
  lair: number,
  near: string,
): { name: string; great: GreatBeastState; data: Record<string, string> } {
  const rules = run.content.greatBeasts;
  const rng = run.rng.greatBeasts;
  const rolled = rng.pick(kind.names);
  let pick = rng.between(
    1,
    kind.tempers.reduce((sum, t) => sum + t.weight, 0),
  );
  let chosen = kind.tempers[kind.tempers.length - 1]!;
  for (const t of kind.tempers) {
    if (pick <= t.weight) {
      chosen = t;
      break;
    }
    pick -= t.weight;
  }
  const temper = rules.tempers.find((t) => t.id === chosen.id) ?? rules.tempers[0]!;
  const [given, name] = freshGiven(run, kind, rolled, temper.epithet);
  const lairName = rng.pick(kind.lairNames).replace('{name}', given);
  return {
    name,
    great: { given, temper: temper.id, lairName, tolls: 0, tollFrom: [] },
    data: {
      beast: name,
      kind: def.name,
      temper: temper.word,
      lair: lairName,
      placePhrase: placePhrase(run, lair, near),
      near,
    },
  };
}

// --- grudges and vengeance ----------------------------------------------------------------------

/** The site a vengeful beast's grudge still points at, if it is live and within the grudge range. */
function grudgeSite(run: HistoryRun, creature: Creature, def: CreatureDef): Site | undefined {
  const grudge = creature.great?.grudge;
  if (!grudge || grudge.until < run.year) return undefined;
  const site = run.world.sites.get(grudge.siteId);
  if (!site || !isLive(site)) return undefined;
  const reach = def.raidRange * run.content.greatBeasts.grudgeRangeFactor;
  return nearestSite(run, whereIs(creature), reach, (s) => s.id === site.id);
}

/** The nearest live town of the civ that robbed a host's barrow, within `range` cells of it. */
function robberSite(run: HistoryRun, creature: Creature, range: number): Site | undefined {
  const robbers = creature.dead?.robbers;
  if (robbers === undefined) return undefined;
  return nearestSite(run, whereIs(creature), range, (s) => s.civId === robbers);
}

/** Raid chance multiplier: a great beast's temper and live grudge, a host's pull toward its robbers. */
export function greatRaidFactor(run: HistoryRun, creature: Creature, def: CreatureDef): number {
  const rules = run.content.greatBeasts;
  let factor = temperOf(run, creature)?.raidFactor ?? 1;
  if (grudgeSite(run, creature, def)) factor *= rules.grudgeRaidFactor;
  if (creature.dead && robberSite(run, creature, rules.restless.vengeanceRange))
    factor *= rules.restless.vengeanceFactor;
  return factor;
}

/** The site a grudge-holding or vengeful host raids in place of the nearest, if any. */
export function raidTarget(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
): Site | undefined {
  if (creature.dead) return robberSite(run, creature, def.raidRange);
  return grudgeSite(run, creature, def);
}

/** A beast whose temper holds grudges remembers a town whose fight against it failed. */
export function noteGrudge(run: HistoryRun, creature: Creature, site: Site): void {
  const state = creature.great;
  if (!state || !temperOf(run, creature)?.grudge) return;
  state.grudge = { siteId: site.id, until: run.year + run.content.greatBeasts.grudgeYears };
}

/**
 * The first raid under a grudge is told: returns the `great_beast_grudge` event's id for the raid
 * to cite, or undefined when the raid is not on the grudge town or the grudge was told already.
 */
export function tellGrudge(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
): Id | undefined {
  const grudge = creature.great?.grudge;
  if (!grudge || grudge.told || grudge.siteId !== site.id || grudge.until < run.year)
    return undefined;
  grudge.told = true;
  const event = run.emit({
    type: 'great_beast_grudge',
    place: whereIs(creature),
    causes: lastDeed(creature),
    data: { beast: creature.name, site: site.name, civ: civName(run, site), kind: def.name },
  });
  creature.deeds.push(event.id);
  return event.id;
}

// --- tolls --------------------------------------------------------------------------------------

/** A toll-taker about to raid may be paid instead; returns true if the site paid (no raid follows). */
export function askToll(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
): boolean {
  const state = creature.great;
  const kind = greatKind(run, def);
  if (!state || !kind || !temperOf(run, creature)?.toll) return false;
  const rules = run.content.greatBeasts;
  if (!run.rng.greatBeasts.chance(rules.tollPaid)) return false;
  site.goods.food *= 1 - rules.tollShare;
  state.tolls += 1;
  if (!state.tollFrom.includes(site.id)) state.tollFrom.push(site.id);
  let bySite = paid.get(run)?.get(creature.id);
  if (!bySite) {
    let byBeast = paid.get(run);
    if (!byBeast) paid.set(run, (byBeast = new Map()));
    byBeast.set(creature.id, (bySite = new Map()));
  }
  const count = (bySite.get(site.id) ?? 0) + 1;
  bySite.set(site.id, count);
  const event = run.emit({
    type: 'great_beast_toll',
    place: site.cell,
    causes: lastDeed(creature),
    data: {
      beast: creature.name,
      site: site.name,
      civ: civName(run, site),
      toll: kind.tollWord,
      again: count === 1 ? '' : rules.tollAgain.replace('{nth}', ordinal(count)),
    },
  });
  creature.deeds.push(event.id);
  return true;
}

// --- old age ------------------------------------------------------------------------------------

/** A named great beast dies of age: the land hears it (before its lair is left). */
export function greatBeastDied(run: HistoryRun, creature: Creature, def: CreatureDef): void {
  const state = creature.great;
  if (!state) return;
  const event = run.emit({
    type: 'great_beast_died',
    place: creature.lair,
    causes: lastDeed(creature),
    data: { beast: creature.name, kind: def.name, lair: state.lairName },
  });
  creature.deeds.push(event.id);
}

// --- the restless dead --------------------------------------------------------------------------

/**
 * A host's name: the buried ruler's, from a content template, never one a beast already had.
 * Without a ruler it takes an ordinary name (`plain`).
 */
export function restlessName(
  run: HistoryRun,
  def: CreatureDef,
  ruler: Person | undefined,
  plain: string,
  near: string,
): string {
  if (!ruler) return plain;
  const names = run.content.greatBeasts.restless.names.map((n) => n.replace('{ruler}', ruler.name));
  return freshName(run, { ...def, names }, run.rng.greatBeasts.pick(names), near);
}

/** A host ends: it lies down for good (no slayer). */
function lieDown(run: HistoryRun, creature: Creature, event: Id): void {
  creature.died = run.year;
  creature.deeds.push(event);
}

/**
 * A living host's year: it rests if its robbers have fallen or a faith's priests lay it down;
 * else it walks up to `walk` cells toward its robbers' nearest town. Returns true if it rested.
 */
export function runRestless(run: HistoryRun, creature: Creature): boolean {
  const state = creature.dead;
  if (!state) return false;
  const rules = run.content.greatBeasts.restless;
  const peril = run.world.places.get(state.placeId)?.name ?? creature.name;
  const robbers = state.robbers === undefined ? undefined : run.world.civs.get(state.robbers);
  if (robbers && robbers.fell !== undefined) {
    const event = run.emit({
      type: 'dead_rested',
      place: whereIs(creature),
      causes: lastDeed(creature),
      data: {
        beast: creature.name,
        peril,
        civ: robbers.name,
        how: rules.fallenPhrase.replace('{civ}', robbers.name),
      },
    });
    lieDown(run, creature, event.id);
    return true;
  }
  const holy = nearestSite(run, whereIs(creature), rules.layRange, (s) => !!siteFaith(run, s));
  if (holy && run.rng.greatBeasts.chance(rules.layChance)) {
    const faith = siteFaith(run, holy)!;
    // The high priest is named only when they live within reach; else "the priests of" do it.
    const high = livingPerson(run, faith.highPriestId);
    const home = high?.siteId == null ? undefined : run.world.sites.get(high.siteId);
    const near =
      home && cellDistance(run.cells.width, home.cell, whereIs(creature)) <= rules.layRange;
    const priest = near ? high : undefined;
    const event = run.emit({
      type: 'dead_laid_to_rest',
      place: whereIs(creature),
      actors: priest ? [priest.id] : [],
      causes: lastDeed(creature),
      data: {
        beast: creature.name,
        peril,
        priest: priestPhrase(run, faith, priest),
        faith: faith.name,
        site: holy.name,
      },
    });
    if (priest) {
      addDeed(priest, event.id);
      markDeed(run, priest);
    }
    lieDown(run, creature, event.id);
    return true;
  }
  walk(run, creature, rules.walk, rules.vengeanceRange);
  return false;
}

/** Up to `steps` cells (Chebyshev) toward the robbers' nearest town; a water cell stays where it is. */
function walk(run: HistoryRun, creature: Creature, steps: number, range: number): void {
  const target = robberSite(run, creature, range);
  if (!target) return;
  const { width, water } = run.cells;
  const from = whereIs(creature);
  const clamp = (n: number) => Math.max(-steps, Math.min(steps, n));
  const x = (from % width) + clamp((target.cell % width) - (from % width));
  const y =
    Math.floor(from / width) + clamp(Math.floor(target.cell / width) - Math.floor(from / width));
  const to = y * width + x;
  if (water[to] === 0) creature.haunt = to;
}
