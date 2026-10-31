// Dragon at court: realms near a dragon deal with it. One that has taken harm from it may pay it a
// standing tribute (a pact) or put a price on its head; a figure who takes the price hunts it. A
// ruler at war may court a dragon near the enemy, and a dragon that accepts spares the courter and
// is loosed on the enemy's towns. Every step is an event linked to the harm or war behind it; every
// roll comes from the `dragonCourt` stream and every number from `content/dragons.ts`.

import type { CreatureDef } from '../core/content-types';
import { clamp } from '../core/math';
import type { Civ, Creature, Id, Person, Site } from '../core/types';
import { TIERS } from '../people/tiers';
import { fightHunt, livingCreatures, whereIs } from './beasts';
import { deedSoldiers, isLegend, rulerOf } from './notables';
import { FAME_MAX, addDeed, eventById, isAdult, isElder, livingList, livingPerson } from './people';
import { bandCount } from './pop';
import { cellDistance } from './settle';
import { addGrievance, atWar, causesOf, isLive, liveSites, type HistoryRun } from './state';
import { cultureValue } from './values';
import { temperData, tilt } from './tempers';

/** What one dragon's neighbours have done about it. */
interface Court {
  /** Events of harm each realm took from it. */
  harms: Map<Id, Id[]>;
  /** Realms paying it, with the pact event and the year of the last payment. */
  pacts: Map<Id, { event: Id; last: number }>;
  /** Realms with a price on it, with the bounty event. */
  bounties: Map<Id, Id>;
  /** The realm courting it, its ruler and the courtship event. */
  courtedBy?: { civ: Id; ruler: Id; event: Id };
}
interface CourtMemory {
  courts: Map<Id, Court>;
  /** The year each figure last took a bounty. */
  lastBounty: Map<Id, number>;
}
const memory = new WeakMap<HistoryRun, CourtMemory>();
function memoryOf(run: HistoryRun): CourtMemory {
  let mem = memory.get(run);
  if (!mem) memory.set(run, (mem = { courts: new Map(), lastBounty: new Map() }));
  return mem;
}
function courtOf(run: HistoryRun, dragon: Creature): Court {
  const { courts } = memoryOf(run);
  let court = courts.get(dragon.id);
  if (!court)
    courts.set(dragon.id, (court = { harms: new Map(), pacts: new Map(), bounties: new Map() }));
  return court;
}

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id == null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};
const capitalOf = (run: HistoryRun, civ: Civ): Site | undefined => run.world.sites.get(civ.capital);
const lastDeed = (creature: Creature) => causesOf(creature.deeds[creature.deeds.length - 1]);

/** A realm took harm from the dragon (a tribute paid, a raid, a burning, a refused courtship). */
export function noteDragonHarm(
  run: HistoryRun,
  dragon: Creature,
  civId: Id | null,
  event: Id,
): void {
  if (!dragon.dragon || civId === null) return;
  const harms = courtOf(run, dragon).harms;
  harms.set(civId, [...(harms.get(civId) ?? []), event]);
}

/** Sites a dragon spares: those of a realm in pact with it or courting it. */
export function dragonSpares(run: HistoryRun, dragon: Creature): (site: Site) => boolean {
  const court = courtOf(run, dragon);
  return (site) =>
    site.civId === null || !(court.pacts.has(site.civId) || court.courtedBy?.civ === site.civId);
}

/** The nearest live site within `courtRange` of the dragon of a realm at war with the courter. */
function enemyTarget(run: HistoryRun, dragon: Creature, courter: Civ): Site | undefined {
  const spares = dragonSpares(run, dragon);
  const reach = run.content.dragons.court.courtRange;
  const at = whereIs(dragon);
  let target: Site | undefined;
  let best = Infinity;
  for (const site of liveSites(run)) {
    const distance = cellDistance(run.cells.width, at, site.cell);
    if (distance > reach || distance >= best || !spares(site)) continue;
    if (!atWar(run, courter.id, site.civId)) continue;
    target = site;
    best = distance;
  }
  return target;
}

/** Raid chance multiplier: `unleashFactor` while the dragon's courter has an enemy town in reach. */
export function courtRaidFactor(run: HistoryRun, dragon: Creature): number {
  const by = memoryOf(run).courts.get(dragon.id)?.courtedBy;
  const courter = liveCiv(run, by?.civ);
  if (!by || !courter || !livingPerson(run, by.ruler)) return 1;
  return enemyTarget(run, dragon, courter) ? run.content.dragons.court.unleashFactor : 1;
}

/**
 * A courted dragon whose courter is at war turns on the nearest live site in `courtRange` of it that
 * belongs to a realm at war with the courter. Returns that site and the `dragon_unleashed` event.
 */
export function unleashDragon(
  run: HistoryRun,
  dragon: Creature,
): { site: Site; event: Id } | undefined {
  const by = courtOf(run, dragon).courtedBy;
  const courter = liveCiv(run, by?.civ);
  const ruler = livingPerson(run, by?.ruler);
  if (!by || !courter || !ruler) return undefined;
  const target = enemyTarget(run, dragon, courter);
  const struck = liveCiv(run, target?.civId);
  if (!target || !struck) return undefined;
  const event = run.emit({
    type: 'dragon_unleashed',
    place: target.cell,
    actors: [ruler.id],
    causes: [by.event],
    data: {
      beast: dragon.name,
      ruler: ruler.name,
      civ: courter.name,
      site: target.name,
      struck: struck.name,
    },
  });
  dragon.deeds.push(event.id);
  addDeed(ruler, event.id);
  addGrievance(run, struck.id, courter.id, run.content.dragons.court.grievanceUnleashed, event.id);
  return { site: target, event: event.id };
}

/** A realm's adults, for the soldiers it lends. */
function adultsOf(run: HistoryRun, civ: Civ): number {
  return liveSites(run)
    .filter((s) => s.civId === civ.id)
    .reduce((n, s) => n + bandCount(s, 'adult'), 0);
}

/** The realm answers the harms it took: a pact, or a price on the dragon's head. */
function answer(run: HistoryRun, dragon: Creature, civ: Civ, ruler: Person, court: Court): void {
  const rules = run.content.dragons;
  const rng = run.rng.dragonCourt;
  const harm = (court.harms.get(civ.id) ?? []).slice(-1);
  const temper = rules.tempers.find((t) => t.id === dragon.dragon?.temper) ?? rules.tempers[0]!;
  const place = capitalOf(run, civ)?.cell ?? null;
  const c = rules.court;
  const legend = livingList(run).some((p) => p.civId === civ.id && isLegend(p));
  const chance = clamp(
    c.bountyBase +
      c.bountyPerWar * Math.max(0, cultureValue(run, civ, 'war') - 5) -
      c.bountyPerWealth * Math.max(0, cultureValue(run, civ, 'wealth') - 5) +
      (legend ? c.bountyLegend : 0),
    ...c.bountyRange,
  );
  // Every roll is drawn, so the stream advances the same whichever answer follows.
  const bounty = rng.chance(chance) || !temper.tribute;
  const price = rng.pick(c.phrases.prices);
  const data = { beast: dragon.name, ruler: ruler.name, civ: civ.name };
  if (bounty) {
    const event = run.emit({
      type: 'dragon_bounty_set',
      place,
      actors: [ruler.id],
      causes: harm,
      data: { ...data, price },
    });
    court.bounties.set(civ.id, event.id);
    dragon.deeds.push(event.id);
    addDeed(ruler, event.id);
    return;
  }
  const event = run.emit({
    type: 'dragon_pact',
    place,
    actors: [ruler.id],
    causes: harm,
    data: { ...data, share: c.phrases.pactWord, every: c.pactEvery },
  });
  court.pacts.set(civ.id, { event: event.id, last: run.year });
  dragon.deeds.push(event.id);
  addDeed(ruler, event.id);
}

/** A ruler at war courts the dragon; it takes the gifts or burns the envoys (a harm). */
function court_(run: HistoryRun, dragon: Creature, civ: Civ, ruler: Person, court: Court): void {
  const rules = run.content.dragons;
  const temper = rules.tempers.find((t) => t.id === dragon.dragon?.temper) ?? rules.tempers[0]!;
  const war = run.wars.find(
    (w) => w.ended === undefined && (w.attacker === civ.id || w.defender === civ.id),
  );
  const accepted = run.rng.dragonCourt.chance(temper.courtAccept);
  const event = run.emit({
    type: 'dragon_courted',
    place: capitalOf(run, civ)?.cell ?? null,
    actors: [ruler.id],
    causes: war ? [war.cause] : lastDeed(dragon),
    data: {
      beast: dragon.name,
      ruler: ruler.name,
      civ: civ.name,
      outcome: accepted ? rules.court.phrases.courtAccepted : rules.court.phrases.courtRefused,
      ...temperData(run, ruler, 'court'),
    },
  });
  dragon.deeds.push(event.id);
  addDeed(ruler, event.id);
  if (accepted) court.courtedBy = { civ: civ.id, ruler: ruler.id, event: event.id };
  else noteDragonHarm(run, dragon, civ.id, event.id);
}

/** Whether a war of the realm's has an enemy with a live site within `courtRange` of the lair. */
function warNearLair(run: HistoryRun, civ: Civ, dragon: Creature): boolean {
  return liveSites(run).some(
    (s) =>
      s.civId !== null &&
      atWar(run, civ.id, s.civId) &&
      cellDistance(run.cells.width, dragon.lair, s.cell) <= run.content.dragons.court.courtRange,
  );
}

/** Whether key `a` sorts before `b`, number by number. */
function before(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return false;
}

/** The figure who takes a bounty: the payers' own first, else a legend of a realm at peace with a payer. */
function pickTaker(
  run: HistoryRun,
  dragon: Creature,
  payers: Civ[],
): { person: Person; home: Site; civ: Civ; payer: Civ } | undefined {
  const rules = run.content.dragons;
  let best: { person: Person; home: Site; civ: Civ; payer: Civ } | undefined;
  let bestKey: number[] = [];
  const { lastBounty } = memoryOf(run);
  for (const person of livingList(run)) {
    const civ = liveCiv(run, person.civId);
    const home = person.siteId == null ? undefined : run.world.sites.get(person.siteId);
    if (!civ || !home || !isLive(home) || !isAdult(run, person) || isElder(run, person)) continue;
    if (run.notables.lastDeed.get(person.id) === run.year) continue;
    const taken = lastBounty.get(person.id);
    if (taken !== undefined && run.year - taken < rules.court.bountyCooldown) continue;
    if (cellDistance(run.cells.width, home.cell, dragon.lair) > rules.seekerRange) continue;
    // A payer's own ruler sends others; they do not take their own price.
    if (payers.some((p) => rulerOf(run, p)?.id === person.id)) continue;
    const own = payers.find((p) => p.id === civ.id);
    const payer = own ?? payers.find((p) => !atWar(run, p.id, civ.id));
    if (!payer) continue;
    const rank = isLegend(person)
      ? 0
      : own && person.magic.power >= TIERS.exceptional.minPower
        ? 1
        : own && person.title === 'hero'
          ? 2
          : -1;
    if (rank < 0) continue;
    const key = [own ? 0 : 1, rank, -(deedSoldiers(run, person) * 1000 + person.fame)];
    // Own figures first, then by rank, then the strongest; the first of equals (lowest id) stays.
    if (!best || before(key, bestKey)) {
      best = { person, home, civ, payer };
      bestKey = key;
    }
  }
  return best;
}

/** A figure takes the standing bounty and hunts the dragon, backed by soldiers from the payer. */
function takeBounty(run: HistoryRun, dragon: Creature, def: CreatureDef, court: Court): void {
  const rules = run.content.dragons;
  const payers = [...court.bounties.keys()]
    .sort((a, b) => a - b)
    .flatMap((id) => {
      const civ = liveCiv(run, id);
      return civ && rulerOf(run, civ) ? [civ] : [];
    });
  const found = payers.length > 0 ? pickTaker(run, dragon, payers) : undefined;
  if (!found) return;
  const { person, home, civ, payer } = found;
  const lord = rulerOf(run, payer)!;
  const setEvent = court.bounties.get(payer.id)!;
  const price = String(eventById(run, setEvent)?.data.price ?? '');
  const taken = run.emit({
    type: 'dragon_bounty_taken',
    place: home.cell,
    actors: [person.id, lord.id],
    causes: [setEvent],
    data: {
      name: person.name,
      civ: civ.name,
      beast: dragon.name,
      ruler: lord.name,
      payer: payer.name,
      price,
    },
  });
  dragon.deeds.push(taken.id);
  addDeed(person, taken.id);
  addDeed(lord, taken.id);
  memoryOf(run).lastBounty.set(person.id, run.year);
  const aid = Math.min(
    rules.court.bountyAidCap,
    Math.floor(adultsOf(run, payer) * rules.court.bountyAidShare),
  );
  fightHunt(run, person, dragon, def, home, civ, taken.id, aid, rules.court.bountyOdds);
  if (dragon.died !== run.year) return;
  if (dragon.slayerId === person.id) {
    const claimed = run.emit({
      type: 'dragon_bounty_claimed',
      place: whereIs(dragon),
      actors: [person.id, lord.id],
      causes: lastDeed(dragon),
      data: { name: person.name, beast: dragon.name, ruler: lord.name, payer: payer.name, price },
    });
    person.fame = Math.min(FAME_MAX, person.fame + rules.court.bountyFame);
    addDeed(person, claimed.id);
    addDeed(lord, claimed.id);
  }
  memoryOf(run).courts.delete(dragon.id);
}

/**
 * Yearly, for each living dragon: a courtship ends with its ruler or realm, pacts fall due, and the
 * realms near it answer its harms or court it; then a standing bounty may be taken.
 */
export function runDragonCourt(run: HistoryRun): void {
  const rules = run.content.dragons;
  const c = rules.court;
  const rng = run.rng.dragonCourt;
  const def = run.content.creatures.find((d) => d.id === rules.creatureId);
  if (!def) return;
  const civs = [...run.world.civs.values()].sort((a, b) => a.id - b.id);
  for (const dragon of livingCreatures(run)) {
    if (!dragon.dragon || dragon.defId !== def.id) continue;
    const court = courtOf(run, dragon);
    if (
      court.courtedBy &&
      (!livingPerson(run, court.courtedBy.ruler) || !liveCiv(run, court.courtedBy.civ))
    )
      delete court.courtedBy;
    for (const id of [...court.bounties.keys()]) if (!liveCiv(run, id)) court.bounties.delete(id);
    for (const id of [...court.pacts.keys()].sort((a, b) => a - b)) {
      const civ = liveCiv(run, id);
      const pact = court.pacts.get(id)!;
      if (!civ) court.pacts.delete(id);
      else if (run.year - pact.last >= c.pactEvery) {
        const capital = capitalOf(run, civ);
        if (!capital || !isLive(capital)) continue;
        capital.goods.food *= 1 - c.pactShare;
        dragon.dragon.hoard.tribute += 1;
        pact.last = run.year;
      }
    }
    for (const civ of civs) {
      const capital = capitalOf(run, civ);
      if (civ.fell !== undefined || !capital) continue;
      if (cellDistance(run.cells.width, capital.cell, dragon.lair) > c.courtRange) continue;
      const ruler = rulerOf(run, civ);
      if (!ruler) continue;
      const harms = court.harms.get(civ.id) ?? [];
      const dealt = court.pacts.has(civ.id) || court.bounties.has(civ.id);
      if (dealt) continue;
      if (harms.length >= c.fearHarms) {
        if (rng.chance(c.answerChance)) answer(run, dragon, civ, ruler, court);
      } else if (
        harms.length === 0 &&
        !court.courtedBy &&
        dragon.dragon.asleepUntil === undefined &&
        warNearLair(run, civ, dragon) &&
        rng.chance(Math.min(1, c.courtChance * tilt(run, ruler, 'court')))
      )
        court_(run, dragon, civ, ruler, court);
    }
    if (court.bounties.size > 0 && rng.chance(c.bountyTakeChance))
      takeBounty(run, dragon, def, court);
  }
}
