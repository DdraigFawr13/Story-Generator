// Beasts (M2.4): lairs appear in wild land, creatures raid the nearest site in range, and the
// raided people sometimes kill them. Lairs are cells, not sites.

import { cultureGivenName } from '../people/names';
import type { CreatureDef } from '../core/content-types';
import type { Creature, Id, Site } from '../core/types';
import { beastRaidDeaths, createHero } from './notables';
import { addDeed } from './people';
import { bandCount, removePeople, stochasticRound, totalPop } from './pop';
import { cellDistance } from './settle';
import { causesOf, civName, cultureOf, liveSites, logOf, type HistoryRun } from './state';

/** Years between spawn rolls. */
const DECADE = 10;
/** Stand-in for the nearest site when a world has none. */
const NO_NEAR = 'the wilds';

/** Living creatures in id order. */
export function livingCreatures(run: HistoryRun): Creature[] {
  const out: Creature[] = [];
  for (const creature of run.world.creatures.values())
    if (creature.died === undefined) out.push(creature);
  return out;
}

/** The nearest live site to a cell within `range` (Chebyshev), ties by lowest id. */
export function nearestSite(run: HistoryRun, cell: number, range: number): Site | undefined {
  let best: Site | undefined;
  let bestDistance = Infinity;
  for (const site of liveSites(run)) {
    const distance = cellDistance(run.cells.width, cell, site.cell);
    if (distance <= range && distance < bestDistance) {
      best = site;
      bestDistance = distance;
    }
  }
  return best;
}

/** A free lair cell for the def among `beastSpawnTries` random land cells, or -1. */
function findLair(run: HistoryRun, def: CreatureDef): number {
  const { cells, rules, content } = run;
  const size = cells.width * cells.height;
  const taken = new Set<number>();
  for (const c of livingCreatures(run)) taken.add(c.lair);
  const live = liveSites(run);
  let found = -1;
  // Every try is drawn, so the stream advances the same however early a lair is found.
  for (let tries = 0; tries < rules.beastSpawnTries; tries += 1) {
    const cell = run.rng.beasts.int(size);
    if (found >= 0 || cells.water[cell] !== 0 || taken.has(cell)) continue;
    if (!def.biomes.includes(content.biomes[cells.biome[cell]!]?.id ?? '')) continue;
    if (cells.wildness[cell]! < def.minWildness) continue;
    const crowded = live.some((s) => cellDistance(cells.width, cell, s.cell) <= rules.lairSpacing);
    if (!crowded) found = cell;
  }
  return found;
}

function spawn(run: HistoryRun, def: CreatureDef): void {
  const { world, rng } = run;
  const name = rng.beasts.pick(def.names);
  const lifespan = rng.beasts.between(def.lifespan[0], def.lifespan[1]);
  const lair = findLair(run, def);
  if (lair < 0) return;
  const near = nearestSite(run, lair, Infinity)?.name ?? NO_NEAR;
  const beastName = name.replace('{near}', near);
  const id = world.nextId.creature;
  world.nextId.creature += 1;
  const event = run.emit({
    type: 'beast_appeared',
    place: lair,
    causes: [],
    data: { beast: beastName, kind: def.name, near },
  });
  world.creatures.set(id, {
    id,
    defId: def.id,
    name: beastName,
    lair,
    born: run.year,
    lifespan,
    deeds: [event.id],
  });
}

/** Each year divisible by ten (and the first), every free slot of every kind may fill. */
function runSpawns(run: HistoryRun): void {
  if (run.year !== 1 && run.year % DECADE !== 0) return;
  const alive = livingCreatures(run);
  for (const def of run.content.creatures) {
    const free = def.maxAlive - alive.filter((c) => c.defId === def.id).length;
    for (let slot = 0; slot < free; slot += 1) {
      if (run.rng.beasts.chance(def.spawnChance)) spawn(run, def);
    }
  }
}

/** The raided site may kill the beast; returns true if it did. */
function trySlay(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
  raid: Id,
): boolean {
  const { rules, rng, world } = run;
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const culture = civ ? cultureOf(run, civ) : undefined;
  if (!civ || !culture) return false;
  const need = def.danger * rules.slayAdultsPerDanger;
  const strength = Math.min(1, bandCount(site, 'adult') / need);
  const chance = rules.slayBase * strength * rules.slayTierFactor[def.tier];
  if (!rng.beasts.chance(chance)) return false;
  const hero = cultureGivenName(culture.names, rng.names);
  creature.died = run.year;
  creature.slainBy = hero;
  const notable = createHero(run, site, hero, def.danger);
  const event = run.emit({
    type: 'beast_slain',
    place: creature.lair,
    actors: notable ? [notable.id] : [],
    causes: [raid],
    data: { hero, beast: creature.name, kind: def.name, site: site.name, civ: civ.name },
  });
  if (notable) {
    creature.slayerId = notable.id;
    addDeed(notable, event.id);
  }
  return true;
}

function raid(run: HistoryRun, creature: Creature, def: CreatureDef): void {
  const { rules, rng } = run;
  const site = nearestSite(run, creature.lair, def.raidRange);
  if (!site) return;
  const factor = rng.beasts.between(500, 1500) / 1000;
  const pop = totalPop(site);
  const wanted = Math.min(pop * rules.raidKillCap, def.danger * rules.raidKillPerDanger * factor);
  const dead = removePeople(site, stochasticRound(rng.beasts, wanted), ['adult', 'child', 'elder']);
  site.goods.food *= 1 - rules.raidStoresLoss;
  const event = run.emit({
    type: 'beast_raid',
    place: site.cell,
    causes: causesOf(creature.deeds[creature.deeds.length - 1]),
    data: { beast: creature.name, site: site.name, civ: civName(run, site), dead },
  });
  creature.deeds.push(event.id);
  logOf(run, site.id).raided = { year: run.year, event: event.id };
  beastRaidDeaths(run, site, event.id);
  trySlay(run, creature, def, site, event.id);
}

/** Yearly: new lairs, old age, raids and the answers to them. */
export function runBeasts(run: HistoryRun): void {
  runSpawns(run);
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const creature of livingCreatures(run)) {
    const def = defs.get(creature.defId);
    if (!def) continue;
    if (run.year - creature.born >= creature.lifespan) {
      creature.died = run.year;
      continue;
    }
    // One draw per beast per year, whether or not a site is in range.
    if (run.rng.beasts.chance(def.raidChance)) raid(run, creature, def);
  }
}
