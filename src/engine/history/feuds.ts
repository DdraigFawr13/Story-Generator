// Generation feuds and exile: a killing between two houses can start a blood feud that outlives
// both parties, heirs inherit it, the house owed blood strikes back and forth, and it ends in a
// wedding, a blood price or oblivion. A killer inside one people may be driven into exile at a
// foreign court and come home pardoned, to press a claim, or at the head of a raid. An inheritance
// quarrel can split a house in two. Every step is an event citing the one before; every roll comes
// from the `feuds` stream and every number from `content/feuds.ts`.

import type { Civ, DeathCause, Dynasty, Id, Person, Site } from '../core/types';
import {
  eligibleToMarry,
  foundDynasty,
  houseNameFor,
  isLegend,
  killNotable,
  linkedCivs,
  markDeed,
  rulerKin,
  rulerOf,
  sharesSpouseName,
} from './notables';
import { itemsHeldBy } from './items';
import {
  addDeed,
  civOfPerson,
  eventById,
  isAdult,
  isElder,
  livingList,
  livingPerson,
  placeOf,
  siblingsOf,
  siteOf,
  wed,
  closeKin,
  ageOf,
} from './people';
import { removePeople, stochasticRound, totalPop } from './pop';
import { cellDistance } from './settle';
import {
  addGrievance,
  atWar,
  causesOf,
  isLive,
  liveSites,
  type Exile,
  type Feud,
  type HistoryRun,
} from './state';

/** Steps up a family tree that count as descent from a first party. */
const DESCENT_STEPS = 4;

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id == null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};
const houseName = (run: HistoryRun, id: Id): string =>
  run.world.dynasties.get(id)?.name ?? 'no house';
const eldestFirst = (a: Person, b: Person) => a.born - b.born || a.id - b.id;
const isOpen = (feud: Feud) => feud.ended === undefined;
const otherHouse = (feud: Feud, house: Id): Id =>
  feud.houses[0] === house ? feud.houses[1] : feud.houses[0];
const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));

/** A live site of the civ: its capital when standing, else its lowest-id town. */
function seatOfCiv(run: HistoryRun, civ: Civ): Site | undefined {
  const capital = run.world.sites.get(civ.capital);
  if (capital && isLive(capital) && capital.civId === civ.id) return capital;
  return liveSites(run).find((s) => s.civId === civ.id);
}

/** Whether the two houses (dynasty ids) are in an open feud. */
export function housesInFeud(run: HistoryRun, a: Id | undefined, b: Id | undefined): boolean {
  if (a === undefined || b === undefined || a === b) return false;
  return run.feuds.some((f) => isOpen(f) && f.houses.includes(a) && f.houses.includes(b));
}

// --- descent and heirs ----------------------------------------------------------------------------

/** How many steps up the family tree `anchor` stands from `person` (1 = parent), or -1 beyond four. */
function descent(run: HistoryRun, person: Person, anchor: Person | undefined): number {
  if (!anchor) return -1;
  let level: Person[] = [person];
  for (let step = 1; step <= DESCENT_STEPS; step += 1) {
    const next = new Map<Id, Person>();
    for (const p of level) {
      for (const id of p.family.parents) {
        const parent = run.world.people.get(id);
        if (parent) next.set(parent.id, parent);
      }
    }
    if (next.has(anchor.id)) return step;
    level = [...next.values()];
    if (level.length === 0) return -1;
  }
  return -1;
}

/** The first party of a house in a feud: the first dead or the first killer, whichever belongs to it. */
function anchorOf(run: HistoryRun, feud: Feud, house: Id): Person | undefined {
  return [feud.firstDead, feud.firstKiller]
    .map((id) => run.world.people.get(id))
    .find((p) => p?.dynastyId === house);
}

/** The kin word for how `heir` descends from `from` ("grandson"), or the general word. */
function kinWord(run: HistoryRun, heir: Person, from: Person): string {
  const words = run.rules.feuds.phrases.kin;
  const steps = descent(run, heir, from);
  return steps < 1 ? words.other : (words[heir.sex][steps - 1] ?? words.other);
}

/** Living adults of a house, eldest first. */
function adultsOfHouse(run: HistoryRun, house: Id): Person[] {
  return livingList(run)
    .filter((p) => p.dynastyId === house && isAdult(run, p))
    .sort(eldestFirst);
}

/**
 * Who carries a house's feud after `dead`: their eldest living adult child of the house, else the
 * eldest living adult of the house (descendants of its first party first), else their eldest child
 * still growing up, else the house's eldest child (the feud waits for them to come of age), else nobody.
 */
function heirFor(run: HistoryRun, feud: Feud, dead: Person, house: Id): Person | undefined {
  const children = dead.family.children
    .map((id) => livingPerson(run, id))
    .filter((p): p is Person => p !== undefined && p.dynastyId === house)
    .sort(eldestFirst);
  const grown = children.find((p) => isAdult(run, p));
  if (grown) return grown;
  const anchor = anchorOf(run, feud, house);
  const members = adultsOfHouse(run, house).filter((p) => p.id !== dead.id);
  const young = () =>
    livingList(run)
      .filter((p) => p.dynastyId === house && p.id !== dead.id)
      .sort(eldestFirst)[0];
  return members.find((p) => descent(run, p, anchor) > 0) ?? members[0] ?? children[0] ?? young();
}

// --- events ----------------------------------------------------------------------------------------

/** Ends a feud with an event saying how, citing the feud's latest event. */
function endFeud(
  run: HistoryRun,
  feud: Feud,
  how: 'wed' | 'paid' | 'forgotten' | 'diedOut' | 'beyond',
  values: Record<string, string>,
  actors: Id[],
  place: number | null,
): void {
  const phrases = run.rules.feuds.phrases;
  feud.ended = run.year;
  const event = run.emit({
    type: 'feud_ended',
    place,
    actors,
    causes: causesOf(feud.last),
    data: {
      house: houseName(run, feud.houses[0]),
      foe: houseName(run, feud.houses[1]),
      how: fill(phrases.ended[how], values),
      kind: how,
      age: phrases.generationsOld[Math.min(feud.generation, phrases.generationsOld.length) - 1]!,
      years: run.year - feud.began,
      generation: feud.generation,
      killings: feud.killings,
    },
  });
  feud.last = event.id;
  feud.lastYear = run.year;
  for (const id of actors) {
    const person = run.world.people.get(id);
    if (person) addDeed(person, event.id);
  }
}

/** Open feuds a house is in. */
const openCount = (run: HistoryRun, house: Id): number =>
  run.feuds.filter((f) => isOpen(f) && f.houses.includes(house)).length;

/** Opens a feud between two houses and emits its first event. */
function openFeud(
  run: HistoryRun,
  owed: { house: Id; bearer: Person },
  foe: { house: Id; bearer: Person },
  first: { dead: Person; killer: Person },
  because: Id,
  why: string,
  killing: boolean,
  site: string,
  place: number | null,
): Feud {
  const houses: [Id, Id] =
    owed.house < foe.house ? [owed.house, foe.house] : [foe.house, owed.house];
  const event = run.emit({
    type: 'feud_began',
    place,
    actors: [owed.bearer.id, foe.bearer.id, first.dead.id],
    causes: [because],
    data: {
      house: houseName(run, owed.house),
      foe: houseName(run, foe.house),
      why,
      name: owed.bearer.name,
      killer: first.killer.name,
      dead: first.dead.name,
      site,
    },
  });
  const feud: Feud = {
    id: run.feuds.length + 1,
    houses,
    owed: owed.house,
    began: run.year,
    event: event.id,
    last: event.id,
    lastYear: run.year,
    bearers: new Map([
      [owed.house, owed.bearer.id],
      [foe.house, foe.bearer.id],
    ]),
    firstDead: first.dead.id,
    firstKiller: first.killer.id,
    generation: 1,
    killings: killing ? 1 : 0,
  };
  run.feuds.push(feud);
  addDeed(owed.bearer, event.id);
  addDeed(foe.bearer, event.id);
  return feud;
}

/** The dead person's eldest adult child, else sibling, else spouse, else any adult of their house. */
function firstBearer(run: HistoryRun, dead: Person, killer: Person): Person | undefined {
  const house = dead.dynastyId;
  const fit = (p: Person | undefined): p is Person =>
    p !== undefined &&
    p.id !== killer.id &&
    p.dynastyId === house &&
    livingPerson(run, p.id) !== undefined &&
    isAdult(run, p);
  const child = dead.family.children
    .map((id) => run.world.people.get(id))
    .filter(fit)
    .sort(eldestFirst)[0];
  if (child) return child;
  const sibling = siblingsOf(run, dead).filter(fit).sort(eldestFirst)[0];
  if (sibling) return sibling;
  const spouse = dead.family.spouses.map((id) => run.world.people.get(id)).find(fit);
  if (spouse) return spouse;
  return adultsOfHouse(run, house!).find((p) => p.id !== killer.id && p.id !== dead.id);
}

/** A bearer has died: their house's heir takes the feud up, lets it lie, or none is left. */
function passBearer(run: HistoryRun, feud: Feud, house: Id, dead: Person, deathEvent: Id): void {
  const rules = run.rules.feuds;
  const foeBearer = livingPerson(run, feud.bearers.get(otherHouse(feud, house)));
  const place = eventById(run, deathEvent)?.place ?? null;
  const heir = heirFor(run, feud, dead, house);
  if (!heir) {
    endFeud(run, feud, 'diedOut', {}, foeBearer ? [foeBearer.id] : [], place);
    return;
  }
  const chance = Math.max(
    rules.inheritFloor,
    rules.inheritChance - rules.inheritPerGeneration * (feud.generation - 1),
  );
  if (!run.rng.feuds.chance(chance)) {
    endFeud(run, feud, 'forgotten', { name: heir.name }, [heir.id], place);
    return;
  }
  const steps = descent(run, heir, anchorOf(run, feud, house));
  if (steps >= 1) feud.generation = Math.max(feud.generation, steps + 1);
  feud.bearers.set(house, heir.id);
  const event = run.emit({
    type: 'feud_inherited',
    place: placeOf(run, heir) ?? place,
    actors: [heir.id, ...(foeBearer ? [foeBearer.id] : [])],
    causes: causesOf(deathEvent, feud.last),
    data: {
      name: heir.name,
      // An heir named for the dead is called their namesake, so the line never reads as a slip.
      kin:
        heir.name === dead.name
          ? `${kinWord(run, heir, dead)} and namesake`
          : kinWord(run, heir, dead),
      dead: dead.name,
      house: houseName(run, house),
      foe: houseName(run, otherHouse(feud, house)),
      beganYear: feud.began,
      generation: feud.generation,
    },
  });
  feud.last = event.id;
  feud.lastYear = run.year;
  addDeed(heir, event.id);
}

/**
 * A notable dies: a killing between two houses is a killing in their feud, or may begin one; and a
 * dead bearer's heir takes the feud up, lets it lie, or it dies out (no heir).
 */
export function feudOnDeath(
  run: HistoryRun,
  dead: Person,
  killer: Person | undefined,
  cause: DeathCause,
  deathEvent: Id,
): void {
  const rules = run.rules.feuds;
  const here = dead.dynastyId;
  const there = killer?.dynastyId;
  if (killer && here !== undefined && there !== undefined && here !== there) {
    // A bearer who took a seat founds a new house but still carries their old house's feud.
    const sideOf = (f: Feud, p: Person, house: Id): Id | undefined =>
      f.houses.includes(house)
        ? house
        : [...f.bearers.entries()].find(([, id]) => id === p.id)?.[0];
    const feud = run.feuds.find((f) => {
      if (!isOpen(f)) return false;
      const lost = sideOf(f, dead, here);
      const won = sideOf(f, killer, there);
      return lost !== undefined && won !== undefined && lost !== won;
    });
    if (feud) {
      feud.killings += 1;
      feud.owed = sideOf(feud, dead, here)!;
      feud.last = deathEvent;
      feud.lastYear = run.year;
    } else {
      const chance = rules.startChance[cause] ?? 0;
      if (
        chance > 0 &&
        openCount(run, here) < rules.maxOpen &&
        openCount(run, there) < rules.maxOpen &&
        run.rng.feuds.chance(chance)
      ) {
        const bearer = firstBearer(run, dead, killer);
        const death = eventById(run, deathEvent);
        if (bearer) {
          openFeud(
            run,
            { house: here, bearer },
            { house: there, bearer: killer },
            { dead, killer },
            deathEvent,
            fill(rules.phrases.whyKilled, {
              killer: killer.name,
              dead: dead.name,
              site: String(death?.data.site ?? 'the wilds'),
            }),
            true,
            String(death?.data.site ?? 'the wilds'),
            death?.place ?? null,
          );
        }
      }
    }
  }
  for (const feud of run.feuds) {
    if (!isOpen(feud)) continue;
    for (const [house, id] of [...feud.bearers.entries()].sort((a, b) => a[0] - b[0])) {
      if (id === dead.id && isOpen(feud)) passBearer(run, feud, house, dead, deathEvent);
    }
  }
}

// --- inheritance quarrels ------------------------------------------------------------------------------

/**
 * What the dead leave to quarrel over: an artifact they held (its form), the lands of a ruler's
 * seat, or the hall of a house's founder; nothing when none of these.
 */
export function quarrelOver(
  run: HistoryRun,
  dead: Person,
  civ: Civ | undefined,
): string | undefined {
  if (dead.dynastyId === undefined) return undefined;
  const phrases = run.rules.feuds.phrases;
  const artifact = itemsHeldBy(run, dead).find((i) => i.kind === 'artifact');
  if (artifact) return artifact.form;
  if (civ && civ.fell === undefined && civ.rulerId === dead.id) return phrases.overSeat;
  if (run.world.dynasties.get(dead.dynastyId)?.founderId === dead.id) return phrases.overHouse;
  return undefined;
}

/** Grown, ruling no one, of the dead's house: those who can quarrel over an inheritance. */
function heirsOf(run: HistoryRun, dead: Person): Person[] {
  return dead.family.children
    .map((id) => livingPerson(run, id))
    .filter(
      (p): p is Person =>
        p !== undefined &&
        p.dynastyId === dead.dynastyId &&
        isAdult(run, p) &&
        p.title !== 'ruler' &&
        civOfPerson(run, p)?.rulerId !== p.id,
    )
    .sort(eldestFirst);
}

/**
 * After a death that leaves an inheritance (`what`), two grown heirs may quarrel: the eldest keeps
 * it and the next breaks away to found a branch house, which may be in feud with the old at once.
 */
export function inheritanceQuarrel(
  run: HistoryRun,
  dead: Person,
  deathEvent: Id,
  what: string,
): void {
  const rules = run.rules.feuds;
  const old = dead.dynastyId === undefined ? undefined : run.world.dynasties.get(dead.dynastyId);
  if (!old || run.year - old.founded < rules.splitMinYears) return;
  const [elder, younger] = heirsOf(run, dead);
  if (!elder || !younger) return;
  if (!run.rng.feuds.chance(rules.splitChance)) return;
  const taken = houseNameFor(run, younger);
  if ([...run.world.dynasties.values()].some((d) => d.name === taken)) return;
  const branch: Dynasty = foundDynasty(run, younger, [deathEvent]);
  branch.branchOf = old.id;
  const founded = younger.deeds[younger.deeds.length - 1]!;
  for (const id of younger.family.children) {
    const child = livingPerson(run, id);
    if (child && !isAdult(run, child) && child.dynastyId === old.id) child.dynastyId = branch.id;
  }
  const event = run.emit({
    type: 'house_split',
    place: placeOf(run, younger),
    actors: [younger.id, elder.id, dead.id],
    causes: causesOf(deathEvent, founded),
    data: {
      younger: younger.name,
      elder: elder.name,
      dead: dead.name,
      parent: rules.phrases.parent[dead.sex],
      what,
      house: old.name,
      branch: branch.name,
    },
  });
  addDeed(younger, event.id);
  addDeed(elder, event.id);
  const feud = run.rng.feuds.chance(rules.splitFeudChance);
  if (!feud || openCount(run, old.id) >= rules.maxOpen) return;
  openFeud(
    run,
    { house: old.id, bearer: elder },
    { house: branch.id, bearer: younger },
    { dead, killer: younger },
    event.id,
    fill(rules.phrases.whySplit, { dead: dead.name, what }),
    false,
    siteOf(run, younger)?.name ?? 'the wilds',
    placeOf(run, younger),
  );
}

// --- exile -----------------------------------------------------------------------------------------------

/** The people that takes an exile in: the linked one with most grievance against home, else the nearest. */
function hostFor(run: HistoryRun, home: Civ): Civ | undefined {
  const grievance = (civ: Civ) => civ.grievances.get(home.id) ?? 0;
  const linked = [...linkedCivs(run, home.id)]
    .map((id) => liveCiv(run, id))
    .filter((c): c is Civ => c !== undefined && c.id !== home.id && seatOfCiv(run, c) !== undefined)
    .sort((a, b) => grievance(b) - grievance(a) || a.id - b.id);
  if (linked[0]) return linked[0];
  const from = seatOfCiv(run, home);
  if (!from) return undefined;
  let best: Civ | undefined;
  let bestDistance = Infinity;
  for (const civ of [...run.world.civs.values()].sort((a, b) => a.id - b.id)) {
    const seat = civ.id === home.id || civ.fell !== undefined ? undefined : seatOfCiv(run, civ);
    if (!seat) continue;
    const distance = cellDistance(run.cells.width, from.cell, seat.cell);
    if (distance < bestDistance) {
      best = civ;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Drives a notable out of their people to a foreign court: their people becomes the host's and they
 * live at its capital. Returns the `notable_exiled` event id, or undefined when no court will take them.
 */
export function exileNotable(
  run: HistoryRun,
  person: Person,
  home: Civ,
  cause: Id,
  by: Person | undefined,
  claimant: boolean,
  why: string,
): Id | undefined {
  const host = hostFor(run, home);
  const seat = host ? seatOfCiv(run, host) : undefined;
  if (!host || !seat) return undefined;
  person.civId = host.id;
  person.siteId = seat.id;
  const event = run.emit({
    type: 'notable_exiled',
    place: seat.cell,
    actors: [person.id, ...(by ? [by.id] : [])],
    causes: [cause],
    data: { name: person.name, civ: home.name, host: host.name, site: seat.name, why },
  });
  addDeed(person, event.id);
  run.exiles.set(person.id, {
    home: home.id,
    host: host.id,
    since: run.year,
    event: event.id,
    by: by?.id,
    claimant,
  });
  return event.id;
}

/** The claimant who lost a disputed succession may be driven out by the winner (`disputeExileChance`). */
export function exileClaimant(
  run: HistoryRun,
  loser: Person,
  civ: Civ,
  dispute: Id,
  winner: Person,
): void {
  const rules = run.rules.feuds;
  if (!isAdult(run, loser) || !run.rng.feuds.chance(rules.disputeExileChance)) return;
  const why = fill(rules.phrases.exile.dispute, { winner: winner.name });
  exileNotable(run, loser, civ, dispute, winner, true, why);
}

/** Brings an exile home: their people and the capital again. */
function bringHome(run: HistoryRun, person: Person, home: Civ): Site | undefined {
  const seat = seatOfCiv(run, home);
  person.civId = home.id;
  person.siteId = seat?.id ?? null;
  run.exiles.delete(person.id);
  return seat;
}

/** An exile long enough away may come home, pardoned or to claim the seat, or lead a raid home. */
function runExiles(run: HistoryRun): void {
  const rules = run.rules.feuds;
  const rng = run.rng.feuds;
  for (const id of [...run.exiles.keys()].sort((a, b) => a - b)) {
    const exile = run.exiles.get(id)!;
    const person = livingPerson(run, id);
    const host = liveCiv(run, exile.host);
    const home = liveCiv(run, exile.home);
    if (!person || !host || !home || person.civId !== host.id) {
      run.exiles.delete(id);
      continue;
    }
    if (!isAdult(run, person) || isElder(run, person)) continue;
    if (run.year - exile.since < rules.returnMinYears || !rng.chance(rules.returnChance)) continue;
    const ruler = rulerOf(run, home);
    const phrases = rules.phrases.returned;
    const data = (kind: string, how: string, site: string) => ({
      name: person.name,
      civ: home.name,
      host: host.name,
      site,
      how: fill(how, { host: host.name, site }),
      kind,
    });
    if (!ruler || exile.by === undefined || ruler.id !== exile.by) {
      const seat = bringHome(run, person, home);
      const event = run.emit({
        type: 'exile_returned',
        place: seat?.cell ?? null,
        actors: [person.id, ...(ruler ? [ruler.id] : [])],
        causes: [exile.event],
        data: data('pardoned', phrases.pardoned, seat?.name ?? home.name),
      });
      addDeed(person, event.id);
      markDeed(run, person);
    } else if (exile.claimant) {
      const seat = bringHome(run, person, home);
      const event = run.emit({
        type: 'exile_returned',
        place: seat?.cell ?? null,
        actors: [person.id, ruler.id],
        causes: [exile.event],
        data: data('claim', phrases.claim, seat?.name ?? home.name),
      });
      addDeed(person, event.id);
      markDeed(run, person);
      run.claims.push({ civ: home.id, claimant: person.id, ruler: ruler.id, dispute: event.id });
    } else if (!exile.raided) {
      raidHome(run, person, exile, host, home, ruler);
    }
  }
}

/** The exile leads the host's raid on the home site nearest the host's capital, within range. */
function raidHome(
  run: HistoryRun,
  person: Person,
  exile: Exile,
  host: Civ,
  home: Civ,
  ruler: Person | undefined,
): void {
  const rules = run.rules.feuds;
  const rng = run.rng.feuds;
  const hostSeat = seatOfCiv(run, host);
  if (!hostSeat) return;
  if ((host.grievances.get(home.id) ?? 0) < rules.raidGrievance && !atWar(run, host.id, home.id))
    return;
  let target: Site | undefined;
  let best = Infinity;
  for (const site of liveSites(run)) {
    if (site.civId !== home.id) continue;
    const distance = cellDistance(run.cells.width, hostSeat.cell, site.cell);
    if (distance <= rules.raidRange && distance < best) {
      target = site;
      best = distance;
    }
  }
  if (!target) return;
  exile.raided = true;
  const [lo, hi] = run.rules.civRaidDeaths;
  const share = rng.between(Math.round(lo * 1000), Math.round(hi * 1000)) / 1000;
  const dead = removePeople(target, stochasticRound(rng, totalPop(target) * share), [
    'adult',
    'child',
    'elder',
  ]);
  const event = run.emit({
    type: 'exile_returned',
    place: target.cell,
    actors: [person.id, ...(ruler ? [ruler.id] : [])],
    causes: [exile.event],
    data: {
      name: person.name,
      civ: home.name,
      host: host.name,
      site: target.name,
      how: fill(rules.phrases.returned.raid, { host: host.name, site: target.name, dead }),
      kind: 'raid',
    },
  });
  addDeed(person, event.id);
  markDeed(run, person);
  addGrievance(run, home.id, host.id, run.rules.grievance.raid, event.id);
  if (ruler && rng.chance(isLegend(ruler) ? rules.raidKillLegend : rules.raidKill))
    killNotable(run, ruler, { cause: 'raid', killer: person, causes: [event.id] });
}

// --- the yearly round ------------------------------------------------------------------------------------

/** A pair of unmarried adults, one from each house, of opposite sex and close in age, to wed. */
function weddingPair(run: HistoryRun, a: Id, b: Id): [Person, Person] | undefined {
  const gap = run.rules.feuds.weddingAgeGap;
  const fit = (p: Person) => eligibleToMarry(run, p);
  const second = adultsOfHouse(run, b).filter(fit);
  for (const x of adultsOfHouse(run, a).filter(fit)) {
    for (const y of second) {
      if (x.sex === y.sex) continue;
      if (Math.abs(ageOf(run, x) - ageOf(run, y)) > gap) continue;
      if (closeKin(x, y) || sharesSpouseName(run, x, y)) continue;
      return [x, y];
    }
  }
  return undefined;
}

/** Ends the feud in a match between the houses, citing the feud's latest event. */
function peaceWedding(run: HistoryRun, feud: Feud, pair: [Person, Person]): void {
  wed(pair[0], pair[1]);
  endFeud(
    run,
    feud,
    'wed',
    { a: pair[0].name, b: pair[1].name },
    [pair[0].id, pair[1].id],
    placeOf(run, pair[0]),
  );
}

/**
 * Yearly, before the year's marriages: while a member of each house in an open feud is free to
 * marry, the houses may end it with a match (`wedBase`, more each generation, more between allies).
 */
export function feudWeddings(run: HistoryRun): void {
  const rules = run.rules.feuds;
  for (const feud of [...run.feuds]) {
    if (!isOpen(feud) || feud.lastYear === run.year) continue;
    const pair = weddingPair(run, feud.houses[0], feud.houses[1]);
    if (!pair) continue;
    const allied = alliedBearers(run, pair[0], pair[1]);
    const chance =
      (rules.wedBase + rules.wedPerGeneration * (feud.generation - 1)) *
      (allied ? rules.endAlliedFactor : 1);
    if (run.rng.feuds.chance(Math.min(1, chance))) peaceWedding(run, feud, pair);
  }
}

/** Whether the two bearers serve one people or sworn allies. */
function alliedBearers(run: HistoryRun, a: Person, b: Person): boolean {
  if (a.civId == null || b.civId == null) return false;
  if (a.civId === b.civId) return true;
  return run.pacts.some(
    (p) =>
      p.kind === 'alliance' &&
      ((p.a === a.civId && p.b === b.civId) || (p.a === b.civId && p.b === a.civId)),
  );
}

/** The house owed blood strikes at the foe: its bearer if living and grown, else any grown member. */
function pickTarget(run: HistoryRun, feud: Feud, foe: Id): Person | undefined {
  const rules = run.rules.feuds;
  const rng = run.rng.feuds;
  // Only someone with a home can be found and struck at.
  const housed = (p: Person) => p.siteId != null;
  const bearer = livingPerson(run, feud.bearers.get(foe));
  let target = bearer && isAdult(run, bearer) && housed(bearer) ? bearer : undefined;
  if (!target) {
    const members = adultsOfHouse(run, foe).filter(housed);
    target = members.length > 0 ? rng.pick(members) : undefined;
  }
  if (target && isLegend(target) && !rng.chance(rules.legendTarget)) {
    const lesser = adultsOfHouse(run, foe).filter((p) => housed(p) && !isLegend(p));
    target = lesser.length > 0 ? rng.pick(lesser) : undefined;
  }
  return target;
}

/** The bearer strikes: a killing or a miss, a wrong between peoples, and perhaps exile for the killer. */
function strike(run: HistoryRun, feud: Feud, striker: Person, foe: Id): void {
  const rules = run.rules.feuds;
  const rng = run.rng.feuds;
  const target = pickTarget(run, feud, foe);
  if (!target) {
    // A foe house with no one left alive or with a home ends the feud; one with only children makes it wait.
    const left = livingList(run).filter((p) => p.dynastyId === foe);
    if (left.length === 0) endFeud(run, feud, 'diedOut', {}, [striker.id], placeOf(run, striker));
    else if (left.every((p) => p.siteId == null))
      endFeud(
        run,
        feud,
        'beyond',
        { foe: houseName(run, foe) },
        [striker.id],
        placeOf(run, striker),
      );
    return;
  }
  const legend = isLegend(target);
  const slain = rng.chance(legend ? rules.legendKill : rules.killChance);
  const homeSite = siteOf(run, target);
  const phrases = rules.phrases.struck;
  const event = run.emit({
    type: 'feud_struck',
    place: homeSite?.cell ?? placeOf(run, target),
    actors: [striker.id, target.id],
    causes: causesOf(feud.last),
    data: {
      name: striker.name,
      house: houseName(run, feud.owed),
      target: target.name,
      foe: houseName(run, foe),
      site: homeSite?.name ?? 'the wilds',
      outcome: fill(slain ? phrases.slain : rng.pick(phrases.escaped), { target: target.name }),
      slain: slain ? 1 : 0,
      legend: legend ? 1 : 0,
    },
  });
  feud.last = event.id;
  feud.lastYear = run.year;
  addDeed(striker, event.id);
  addDeed(target, event.id);
  markDeed(run, striker);
  const victim = liveCiv(run, target.civId);
  const attacker = liveCiv(run, striker.civId);
  if (victim && attacker && victim.id !== attacker.id)
    addGrievance(run, victim.id, attacker.id, rules.strikeGrievance, event.id);
  if (!slain) return;
  const death = killNotable(run, target, { cause: 'murder', killer: striker, causes: [event.id] });
  if (!attacker || !victim || attacker.id !== victim.id || attacker.free) return;
  const ruler = rulerOf(run, attacker);
  if (!ruler || ruler.id === striker.id) return;
  if (!rng.chance(rulerKin(run, attacker, striker) ? rules.exileKinChance : rules.exileChance))
    return;
  exileNotable(
    run,
    striker,
    attacker,
    death.id,
    ruler,
    false,
    fill(rules.phrases.exile.killing, { dead: target.name }),
  );
}

/** The bearer lets the feud end: a wedding of the houses if a pair can wed, else a blood price. */
function makePeace(
  run: HistoryRun,
  feud: Feud,
  bearer: Person,
  foeBearer: Person | undefined,
): void {
  const pair = weddingPair(run, feud.houses[0], feud.houses[1]);
  if (pair) {
    peaceWedding(run, feud, pair);
    return;
  }
  endFeud(
    run,
    feud,
    'paid',
    {},
    [bearer.id, ...(foeBearer ? [foeBearer.id] : [])],
    placeOf(run, bearer),
  );
}

/**
 * Yearly: in each open feud the house owed blood may act through its bearer (end it, or strike),
 * then exiles long enough away may come home.
 */
export function runFeuds(run: HistoryRun): void {
  const rules = run.rules.feuds;
  const rng = run.rng.feuds;
  for (const feud of [...run.feuds]) {
    if (!isOpen(feud) || run.year - feud.lastYear < rules.quietYears) continue;
    const bearer = livingPerson(run, feud.bearers.get(feud.owed));
    if (!bearer || !isAdult(run, bearer) || isElder(run, bearer)) continue;
    if (!rng.chance(rules.actChance)) continue;
    const foe = otherHouse(feud, feud.owed);
    const foeBearer = livingPerson(run, feud.bearers.get(foe));
    const allied = foeBearer !== undefined && alliedBearers(run, bearer, foeBearer);
    const end =
      (rules.endBase + rules.endPerGeneration * (feud.generation - 1)) *
      (allied ? rules.endAlliedFactor : 1);
    if (rng.chance(end)) makePeace(run, feud, bearer, foeBearer);
    else strike(run, feud, bearer, foe);
  }
  runExiles(run);
}
