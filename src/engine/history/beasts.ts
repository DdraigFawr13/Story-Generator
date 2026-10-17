// Beasts (M2.4): lairs appear in wild land, creatures raid the nearest site in range, and the
// raided people sometimes kill them. Lairs are cells, not sites. Some kinds roam: they raid and are
// hunted from a haunt that shifts within `roam` of the lair. A beast that wins a fight may kill the
// figure who faced it, the likelier the weaker they are; the death shows in both histories.

import { cultureGivenName } from '../people/names';
import type { CreatureDef } from '../core/content-types';
import type { RngStream } from '../core/rng';
import type { Civ, Creature, Id, Person, Site } from '../core/types';
import {
  beastKillChance,
  beastRaidDeaths,
  createHero,
  creditSlaying,
  deedSoldiers,
  idleLegends,
  killNotable,
  markDeed,
  slayerFor,
} from './notables';
import {
  askTribute,
  burnAfterRaid,
  claimHoard,
  dragonAwake,
  raidFactor,
  runDragonQuests,
  wakeDragon,
} from './dragons';
import {
  courtRaidFactor,
  dragonSpares,
  noteDragonHarm,
  runDragonCourt,
  unleashDragon,
} from './dragon-court';
import { addDeed } from './people';
import { beastParts, carryOff, lairAbandoned } from './places';
import { bandCount, removePeople, stochasticRound, totalPop } from './pop';
import { cellDistance } from './settle';
import { causesOf, civName, cultureOf, isLive, liveSites, logOf, type HistoryRun } from './state';

/** Years between spawn rolls. */
const DECADE = 10;
/** Cells tried when a roaming beast looks for a new haunt. */
const ROAM_TRIES = 6;
/** Stand-in for the nearest site when a world has none. */
export const NO_NEAR = 'the wilds';

/** The stream a creature's own rolls draw from: a dragon's, so it shifts no other beast's. */
export function beastRng(run: HistoryRun, creature: Creature): RngStream {
  return creature.dragon ? run.rng.dragons : run.rng.beasts;
}

/** Where a beast is this year: its haunt if it roams, else its lair. */
export function whereIs(creature: Creature): number {
  return creature.haunt ?? creature.lair;
}

/** Living creatures in id order. */
export function livingCreatures(run: HistoryRun): Creature[] {
  const out: Creature[] = [];
  for (const creature of run.world.creatures.values())
    if (creature.died === undefined) out.push(creature);
  return out;
}

/** The nearest live site to a cell within `range` (Chebyshev), ties by lowest id. */
export function nearestSite(
  run: HistoryRun,
  cell: number,
  range: number,
  allowed: (site: Site) => boolean = () => true,
): Site | undefined {
  let best: Site | undefined;
  let bestDistance = Infinity;
  for (const site of liveSites(run)) {
    if (!allowed(site)) continue;
    const distance = cellDistance(run.cells.width, cell, site.cell);
    if (distance <= range && distance < bestDistance) {
      best = site;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * A free lair cell for the def among `beastSpawnTries` random land cells, or -1. `anyBiome` drops
 * the biome list (wildness and spacing still hold).
 */
export function findLair(
  run: HistoryRun,
  def: CreatureDef,
  rng: RngStream = run.rng.beasts,
  anyBiome = false,
  allowed: (cell: number) => boolean = () => true,
): number {
  const { cells, rules, content } = run;
  const size = cells.width * cells.height;
  const taken = new Set<number>();
  for (const c of livingCreatures(run)) taken.add(c.lair);
  const live = liveSites(run);
  let found = -1;
  // Every try is drawn, so the stream advances the same however early a lair is found.
  for (let tries = 0; tries < rules.beastSpawnTries; tries += 1) {
    const cell = rng.int(size);
    if (found >= 0 || cells.water[cell] !== 0 || taken.has(cell)) continue;
    if (!anyBiome && !def.biomes.includes(content.biomes[cells.biome[cell]!]?.id ?? '')) continue;
    if (cells.wildness[cell]! < def.minWildness) continue;
    const crowded = live.some((s) => cellDistance(cells.width, cell, s.cell) <= rules.lairSpacing);
    if (!crowded && allowed(cell)) found = cell;
  }
  return found;
}

/**
 * A name no beast has had: the rolled template, else the kind's other templates in order, else the
 * rolled one with the next free ordinal ("Cawr of Mariuk the Second"). A reader takes a beast's
 * name as who it is, so a dead beast's name never walks again.
 */
export function freshName(run: HistoryRun, def: CreatureDef, rolled: string, near: string): string {
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
    // The dragon wakes by its own rules (dragons.ts), not by the decade's roll.
    if (def.id === run.content.dragons.creatureId) continue;
    const free = def.maxAlive - alive.filter((c) => c.defId === def.id).length;
    for (let slot = 0; slot < free; slot += 1) {
      if (run.rng.beasts.chance(def.spawnChance)) spawn(run, def);
    }
  }
}

/** " at {site}", unless the beast's own name already says where it is from. */
export function atSite(creature: Creature, site: Site): string {
  return creature.name.includes(site.name) ? '' : ` at ${site.name}`;
}

/** Per run: the towns each beast's roaming was told at, and the figures who already fought it. */
const memory = new WeakMap<HistoryRun, Map<string, Set<Id>>>();
/** True the first time `key` is seen for this beast in this run, so a story is told once. */
function firstTime(run: HistoryRun, creature: Creature, kind: string, key: Id): boolean {
  let byBeast = memory.get(run);
  if (!byBeast) memory.set(run, (byBeast = new Map()));
  const slot = `${creature.id}:${kind}`;
  let seen = byBeast.get(slot);
  if (!seen) byBeast.set(slot, (seen = new Set()));
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

/** A dragon's slaying outranks an ordinary beast's. */
function slainBonus(run: HistoryRun, creature: Creature): { importanceBonus?: number } {
  return creature.dragon ? { importanceBonus: run.content.dragons.slainImportance } : {};
}

/** Rounded numbers a fight was settled on, kept on the event for its play-by-play. */
export function fightData(fighters: number, def: CreatureDef, chance: number) {
  return { fighters: Math.round(fighters), danger: def.danger, odds: Math.round(chance * 100) };
}

/**
 * The raided site may kill the beast; returns true if it did. The strongest figure of its people
 * nearby leads the fight and adds their soldier equivalent; without one, a new hero rises. A figure
 * who rode out and lost may be killed.
 */
function trySlay(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  site: Site,
  raid: Id,
): boolean {
  const { rules, world } = run;
  const rng = beastRng(run, creature);
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const culture = civ ? cultureOf(run, civ) : undefined;
  if (!civ || !culture) return false;
  const need = def.danger * rules.slayAdultsPerDanger;
  // A figure rides out only when the town is outmatched; ordinary beasts still make new heroes.
  const slayer = bandCount(site, 'adult') < need ? slayerFor(run, site) : undefined;
  const fighters = bandCount(site, 'adult') + (slayer ? deedSoldiers(run, slayer) : 0);
  const strength = Math.min(1, fighters / need);
  const chance = rules.slayBase * strength * rules.slayTierFactor[def.tier];
  if (!rng.chance(chance)) {
    if (slayer)
      answerLost(run, creature, def, slayer, site, raid, fightData(fighters, def, chance));
    return false;
  }
  const hero = slayer ? slayer.name : cultureGivenName(culture.names, run.rng.names);
  creature.died = run.year;
  creature.slainBy = hero;
  const notable = slayer ?? createHero(run, site, hero, def.danger);
  const event = run.emit({
    type: 'beast_slain',
    ...slainBonus(run, creature),
    place: whereIs(creature),
    actors: notable ? [notable.id] : [],
    causes: [raid],
    data: {
      hero,
      beast: creature.name,
      kind: def.name,
      site: site.name,
      civ: civ.name,
      at: atSite(creature, site),
      ...fightData(fighters, def, chance),
    },
  });
  creature.deeds.push(event.id);
  if (notable) {
    creature.slayerId = notable.id;
    if (slayer) creditSlaying(run, slayer, def.danger, event.id);
    else addDeed(notable, event.id);
    claimHoard(run, creature, notable, event.id);
    beastParts(run, def, creature, notable, site, event.id);
  }
  return true;
}

/** A figure who rode out against a raiding beast lost: driven back, or killed (`beastKillChance`). */
function answerLost(
  run: HistoryRun,
  creature: Creature,
  def: CreatureDef,
  figure: Person,
  site: Site,
  raid: Id,
  fight: ReturnType<typeof fightData>,
): void {
  const phrases = run.content.notables.deeds.answerPhrases;
  const dies = beastRng(run, creature).chance(beastKillChance(run, figure, def.danger));
  markDeed(run, figure);
  // A figure beaten again by the same beast is not news; a death always is.
  if (!firstTime(run, creature, 'fought', figure.id) && !dies) return;
  const event = run.emit({
    type: 'beast_fought',
    place: site.cell,
    actors: [figure.id],
    causes: [raid],
    data: {
      name: figure.name,
      beast: creature.name,
      kind: def.name,
      site: site.name,
      civ: civName(run, site),
      outcome: dies ? phrases.died : phrases.survived,
      ...fight,
    },
  });
  creature.deeds.push(event.id);
  addDeed(figure, event.id);
  if (dies)
    killNotable(run, figure, {
      cause: 'beast',
      causes: [event.id],
      at: site,
      beast: creature,
      fought: true,
    });
}

function raid(run: HistoryRun, creature: Creature, def: CreatureDef): void {
  const { rules } = run;
  const rng = beastRng(run, creature);
  // A dragon spares the towns of a realm in pact with it or courting it, and a courted one may be
  // loosed on the courter's enemy instead.
  const unleashed = creature.dragon ? unleashDragon(run, creature) : undefined;
  const site =
    unleashed?.site ??
    nearestSite(
      run,
      whereIs(creature),
      def.raidRange,
      creature.dragon ? dragonSpares(run, creature) : undefined,
    );
  if (!site) return;
  // A dragon of greedy temper is paid off, unless a legend of the town will not pay.
  if (!unleashed && creature.dragon && askTribute(run, creature, def, site)) return;
  const factor = rng.between(500, 1500) / 1000;
  const pop = totalPop(site);
  const wanted = Math.min(pop * rules.raidKillCap, def.danger * rules.raidKillPerDanger * factor);
  const dead = removePeople(site, stochasticRound(rng, wanted), ['adult', 'child', 'elder']);
  site.goods.food *= 1 - rules.raidStoresLoss;
  const event = run.emit({
    type: 'beast_raid',
    place: site.cell,
    causes: causesOf(unleashed?.event ?? creature.deeds[creature.deeds.length - 1]),
    data: { beast: creature.name, site: site.name, civ: civName(run, site), dead },
  });
  creature.deeds.push(event.id);
  noteDragonHarm(run, creature, site.civId, event.id);
  logOf(run, site.id).raided = { year: run.year, event: event.id };
  beastRaidDeaths(run, site, event.id, creature, def.danger);
  carryOff(run, creature, def, site, event.id);
  if (creature.dragon) creature.dragon.hoard.plunder += 1;
  if (!trySlay(run, creature, def, site, event.id) && creature.dragon)
    burnAfterRaid(run, creature, def, site, event.id);
}

/**
 * A figure of `home` takes on `prey` alone, with their soldier equivalent against its danger (the
 * slay odds of a raided town). A win ends the beast; a failed hunt may cost their life
 * (`beastKillChance`), and a dragon's hoard takes what they carried. `cause` is the event that
 * sent them out (default: the beast's latest deed for a win, their own for a loss). A bounty's
 * hunter brings `aid` soldiers lent by the payer and `odds` times the slay chance.
 */
export function fightHunt(
  run: HistoryRun,
  hunter: Person,
  prey: Creature,
  def: CreatureDef,
  home: Site,
  civ: Civ,
  cause?: Id,
  aid = 0,
  odds = 1,
): void {
  const { rules } = run;
  const rng = beastRng(run, prey);
  const deeds = run.content.notables.deeds;
  markDeed(run, hunter);
  const need = def.danger * rules.slayAdultsPerDanger;
  const soldiers = deedSoldiers(run, hunter) + aid;
  const strength = Math.min(1, soldiers / need);
  const near = nearestSite(run, whereIs(prey), Infinity) ?? home;
  const chance = Math.min(1, rules.slayBase * strength * rules.slayTierFactor[def.tier] * odds);
  if (rng.chance(chance)) {
    prey.died = run.year;
    prey.slainBy = hunter.name;
    prey.slayerId = hunter.id;
    const event = run.emit({
      type: 'beast_slain',
      ...slainBonus(run, prey),
      place: whereIs(prey),
      actors: [hunter.id],
      causes: causesOf(cause ?? prey.deeds[prey.deeds.length - 1]),
      data: {
        hero: hunter.name,
        beast: prey.name,
        kind: def.name,
        site: home.name,
        civ: civ.name,
        at: atSite(prey, near).replace(' at ', ' near '),
        hunt: 1,
        ...fightData(soldiers, def, chance),
      },
    });
    prey.deeds.push(event.id);
    creditSlaying(run, hunter, def.danger, event.id);
    claimHoard(run, prey, hunter, event.id);
    beastParts(run, def, prey, hunter, home, event.id);
    return;
  }
  const dies = rng.chance(beastKillChance(run, hunter, def.danger, aid));
  const event = run.emit({
    type: 'beast_hunt_failed',
    place: whereIs(prey),
    actors: [hunter.id],
    causes: cause === undefined ? hunter.deeds.slice(-1) : [cause],
    data: {
      name: hunter.name,
      beast: prey.name,
      kind: def.name,
      site: home.name,
      civ: civ.name,
      outcome: dies ? deeds.huntPhrases.died : deeds.huntPhrases.survived,
      ...fightData(soldiers, def, chance),
    },
  });
  prey.deeds.push(event.id);
  addDeed(hunter, event.id);
  if (dies)
    killNotable(run, hunter, { cause: 'beast', causes: [event.id], beast: prey, fought: true });
}

/** Idle legends go hunting: each takes on the nearest living beast within `huntRange` of home. */
function runHunts(run: HistoryRun): void {
  const { world } = run;
  const deeds = run.content.notables.deeds;
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const legend of idleLegends(run)) {
    const home = legend.siteId == null ? undefined : world.sites.get(legend.siteId);
    const civ = legend.civId == null ? undefined : world.civs.get(legend.civId);
    if (!home || !isLive(home) || !civ || civ.fell !== undefined) continue;
    let prey: Creature | undefined;
    let best = Infinity;
    for (const creature of livingCreatures(run)) {
      const distance = cellDistance(run.cells.width, home.cell, whereIs(creature));
      if (distance <= deeds.huntRange && distance < best) {
        prey = creature;
        best = distance;
      }
    }
    const def = prey ? defs.get(prey.defId) : undefined;
    if (!prey || !def) continue;
    fightHunt(run, legend, prey, def, home, civ);
  }
}

/** The compass word for a move of (dx, dy), y growing southward. */
function compass(run: HistoryRun, dx: number, dy: number): string {
  const words = run.content.threats.compass;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let at: number;
  if (ay * 2 <= ax) at = dx > 0 ? 2 : 6;
  else if (ax * 2 <= ay) at = dy > 0 ? 4 : 0;
  else if (dx > 0) at = dy < 0 ? 1 : 3;
  else at = dy > 0 ? 5 : 7;
  return words[at]!;
}

/**
 * A roaming beast may shift its haunt to a dry cell within `roam` of its lair. When that brings a
 * different town nearest for the first time, the land hears of it (`beast_roamed`).
 */
function roam(run: HistoryRun, creature: Creature, def: CreatureDef): void {
  const range = def.roam ?? 0;
  const rng = beastRng(run, creature);
  if (range <= 0 || !rng.chance(run.rules.beastRoamChance)) return;
  const { width, height, water } = run.cells;
  const lairX = creature.lair % width;
  const lairY = Math.floor(creature.lair / width);
  let to = -1;
  // A fixed number of draws, so the stream advances the same however early a cell is found.
  for (let tries = 0; tries < ROAM_TRIES; tries += 1) {
    const x = lairX + rng.between(-range, range);
    const y = lairY + rng.between(-range, range);
    if (to >= 0 || x < 0 || y < 0 || x >= width || y >= height) continue;
    if (water[y * width + x] === 0) to = y * width + x;
  }
  if (to < 0 || to === whereIs(creature)) return;
  const from = whereIs(creature);
  const before = nearestSite(run, from, def.raidRange);
  creature.haunt = to;
  const after = nearestSite(run, to, def.raidRange);
  if (!after || after.id === before?.id || !run.rules.beastRoamNoticed.includes(def.tier)) return;
  // Told once per town: a beast wandering back to old ground is not news.
  if (!firstTime(run, creature, 'roamed', after.id)) return;
  const event = run.emit({
    type: 'beast_roamed',
    place: to,
    causes: causesOf(creature.deeds[creature.deeds.length - 1]),
    data: {
      beast: creature.name,
      kind: def.name,
      site: after.name,
      civ: civName(run, after),
      dir: compass(
        run,
        (to % width) - (from % width),
        Math.floor(to / width) - Math.floor(from / width),
      ),
    },
  });
  creature.deeds.push(event.id);
}

/** Yearly: new lairs, old age, wandering, raids and the answers to them. */
export function runBeasts(run: HistoryRun): void {
  runSpawns(run);
  wakeDragon(run);
  const defs = new Map(run.content.creatures.map((d) => [d.id, d]));
  for (const creature of livingCreatures(run)) {
    const def = defs.get(creature.defId);
    if (!def) continue;
    if (run.year - creature.born >= creature.lifespan) {
      creature.died = run.year;
      lairAbandoned(run, creature, def);
      continue;
    }
    // A sleeping dragon neither roams nor raids; its temper sets how often it raids (dragons.ts).
    if (creature.dragon && !dragonAwake(run, creature)) continue;
    roam(run, creature, def);
    // One draw per beast per year, whether or not a site is in range.
    // A courted dragon is loosed on the courter's enemies more often than it raids of itself.
    const chance =
      def.raidChance *
      (creature.dragon ? raidFactor(run, creature) * courtRaidFactor(run, creature) : 1);
    if (beastRng(run, creature).chance(chance)) raid(run, creature, def);
  }
  runHunts(run);
  runDragonQuests(run);
  runDragonCourt(run);
}
