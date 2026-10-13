// Beasts (M2.4): lairs appear in wild land, creatures raid the nearest site in range, and the
// raided people sometimes kill them. Lairs are cells, not sites.

import { cultureGivenName } from '../people/names';
import type { CreatureDef } from '../core/content-types';
import type { Creature, Id, Site } from '../core/types';
import {
  beastRaidDeaths,
  createHero,
  creditSlaying,
  deedSoldiers,
  idleLegends,
  killNotable,
  markDeed,
  slayerFor,
} from './notables';
import { addDeed } from './people';
import { bandCount, removePeople, stochasticRound, totalPop } from './pop';
import { cellDistance } from './settle';
import { causesOf, civName, cultureOf, isLive, liveSites, logOf, type HistoryRun } from './state';

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

/**
 * A name no beast has had: the rolled template, else the kind's other templates in order, else the
 * rolled one with the next free ordinal ("Cawr of Mariuk the Second"). A reader takes a beast's
 * name as who it is, so a dead beast's name never walks again.
 */
function freshName(run: HistoryRun, def: CreatureDef, rolled: string, near: string): string {
  const used = new Set<string>();
  for (const creature of run.world.creatures.values()) used.add(creature.name);
  const fill = (template: string) => template.replace('{near}', near);
  for (const template of [rolled, ...def.names])
    if (!used.has(fill(template))) return fill(template);
  const base = fill(rolled);
  for (const ordinal of run.rules.beastNameOrdinals) {
    const name = `${base} ${ordinal}`;
    if (!used.has(name)) return name;
  }
  for (let n = run.rules.beastNameOrdinals.length + 2; ; n += 1)
    if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

function spawn(run: HistoryRun, def: CreatureDef): void {
  const { world, rng } = run;
  const name = rng.beasts.pick(def.names);
  const lifespan = rng.beasts.between(def.lifespan[0], def.lifespan[1]);
  const lair = findLair(run, def);
  if (lair < 0) return;
  const near = nearestSite(run, lair, Infinity)?.name ?? NO_NEAR;
  const beastName = freshName(run, def, name, near);
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

/** " at {site}", unless the beast's own name already says where it is from. */
function atSite(creature: Creature, site: Site): string {
  return creature.name.includes(site.name) ? '' : ` at ${site.name}`;
}

/**
 * The raided site may kill the beast; returns true if it did. The strongest figure of its people
 * nearby leads the fight and adds their soldier equivalent; without one, a new hero rises.
 */
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
  // A figure rides out only when the town is outmatched; ordinary beasts still make new heroes.
  const slayer = bandCount(site, 'adult') < need ? slayerFor(run, site) : undefined;
  const fighters = bandCount(site, 'adult') + (slayer ? deedSoldiers(run, slayer) : 0);
  const strength = Math.min(1, fighters / need);
  const chance = rules.slayBase * strength * rules.slayTierFactor[def.tier];
  if (!rng.beasts.chance(chance)) return false;
  const hero = slayer ? slayer.name : cultureGivenName(culture.names, rng.names);
  creature.died = run.year;
  creature.slainBy = hero;
  const notable = slayer ?? createHero(run, site, hero, def.danger);
  const event = run.emit({
    type: 'beast_slain',
    place: creature.lair,
    actors: notable ? [notable.id] : [],
    causes: [raid],
    data: {
      hero,
      beast: creature.name,
      kind: def.name,
      site: site.name,
      civ: civ.name,
      at: atSite(creature, site),
    },
  });
  if (notable) {
    creature.slayerId = notable.id;
    if (slayer) creditSlaying(run, slayer, def.danger, event.id);
    else addDeed(notable, event.id);
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

/**
 * Idle legends go hunting: each takes on the nearest living beast within `huntRange` of home, alone,
 * with their soldier equivalent against the beast's danger (the slay odds of a raided town). A
 * failed hunt may cost their life (`beastKill`).
 */
function runHunts(run: HistoryRun): void {
  const { rules, rng, world } = run;
  const deeds = run.content.notables.deeds;
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const legend of idleLegends(run)) {
    const home = legend.siteId == null ? undefined : world.sites.get(legend.siteId);
    const civ = legend.civId == null ? undefined : world.civs.get(legend.civId);
    if (!home || !isLive(home) || !civ || civ.fell !== undefined) continue;
    let prey: Creature | undefined;
    let best = Infinity;
    for (const creature of livingCreatures(run)) {
      const distance = cellDistance(run.cells.width, home.cell, creature.lair);
      if (distance <= deeds.huntRange && distance < best) {
        prey = creature;
        best = distance;
      }
    }
    const def = prey ? defs.get(prey.defId) : undefined;
    if (!prey || !def) continue;
    markDeed(run, legend);
    const need = def.danger * rules.slayAdultsPerDanger;
    const strength = Math.min(1, deedSoldiers(run, legend) / need);
    const near = nearestSite(run, prey.lair, Infinity) ?? home;
    if (rng.beasts.chance(rules.slayBase * strength * rules.slayTierFactor[def.tier])) {
      prey.died = run.year;
      prey.slainBy = legend.name;
      prey.slayerId = legend.id;
      const event = run.emit({
        type: 'beast_slain',
        place: prey.lair,
        actors: [legend.id],
        causes: causesOf(prey.deeds[prey.deeds.length - 1]),
        data: {
          hero: legend.name,
          beast: prey.name,
          kind: def.name,
          site: home.name,
          civ: civ.name,
          at: atSite(prey, near).replace(' at ', ' near '),
        },
      });
      prey.deeds.push(event.id);
      creditSlaying(run, legend, def.danger, event.id);
      continue;
    }
    const dies = rng.beasts.chance(run.content.notables.beastKill);
    const event = run.emit({
      type: 'beast_hunt_failed',
      place: prey.lair,
      actors: [legend.id],
      causes: legend.deeds.slice(-1),
      data: {
        name: legend.name,
        beast: prey.name,
        kind: def.name,
        site: home.name,
        civ: civ.name,
        outcome: dies ? deeds.huntPhrases.died : deeds.huntPhrases.survived,
      },
    });
    prey.deeds.push(event.id);
    addDeed(legend, event.id);
    if (dies) killNotable(run, legend, { cause: 'beast', causes: [event.id] });
  }
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
  runHunts(run);
}
