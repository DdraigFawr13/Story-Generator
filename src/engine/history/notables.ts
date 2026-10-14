// Notables (M2.5): the rulers, founders, heroes, captains, raiders, mages and the families around
// them, as individual people over the 250 years. They are an overlay on the counts in `Site.pop`.
// Yearly: deaths, marriages, births, mage births among commoners, legends. Succession follows each
// culture's rule; a killing by a foreign notable becomes sworn vengeance, which can become war.

import type {
  Civ,
  Creature,
  DeathCause,
  Dynasty,
  Id,
  PerilousPlace,
  Person,
  SimEvent,
  Site,
} from '../core/types';
import { DAYS_PER_YEAR } from '../core/clock';
import { cultureGivenName } from '../people/names';
import { BIRTH_TIER_IDS, TIERS, legendSlotOpen, tierOfPower } from '../people/tiers';
import { legendFactor, noticeFactor } from './colleges';
import { hoardItems, hoards } from './dragons';
import { buryRuler, leaveItemsAt } from './places';
import { passItems, primarySchool, stealItem, itemsHeldBy } from './items';
import {
  ELDER_AT,
  addDeed,
  ageOf,
  civOfPerson,
  closeKin,
  createAdult,
  createPerson,
  eventById,
  isAdult,
  isElder,
  isFertile,
  isMarried,
  livingAt,
  livingList,
  livingPerson,
  FAME_MAX,
  makeRivals,
  mostFamous,
  placeOf,
  raceOf,
  rebuildIndex,
  siblingsOf,
  siteOf,
  wed,
} from './people';
import { stochasticRound, totalPop } from './pop';
import { cellDistance } from './settle';
import {
  addGrievance,
  atWar,
  cultureOf,
  isLive,
  liveSites,
  logOf,
  pairKey,
  type HistoryRun,
  type War,
} from './state';

export { livingList } from './people';

/** Fame never passes this. */
/** A spouse made up for a notable is within this many years of their age. */
const SPOUSE_AGE_GAP = 4;
const NAME_REROLLS = 5;
/** A new ruler with no kin to take the seat is this many years past maturity at most. */
const NEW_RULER_SPAN = 20;
/** Rulers' children at the start are at most this old (years past maturity of the ruler). */
const START_CHILDREN = 3;
/** A new ruler at the start is this many years past maturity at most. */
const START_RULER_SPAN = 15;
/** A power this high or more can grow legendary. */
const LEGEND_FROM = 13;
/** Legendary power range. */
const LEGEND_POWER: [number, number] = [17, 20];
/** Strong or better counts as a mage for births and for civ strength. */
const MAGE_POWER = 7;

const civName = (civ: Civ | undefined) => civ?.name ?? 'no people';
/** 1000 -> "1,000", as the chronicle writes numbers. */
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function capitalOf(run: HistoryRun, civ: Civ): Site | undefined {
  const site = run.world.sites.get(civ.capital);
  return site && isLive(site) ? site : undefined;
}

/** The civ's living ruler. */
export function rulerOf(run: HistoryRun, civ: Civ): Person | undefined {
  return livingPerson(run, civ.rulerId);
}

// --- dynasties --------------------------------------------------------------------------------

function foundDynasty(run: HistoryRun, founder: Person, causes: Id[]): Dynasty {
  const { world } = run;
  const rules = run.content.notables;
  const pattern = rules.dynastyNames[founder.cultureId ?? ''] ?? '{name}';
  const dynasty: Dynasty = {
    id: world.nextId.dynasty,
    name: pattern.replace('{name}', founder.name),
    founderId: founder.id,
    civId: founder.civId ?? null,
    founded: run.year,
  };
  world.nextId.dynasty += 1;
  world.dynasties.set(dynasty.id, dynasty);
  founder.dynastyId = dynasty.id;
  const event = run.emit({
    type: 'dynasty_founded',
    actors: [founder.id],
    place: placeOf(run, founder),
    causes,
    data: {
      dynasty: dynasty.name,
      founder: founder.name,
      civ: civName(civOfPerson(run, founder)),
      site: siteOf(run, founder)?.name ?? 'the wilds',
    },
  });
  addDeed(founder, event.id);
  return dynasty;
}

/**
 * A ruler takes the seat: one from outside the old line founds a new house, and the house that
 * held the seat long enough gets its ending in the record. `prior` is undefined for a new realm.
 */
export function seatHouse(
  run: HistoryRun,
  civ: Civ,
  ruler: Person,
  prior: Person | undefined,
  cause: Id,
): void {
  const before = prior?.dynastyId;
  const old = before === undefined ? undefined : run.world.dynasties.get(before);
  if (ruler.dynastyId === undefined || (prior !== undefined && ruler.dynastyId !== before)) {
    foundDynasty(run, ruler, [cause]);
  }
  if (!prior) {
    civ.houseSince = run.year;
    civ.houseRulers = 1;
    return;
  }
  if (!old || ruler.dynastyId === old.id) {
    civ.houseRulers = (civ.houseRulers ?? 0) + 1;
    return;
  }
  const rules = run.rules.civilWar;
  const years = run.year - (civ.houseSince ?? 0);
  const rulers = civ.houseRulers ?? 1;
  if (years >= rules.houseYears || rulers >= rules.houseRulers) {
    const event = run.emit({
      type: 'dynasty_ended',
      actors: [prior.id, ruler.id],
      place: capitalOf(run, civ)?.cell ?? null,
      causes: [cause],
      data: {
        dynasty: old.name,
        house: dynastyName(run, ruler),
        civ: civ.name,
        years,
        rulers,
        reign: rules.phrases.reign
          .replace('{years}', String(years))
          .replace('{rulers}', rulers === 1 ? rules.phrases.oneRuler : `${rulers} rulers`),
        ruler: ruler.name,
        prior: prior.name,
      },
    });
    addDeed(ruler, event.id);
  }
  civ.houseSince = run.year;
  civ.houseRulers = 1;
}

/** The dynasty a child belongs to: the more famous parent's (father on ties); that parent founds one if needed. */
function dynastyFor(run: HistoryRun, mother: Person, father: Person): Id {
  const [first, second] = father.fame >= mother.fame ? [father, mother] : [mother, father];
  if (first.dynastyId !== undefined) return first.dynastyId;
  if (second.dynastyId !== undefined) return second.dynastyId;
  return foundDynasty(run, first, first.deeds.slice(-1)).id;
}

function dynastyName(run: HistoryRun, person: Person): string {
  const dynasty =
    person.dynastyId === undefined ? undefined : run.world.dynasties.get(person.dynastyId);
  return dynasty?.name ?? 'no house';
}

// --- start of the world -----------------------------------------------------------------------

/** Year 0: each civ gets a ruler with a spouse, up to three children and a dynasty. */
export function initNotables(run: HistoryRun): void {
  const { world } = run;
  const rules = run.content.notables;
  const rng = run.rng.notables;
  for (const civ of world.civs.values()) {
    const capital = world.sites.get(civ.capital);
    const race = run.races.get(civ.raceId);
    if (!capital || !race) continue;
    const age = rng.between(race.maturityYears, race.maturityYears + START_RULER_SPAN);
    const ruler = createPerson(run, {
      raceId: civ.raceId,
      cultureId: civ.cultureId,
      siteId: capital.id,
      civId: civ.id,
      cell: capital.cell,
      title: 'ruler',
      age,
      fame: rules.fame.ruler,
    });
    const spouse = createPerson(run, {
      raceId: civ.raceId,
      cultureId: civ.cultureId,
      siteId: capital.id,
      civId: civ.id,
      cell: capital.cell,
      title: 'kin',
      age: rng.between(race.maturityYears, age + SPOUSE_AGE_GAP),
      sex: ruler.sex === 'f' ? 'm' : 'f',
      fame: 0,
    });
    wed(ruler, spouse);
    civ.rulerId = ruler.id;
    const origin = logOf(run, capital.id).origin;
    const dynasty = foundDynasty(run, ruler, origin === undefined ? [] : [origin]);
    civ.houseSince = 0;
    civ.houseRulers = 1;
    const [mother, father] = ruler.sex === 'f' ? [ruler, spouse] : [spouse, ruler];
    const children = rng.between(0, START_CHILDREN);
    for (let n = 0; n < children; n += 1) {
      createPerson(run, {
        raceId: civ.raceId,
        cultureId: civ.cultureId,
        siteId: capital.id,
        civId: civ.id,
        cell: capital.cell,
        title: 'kin',
        age: rng.between(0, Math.max(0, age - race.maturityYears)),
        parents: [mother, father],
        dynastyId: dynasty.id,
        fame: 0,
      });
    }
  }
}

// --- deaths -----------------------------------------------------------------------------------

/** Yearly chance of dying of age or illness: low for adults, rising to certain death at 1.15 lifespans. */
function deathChance(run: HistoryRun, person: Person): number {
  const rules = run.content.notables;
  const race = raceOf(run, person);
  const age = ageOf(run, person);
  // Longer-lived races die proportionally less often at the reference lifespan.
  const scale = run.rules.referenceLifespan / race.lifespanYears;
  if (age < race.maturityYears) return rules.childDeath * scale;
  const base = rules.adultDeath * scale;
  const elderAt = ELDER_AT * race.lifespanYears;
  if (age < elderAt) return base;
  const end = 1.15 * race.lifespanYears;
  return Math.min(1, base + ((1 - base) * (age - elderAt)) / (end - elderAt));
}

/** Is the ruler or kin (spouse, child, parent, sibling) of the civ's ruler. */
function rulerKin(run: HistoryRun, civ: Civ, person: Person): boolean {
  const ruler = rulerOf(run, civ);
  if (!ruler) return false;
  return (
    ruler.id === person.id ||
    ruler.family.spouses.includes(person.id) ||
    ruler.family.children.includes(person.id) ||
    ruler.family.parents.includes(person.id) ||
    siblingsOf(run, ruler).some((p) => p.id === person.id)
  );
}

/** One avenger swears vengeance on a killer; a ruler's kin bring their civ's grievance with them. */
function swearOath(
  run: HistoryRun,
  avenger: Person,
  killer: Person,
  dead: Person,
  death: Id,
): void {
  if (!(avenger.enemies ??= []).includes(killer.id)) avenger.enemies.push(killer.id);
  const event = run.emit({
    type: 'oath_sworn',
    actors: [avenger.id, killer.id],
    place: placeOf(run, avenger),
    causes: [death],
    data: {
      name: avenger.name,
      enemy: killer.name,
      dead: dead.name,
      civ: civName(civOfPerson(run, avenger)),
    },
  });
  addDeed(avenger, event.id);
  const civ = civOfPerson(run, avenger);
  const target = killer.civId;
  if (civ && civ.fell === undefined && target != null && target !== civ.id) {
    if (rulerKin(run, civ, avenger)) {
      addGrievance(run, civ.id, target, run.rules.grievance.vengeance, event.id);
    }
  }
}

/** The dead person's living adult children, spouses and siblings swear vengeance on a foreign killer. */
function swearVengeance(run: HistoryRun, dead: Person, killer: Person, death: Id): void {
  const kin = new Map<Id, Person>();
  const add = (person: Person | undefined) => {
    if (person && person.id !== killer.id && isAdult(run, person) && livingPerson(run, person.id)) {
      kin.set(person.id, person);
    }
  };
  for (const id of dead.family.children) add(run.world.people.get(id));
  for (const id of dead.family.spouses) add(run.world.people.get(id));
  for (const sibling of siblingsOf(run, dead)) add(sibling);
  for (const avenger of [...kin.values()].sort((a, b) => a.id - b.id)) {
    swearOath(run, avenger, killer, dead, death);
  }
}

export interface DeathOptions {
  cause: DeathCause;
  killer?: Person | undefined;
  /** Events that led to the death; the person's latest deed when empty. */
  causes?: Id[];
  /** Where they died, when not at home (a battlefield). */
  at?: Site | undefined;
  /** The beast that killed them: named in the death and added to its own history. */
  beast?: Creature | undefined;
  /** They faced the beast (a hunt or an answered raid), rather than fell in its raid. */
  fought?: boolean;
  /** The perilous place they died in (an expedition): their items stay there. */
  peril?: PerilousPlace | undefined;
}

/** A notable dies: the event, vengeance, their items and, for a ruler, the succession. */
export function killNotable(run: HistoryRun, person: Person, options: DeathOptions): SimEvent {
  const rules = run.content.notables;
  const { killer } = options;
  const age = ageOf(run, person);
  person.died = run.year;
  person.causeOfDeath = options.cause;
  if (killer) person.killerId = killer.id;
  run.notables.living.delete(person.id);
  const civ = civOfPerson(run, person);
  const where = options.at ?? siteOf(run, person);
  const { beast } = options;
  const phrase = beast
    ? (options.fought ? rules.beastDeathPhrase : rules.beastRaidDeathPhrase).replace(
        '{beast}',
        beast.name,
      )
    : rules.deathPhrases[options.cause]
        .replace('{kind}', where?.kind ?? 'town')
        .replace('{peril}', options.peril?.name ?? 'the wilds');
  // The living spouse is an actor too, so the death shows on the widow's or widower's page.
  const spouses = person.family.spouses
    .map((id) => livingPerson(run, id))
    .filter((p): p is Person => p !== undefined && p.id !== killer?.id);
  const widowed =
    spouses.length === 0
      ? ''
      : rules.widowedPhrase.replace('{names}', spouses.map((p) => p.name).join(' and '));
  const event = run.emit({
    type: 'notable_died',
    // A figure a beast killed is never rolled into a year's count: it is part of the beast's story.
    ...(beast ? { importanceBonus: run.content.notables.beastDeathImportance } : {}),
    actors: [person.id, ...(killer ? [killer.id] : []), ...spouses.map((p) => p.id)],
    place: options.peril?.cell ?? where?.cell ?? placeOf(run, person),
    causes: options.causes && options.causes.length > 0 ? options.causes : person.deeds.slice(-1),
    data: {
      name: person.name,
      age,
      role: rules.roleNames[person.title ?? 'kin'],
      cause: killer ? `${phrase}, slain by ${killer.name}` : phrase,
      site: where?.name ?? 'the wilds',
      civ: civName(civ),
      widowed,
      beast: beast?.name ?? '',
    },
  });
  addDeed(person, event.id);
  if (killer) addDeed(killer, event.id);
  if (beast) {
    beast.deeds.push(event.id);
    (beast.kills ??= []).push(person.id);
  }
  if (killer && killer.civId != null && person.civId != null && killer.civId !== person.civId) {
    swearVengeance(run, person, killer, event.id);
  }
  // A ruler of a standing people may be buried with an artifact, unless a hoarding beast took them
  // or they died in a perilous place.
  const hoarder = beast !== undefined && hoards(run, beast);
  if (civ && civ.fell === undefined && civ.rulerId === person.id && !hoarder && !options.peril)
    buryRuler(run, person, civ, event.id);
  // A hoarding beast's kill leaves its treasures in the hoard, and a death in a perilous place
  // leaves them there; neither goes to an heir.
  if (beast && hoarder) hoardItems(run, person, beast, event.id);
  else if (options.peril) leaveItemsAt(run, person, options.peril, event.id);
  else passItems(run, person, event.id);
  if (civ && civ.fell === undefined && civ.rulerId === person.id) succeed(run, civ, person, event);
  return event;
}

function runDeaths(run: HistoryRun): void {
  const rng = run.rng.notables;
  const rules = run.content.notables;
  for (const person of livingList(run)) {
    if (person.died !== undefined) continue;
    const race = raceOf(run, person);
    const elder = ageOf(run, person) >= ELDER_AT * race.lifespanYears;
    if (rng.chance(deathChance(run, person))) {
      killNotable(run, person, { cause: elder ? 'old-age' : 'disease' });
      continue;
    }
    if (person.siteId == null) continue;
    const log = logOf(run, person.siteId);
    if (log.famine?.year === run.year && rng.chance(rules.famineDeath)) {
      killNotable(run, person, { cause: 'famine', causes: [log.famine.event] });
    } else if (log.disease?.year === run.year && rng.chance(rules.diseaseDeath)) {
      killNotable(run, person, { cause: 'disease', causes: [log.disease.event] });
    }
  }
}

/** Chance a beast of `danger` kills a figure it beat in a fight: stronger figures more often live. */
export function beastKillChance(run: HistoryRun, person: Person, danger: number): number {
  return (run.content.notables.beastKill * danger) / (danger + deedSoldiers(run, person));
}

/** A beast raid may kill one notable at the raided site, the weaker the likelier. */
export function beastRaidDeaths(
  run: HistoryRun,
  site: Site,
  raid: Id,
  beast: Creature,
  danger: number,
): void {
  const rng = run.rng.notables;
  const here = livingAt(run, site.id);
  if (here.length === 0) return;
  const person = rng.pick(here);
  if (!rng.chance(beastKillChance(run, person, danger))) return;
  killNotable(run, person, { cause: 'beast', causes: [raid], beast });
}

/** A raider's party may kill one notable at the target. */
export function raidDeaths(run: HistoryRun, raider: Person, target: Site, raid: Id): void {
  const rng = run.rng.notables;
  const here = livingAt(run, target.id);
  if (here.length === 0 || !rng.chance(run.content.notables.raidKill)) return;
  killNotable(run, rng.pick(here), { cause: 'raid', killer: raider, causes: [raid] });
}

// --- founders, heroes, raiders ------------------------------------------------------------------

/** A founder for a new site, created before the founding event so it can name them. */
export function createFounder(run: HistoryRun, site: Site): Person | undefined {
  const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
  if (!civ) return undefined;
  return createAdult(run, civ, site, 'founder', run.content.notables.fame.founder);
}

/**
 * A non-ruler legend of the mother site's people, living there or within `foundRange` cells of it,
 * who will lead the settlers of a new site, with `legendFounds`; they replace the made-up founder.
 */
export function foundingLegend(run: HistoryRun, source: Site): Person | undefined {
  const civ = source.civId === null ? undefined : run.world.civs.get(source.civId);
  if (!civ) return undefined;
  const range = run.content.notables.deeds.foundRange;
  const legend = livingList(run).find((p) => {
    if (p.civId !== civ.id || p.id === civ.rulerId || !isLegend(p)) return false;
    if (!isAdult(run, p) || isElder(run, p) || p.siteId == null) return false;
    const home = run.world.sites.get(p.siteId);
    return (
      home !== undefined &&
      isLive(home) &&
      cellDistance(run.cells.width, home.cell, source.cell) <= range
    );
  });
  if (!legend || !run.rng.notables.chance(run.content.notables.deeds.legendFounds))
    return undefined;
  return legend;
}

/** The legend moves to the site they founded, gains fame, and `legend_founded` names them. */
export function legendFounded(
  run: HistoryRun,
  legend: Person,
  source: Site,
  site: Site,
  founding: Id,
): void {
  legend.siteId = site.id;
  legend.fame = Math.min(FAME_MAX, legend.fame + run.content.notables.deeds.foundingFame);
  markDeed(run, legend);
  const event = run.emit({
    type: 'legend_founded',
    actors: [legend.id],
    place: site.cell,
    causes: [founding],
    data: {
      name: legend.name,
      site: site.name,
      from: source.name,
      civ: civName(civOfPerson(run, legend)),
      kind: site.kind,
    },
  });
  addDeed(legend, event.id);
}

/** Notes the year of a figure's deed; an idle legend goes hunting (`huntIdleYears`). */
export function markDeed(run: HistoryRun, person: Person): void {
  run.notables.lastDeed.set(person.id, run.year);
}

/** Living adult legends, not elders, whose last deed is `huntIdleYears` old or more. */
export function idleLegends(run: HistoryRun): Person[] {
  const idle = run.content.notables.deeds.huntIdleYears;
  if (idle <= 0) return [];
  return livingList(run).filter(
    (p) =>
      p.magic.power >= LEGEND_POWER[0] &&
      isAdult(run, p) &&
      !isElder(run, p) &&
      run.year - (run.notables.lastDeed.get(p.id) ?? run.year) >= idle,
  );
}

/** A figure's soldier equivalent (R-24 tier midpoint, scaled as for civ strength). */
export function deedSoldiers(run: HistoryRun, person: Person): number {
  const [low, high] = TIERS[tierOfPower(person.magic.power)].soldiers;
  return ((low + high) / 2) * run.content.notables.mageStrength;
}

/**
 * The figure who answers a beast raid on a site: the strongest hero, captain or Strong+ mage of
 * its civ living within `slayerRange` cells (soldier equivalent, then fame, then lowest id).
 */
export function slayerFor(run: HistoryRun, site: Site): Person | undefined {
  if (site.civId === null) return undefined;
  const range = run.content.notables.deeds.slayerRange;
  let best: Person | undefined;
  let bestScore = -1;
  for (const person of livingList(run)) {
    if (person.civId !== site.civId || person.siteId == null) continue;
    const able =
      person.title === 'hero' || person.title === 'captain' || person.magic.power >= MAGE_POWER;
    if (!able || !isAdult(run, person) || isElder(run, person)) continue;
    const home = run.world.sites.get(person.siteId);
    if (!home || !isLive(home) || cellDistance(run.cells.width, home.cell, site.cell) > range)
      continue;
    const score = deedSoldiers(run, person) * 1000 + person.fame;
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }
  return best;
}

/** An existing figure slew a beast: fame as a new hero would have had, on top of their own. */
export function creditSlaying(run: HistoryRun, person: Person, danger: number, event: Id): void {
  const fame = run.content.notables.fame;
  const gain = Math.round(Math.min(fame.heroMax, fame.hero + fame.heroPerDanger * danger));
  person.fame = Math.min(FAME_MAX, person.fame + gain);
  addDeed(person, event);
  markDeed(run, person);
}

/** The hero who slays a beast, at the raided site; the name was rolled by the caller. */
export function createHero(
  run: HistoryRun,
  site: Site,
  name: string,
  danger: number,
): Person | undefined {
  const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
  if (!civ) return undefined;
  const fame = run.content.notables.fame;
  const standing = Math.round(Math.min(fame.heroMax, fame.hero + fame.heroPerDanger * danger));
  return createAdult(run, civ, site, 'hero', standing, name);
}

/** The civ's living raider, or a new one with `raiderChance`. */
export function raiderFor(run: HistoryRun, civ: Civ, site: Site): Person | undefined {
  const known = livingPerson(run, run.notables.raiders.get(civ.id));
  if (known) return known;
  if (!run.rng.notables.chance(run.content.notables.raiderChance)) return undefined;
  const raider = createAdult(run, civ, site, 'raider', run.content.notables.fame.raider);
  run.notables.raiders.set(civ.id, raider.id);
  return raider;
}

// --- war ----------------------------------------------------------------------------------------

/** The ruler if adult, not elder and the culture is warlike enough, else the civ's captain, else a new one. */
export function pickCaptain(run: HistoryRun, civ: Civ): Person | undefined {
  const rules = run.content.notables;
  const ruler = rulerOf(run, civ);
  const war = cultureOf(run, civ)?.values.war ?? 0;
  if (ruler && isAdult(run, ruler) && !isElder(run, ruler) && war >= rules.rulerLeadsWar)
    return ruler;
  let captain: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId === civ.id && person.title === 'captain') {
      captain = person;
      break;
    }
  }
  if (captain) return captain;
  const capital = capitalOf(run, civ);
  return capital ? createAdult(run, civ, capital, 'captain', rules.fame.captain) : undefined;
}

/** A war's captain for one side, replaced if they have died. */
export function warCaptain(run: HistoryRun, war: War, side: 'attacker' | 'defender', civ: Civ) {
  const key = side === 'attacker' ? 'attackerCaptain' : 'defenderCaptain';
  const known = livingPerson(run, war[key]);
  if (known) return known;
  const captain = pickCaptain(run, civ);
  war[key] = captain?.id;
  return captain;
}

/** Soldier strength the civ's living strong-or-better mages add (R-24 tier midpoints). */
export function mageStrength(run: HistoryRun, civ: Civ): number {
  let total = 0;
  for (const id of run.notables.living) {
    const person = run.world.people.get(id)!;
    if (person.civId !== civ.id || person.magic.power < MAGE_POWER) continue;
    const [low, high] = TIERS[tierOfPower(person.magic.power)].soldiers;
    total += (low + high) / 2;
  }
  return total * run.content.notables.mageStrength;
}

/** After a battle: the winner's captain gains fame; each captain may die at the other's hand. */
export function battleOutcome(
  run: HistoryRun,
  attacker: Person | undefined,
  defender: Person | undefined,
  attackerWins: boolean,
  battle: Id,
  field?: Site,
): Person | undefined {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  const [winner, loser] = attackerWins ? [attacker, defender] : [defender, attacker];
  if (winner) {
    winner.fame = Math.min(FAME_MAX, winner.fame + rules.fame.victory);
    addDeed(winner, battle);
  }
  if (loser) addDeed(loser, battle);
  const loserDies = rng.chance(rules.captainDeath);
  const winnerDies = rng.chance(rules.captainDeathWin);
  if (loser && loserDies) {
    killNotable(run, loser, { cause: 'battle', killer: winner, causes: [battle], at: field });
  }
  if (winner && winnerDies) {
    // A captain who fell in the same battle is not the killer: the dead do nothing more.
    const killer = loser && loser.died === undefined ? loser : undefined;
    killNotable(run, winner, { cause: 'battle', killer, causes: [battle], at: field });
  }
  return livingPerson(run, winner?.id) ?? undefined;
}

/** A legend: power in the Legendary range (R-24). */
export function isLegend(person: Person): boolean {
  return person.magic.power >= LEGEND_POWER[0];
}

/**
 * Soldiers one day of a legend's power breaks: the Legendary tier (500 at power 17 to 1,000 at
 * 20), scaled by `mageStrength` as a figure's strength is for their civ.
 */
export function legendBreaks(run: HistoryRun, person: Person): number {
  const [low, high] = TIERS.legendary.soldiers;
  const [from, to] = LEGEND_POWER;
  const t = Math.min(1, Math.max(0, (person.magic.power - from) / (to - from)));
  return (low + (high - low) * t) * run.content.notables.mageStrength;
}

/** A legend who has not yet spent their day of power this year. */
export function canSpend(run: HistoryRun, person: Person): boolean {
  return isLegend(person) && run.notables.spent.get(person.id) !== run.year;
}

/**
 * The civ's strongest living figure of champion power whose home lies within `championRange`
 * cells of the field (power, then fame, then lowest id).
 */
function championOf(run: HistoryRun, civ: Civ, field: Site): Person | undefined {
  const { championPower, championRange } = run.content.notables.deeds;
  let best: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || person.magic.power < championPower || !isAdult(run, person))
      continue;
    const home = person.siteId == null ? undefined : run.world.sites.get(person.siteId);
    if (!home || cellDistance(run.cells.width, home.cell, field.cell) > championRange) continue;
    if (
      !best ||
      person.magic.power > best.magic.power ||
      (person.magic.power === best.magic.power && person.fame > best.fame)
    )
      best = person;
  }
  return best;
}

/** Each side's champion for a battle at `field`: [attacker's, defender's]. */
export function pickChampions(
  run: HistoryRun,
  attacker: Civ,
  defender: Civ,
  field: Site,
): readonly [Person | undefined, Person | undefined] {
  return [championOf(run, attacker, field), championOf(run, defender, field)];
}

/** Two legends meet: who wins, at what odds (the winner's, 0-1), and whether the loser dies. */
export interface DuelResult {
  winner: Person;
  loser: Person;
  odds: number;
  dies: boolean;
}

/** Rolls a duel between two legends; the stronger's odds rise by `duelEdge` a point of power. */
export function rollDuel(run: HistoryRun, a: Person, b: Person): DuelResult {
  const deeds = run.content.notables.deeds;
  const rng = run.rng.notables;
  const [lo, hi] = deeds.duelOdds;
  const oddsA = Math.min(hi, Math.max(lo, 0.5 + (a.magic.power - b.magic.power) * deeds.duelEdge));
  const aWins = rng.chance(oddsA);
  const dies = rng.chance(deeds.duelDeath);
  return aWins
    ? { winner: a, loser: b, odds: oddsA, dies }
    : { winner: b, loser: a, odds: 1 - oddsA, dies };
}

/** A duel happened: `legend_duel`, fame, both legends spent for the year, and the loser may die. */
export function emitDuel(
  run: HistoryRun,
  duel: DuelResult,
  site: Site,
  causes: Id[],
  inBattle: boolean,
): SimEvent {
  const phrases = run.content.notables.deeds.duelPhrases;
  const { winner, loser } = duel;
  // A pair that met before says so; a duelled pair never feuds again.
  const pair = pairKey(winner.id, loser.id);
  const again = run.notables.feuds.has(pair);
  run.notables.feuds.add(pair);
  const event = run.emit({
    type: 'legend_duel',
    actors: [winner.id, loser.id],
    place: site.cell,
    causes,
    data: {
      name: winner.name,
      enemy: loser.name,
      civ: civName(civOfPerson(run, winner)),
      enemyCiv: civName(civOfPerson(run, loser)),
      site: site.name,
      war: inBattle ? phrases.inBattle : '',
      again: again ? phrases.again : '',
      outcome: (duel.dies ? phrases.slain : phrases.fled).replace('{enemy}', loser.name),
      odds: Math.round(duel.odds * 100),
    },
  });
  winner.fame = Math.min(FAME_MAX, winner.fame + run.content.notables.fame.victory);
  for (const person of [winner, loser]) {
    addDeed(person, event.id);
    markDeed(run, person);
    run.notables.spent.set(person.id, run.year);
  }
  if (duel.dies) {
    killNotable(run, loser, { cause: 'duel', killer: winner, causes: [event.id], at: site });
  }
  return event;
}

/** What legends did in a battle before it was settled: a duel, or soldiers broken per side. */
export interface LegendPlay {
  duel?: DuelResult | undefined;
  /** Soldiers each side's legend broke: [attacker's, defender's]. */
  broke: [number, number];
  /** The host a legend faced was bigger than they could break. */
  overmatched: [boolean, boolean];
  /** The break changed who won. */
  turned: boolean;
}

/**
 * Each side's champion fights in the battle: fame on victory, and the captains' odds of falling.
 * `champion_fought` names them in their first battle of the war and in the one they fall in; a
 * legend who breaks a host is named every time, and dies at `legendDeath` or, overmatched,
 * `bigHostDeath`. Two legends duel instead (`legend_duel`). A champion who led the side was
 * already judged by `battleOutcome`; they get no second roll.
 */
export function battleChampions(
  run: HistoryRun,
  options: {
    attacker: Civ;
    defender: Civ;
    attackerWins: boolean;
    site: Site;
    battle: Id;
    war: War;
    leads: readonly (Person | undefined)[];
    champions: readonly [Person | undefined, Person | undefined];
    legends: LegendPlay;
  },
): void {
  const { attacker, defender, attackerWins, site, battle, war, leads, champions, legends } =
    options;
  const rules = run.content.notables;
  const rng = run.rng.notables;
  if (legends.duel) emitDuel(run, legends.duel, site, [battle], true);
  const sides = [
    { civ: attacker, enemy: defender, won: attackerWins },
    { civ: defender, enemy: attacker, won: !attackerWins },
  ];
  sides.forEach((side, index) => {
    const champion = champions[index];
    if (!champion || champion.died !== undefined) return;
    // Duellists spent their day on each other; the duel is their deed.
    if (legends.duel && [legends.duel.winner.id, legends.duel.loser.id].includes(champion.id))
      return;
    const other = champions[1 - index];
    const broke = legends.broke[index]!;
    const led = leads.some((p) => p?.id === champion.id);
    markDeed(run, champion);
    let deathChance = side.won ? rules.captainDeathWin : rules.captainDeath;
    if (broke > 0) {
      run.notables.spent.set(champion.id, run.year);
      deathChance = legends.overmatched[index] ? rules.deeds.bigHostDeath : rules.deeds.legendDeath;
    }
    const dies = !led && rng.chance(deathChance);
    if (side.won && !led) champion.fame = Math.min(FAME_MAX, champion.fame + rules.fame.victory);
    const named = (war.champions ??= []).includes(champion.id);
    // Named again only when it matters: a broken host that turned the day, or a fall.
    if (named && !dies && !(broke > 0 && legends.turned)) return;
    // A champion of a side that already had one steps up in their place.
    const replacing = war.champions.some(
      (id) => id !== champion.id && run.world.people.get(id)?.civId === side.civ.id,
    );
    if (!named) war.champions.push(champion.id);
    const phrases = rules.deeds.championPhrases;
    const stand =
      broke > 0
        ? rules.deeds.brokeStand.replace('{broke}', thousands(broke))
        : named
          ? phrases.again
          : replacing
            ? phrases.replaced
            : phrases.first;
    const result = side.won ? phrases.won : phrases.lost;
    const fill = (text: string) =>
      text
        .replace('{civ}', side.civ.name)
        .replace('{enemy}', side.enemy.name)
        .replace('{name}', champion.name);
    const event = run.emit({
      type: 'champion_fought',
      actors: [champion.id],
      place: site.cell,
      causes: [battle],
      data: {
        name: champion.name,
        civ: side.civ.name,
        enemy: side.enemy.name,
        site: site.name,
        stand: fill(stand),
        outcome: fill(
          dies ? `${result}, ${side.won ? phrases.fellWon : phrases.fellLost}` : result,
        ),
        broke,
        turned: broke > 0 && legends.turned ? 1 : 0,
      },
    });
    addDeed(champion, event.id);
    if (dies) {
      const killer = other && other.died === undefined ? other : undefined;
      killNotable(run, champion, { cause: 'battle', killer, causes: [event.id], at: site });
    }
  });
}

/**
 * Two living legends of peoples with a grievance of `feudGrievance` between them, not at war, homes within
 * `feudRange` cells: with `feudChance` a year they duel at the home of the one challenged. The
 * challenger is the legend whose people hold the larger grievance. The loser's people take it as
 * an insult.
 */
export function legendFeuds(run: HistoryRun): void {
  const deeds = run.content.notables.deeds;
  if (deeds.feudChance <= 0) return;
  const rng = run.rng.notables;
  const ready = livingList(run).filter(
    (p) =>
      canSpend(run, p) &&
      isAdult(run, p) &&
      !isElder(run, p) &&
      p.civId != null &&
      p.siteId != null,
  );
  for (let i = 0; i < ready.length; i += 1) {
    for (let j = i + 1; j < ready.length; j += 1) {
      const a = ready[i]!;
      const b = ready[j]!;
      if (!canSpend(run, a) || !canSpend(run, b) || a.died !== undefined || b.died !== undefined)
        continue;
      if (a.civId === b.civId || atWar(run, a.civId!, b.civId!)) continue;
      if (run.notables.feuds.has(pairKey(a.id, b.id))) continue;
      const civA = run.world.civs.get(a.civId!);
      const civB = run.world.civs.get(b.civId!);
      if (!civA || !civB || civA.fell !== undefined || civB.fell !== undefined) continue;
      const grudgeA = civA.grievances.get(civB.id) ?? 0;
      const grudgeB = civB.grievances.get(civA.id) ?? 0;
      if (Math.max(grudgeA, grudgeB) < deeds.feudGrievance) continue;
      const homeA = run.world.sites.get(a.siteId!);
      const homeB = run.world.sites.get(b.siteId!);
      if (!homeA || !homeB || !isLive(homeA) || !isLive(homeB)) continue;
      if (cellDistance(run.cells.width, homeA.cell, homeB.cell) > deeds.feudRange) continue;
      if (!rng.chance(deeds.feudChance)) continue;
      const [challenger, challenged, field] = grudgeA >= grudgeB ? [a, b, homeB] : [b, a, homeA];
      const duel = rollDuel(run, challenger, challenged);
      const cause = challenger.deeds[challenger.deeds.length - 1];
      const event = emitDuel(run, duel, field, cause === undefined ? [] : [cause], false);
      const loserCiv = civOfPerson(run, duel.loser);
      const winnerCiv = civOfPerson(run, duel.winner);
      if (loserCiv && winnerCiv && loserCiv.fell === undefined)
        addGrievance(run, loserCiv.id, winnerCiv.id, run.rules.grievance.insult, event.id);
    }
  }
}

/** A declared war's captains: created or chosen before the event, so it can name them. */
export function startCaptains(run: HistoryRun, attacker: Civ, defender: Civ) {
  return [pickCaptain(run, attacker), pickCaptain(run, defender)] as const;
}

/**
 * A site taken or razed: its defenders' items go to the attacker's leader, a razing kills
 * some of its notables, and the rest withdraw to their civ's capital.
 */
export function siteLost(
  run: HistoryRun,
  options: {
    site: Site;
    attacker: Civ;
    defender: Civ;
    event: Id;
    razed: boolean;
    lead?: Person | undefined;
  },
): void {
  const { site, attacker, defender, event, razed } = options;
  const rules = run.content.notables;
  const thief = livingPerson(run, options.lead?.id) ?? rulerOf(run, attacker);
  const victims = livingList(run).filter((p) => p.siteId === site.id && p.civId === defender.id);
  if (thief) {
    for (const victim of victims) {
      for (const item of itemsHeldBy(run, victim)) stealItem(run, item, thief, event);
    }
  }
  const refuge = defender.fell === undefined ? run.world.sites.get(defender.capital) : undefined;
  for (const victim of victims) {
    if (razed && run.rng.notables.chance(rules.razeDeathShare)) {
      killNotable(run, victim, { cause: 'razing', killer: thief, causes: [event] });
      continue;
    }
    if (refuge && isLive(refuge) && refuge.id !== site.id) victim.siteId = refuge.id;
    else if (razed) {
      victim.siteId = null;
      victim.civId = null;
    } else victim.civId = attacker.id;
  }
}

/** The notables of an abandoned site go to the refuge (or the capital) if there is one. */
export function relocateNotables(run: HistoryRun, site: Site, refuge: Site | undefined): void {
  for (const person of livingList(run)) {
    if (person.siteId !== site.id) continue;
    person.siteId = refuge && isLive(refuge) ? refuge.id : null;
  }
}

// --- succession ---------------------------------------------------------------------------------

const eldestFirst = (a: Person, b: Person) => a.born - b.born || a.id - b.id;

function livingKin(run: HistoryRun, ids: readonly Id[], civ: Civ): Person[] {
  const out: Person[] = [];
  for (const id of ids) {
    const person = livingPerson(run, id);
    if (person && person.civId === civ.id) out.push(person);
  }
  return out.sort(eldestFirst);
}

const charisma = (person: Person) => person.attributes.charisma;

/** The heir by the culture's rule, and the rival claimant if the choice is contestable. */
function chooseHeir(
  run: HistoryRun,
  civ: Civ,
  dead: Person,
): { heir?: Person | undefined; challenger?: Person | undefined } {
  const rules = run.content.notables;
  const rule = cultureOf(run, civ)?.succession;
  const children = livingKin(run, dead.family.children, civ);
  const sons = children.filter((p) => p.sex === 'm');
  const siblings = siblingsOf(run, dead).filter(
    (p) => livingPerson(run, p.id) && p.civId === civ.id,
  );
  siblings.sort(eldestFirst);
  const nieces = livingKin(
    run,
    siblings.flatMap((s) => s.family.children),
    civ,
  );
  const kin = [...siblings, ...nieces];
  const adults = (list: Person[]) => list.filter((p) => isAdult(run, p));
  const bestClaimant = (list: Person[]) =>
    adults(list).sort((a, b) => b.fame + charisma(b) - (a.fame + charisma(a)) || a.id - b.id)[0];

  if (rule === 'kin-elected') {
    const spouse = livingKin(run, dead.family.spouses, civ);
    const score = (p: Person) => p.fame + charisma(p) * 2;
    const pool = adults([...children, ...siblings, ...nieces, ...spouse]).sort(
      (a, b) => score(b) - score(a) || a.id - b.id,
    );
    const [top, second] = pool;
    const contested = top && second && score(top) - score(second) <= rules.disputeMargin;
    return { heir: top, challenger: contested ? second : undefined };
  }
  if (rule === 'elder-council') {
    const pool: Person[] = [];
    for (const person of livingList(run)) {
      if (person.civId === civ.id && isAdult(run, person) && person.id !== dead.id)
        pool.push(person);
    }
    pool.sort((a, b) => ageOf(run, b) + b.fame - (ageOf(run, a) + a.fame) || a.id - b.id);
    return { heir: pool[0] };
  }
  let heir: Person | undefined;
  let challenger: Person | undefined;
  if (rule === 'brother-first-gathering') {
    const brothers = adults(siblings.filter((p) => p.sex === 'm'));
    heir = brothers[0] ?? sons[0] ?? kin[0];
    // A grown son has a claim against his uncle.
    if (brothers[0]) challenger = adults(sons)[0];
  } else if (rule === 'eldest-child') {
    heir = children[0] ?? kin[0];
  } else if (rule === 'eldest-daughter') {
    heir =
      children.find((p) => p.sex === 'f') ??
      kin.find((p) => p.sex === 'f') ??
      children[0] ??
      kin[0];
  } else if (rule === 'trial-of-strength') {
    // The strongest grown kin takes the seat; the next strongest always has a claim.
    const byStrength = adults(kin.concat(children)).sort(
      (a, b) => b.attributes.strength - a.attributes.strength || a.id - b.id,
    );
    heir = byStrength[0] ?? children[0] ?? kin[0];
    challenger = byStrength[1];
  } else {
    heir = sons[0] ?? children[0] ?? kin[0];
  }
  // A child on the seat invites an adult kinsman to claim it.
  if (heir && !challenger && !isAdult(run, heir)) {
    challenger = bestClaimant(kin.filter((p) => p.id !== heir!.id));
  }
  return { heir, challenger };
}

/** A ruler has died: the culture's rule picks the heir, a dispute may overturn it, or the seat falls to the best-known adult. */
function succeed(run: HistoryRun, civ: Civ, dead: Person, death: SimEvent): void {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  const culture = cultureOf(run, civ);
  const causes = [death.id];
  const { heir: chosen, challenger } = chooseHeir(run, civ, dead);
  let heir = chosen;
  let phrase = culture ? rules.successionPhrases[culture.succession] : rules.noHeirPhrase;
  // Free peoples quarrel over a seat more readily; ordered ones keep to custom.
  const unruly = culture
    ? 1 + (culture.values.freedom - culture.values.order) * run.rules.cultureValues.disputeSlope
    : 1;
  const disputeChance = Math.min(1, Math.max(0, rules.disputeChance * unruly));
  if (heir && challenger && challenger.id !== heir.id && rng.chance(disputeChance)) {
    const dispute = run.emit({
      type: 'succession_disputed',
      actors: [heir.id, challenger.id],
      place: capitalOf(run, civ)?.cell ?? null,
      causes: [death.id],
      data: { a: heir.name, b: challenger.name, prior: dead.name, civ: civ.name },
    });
    const scoreHeir = heir.fame + charisma(heir) + rng.between(0, rules.disputeLuck);
    const scoreChallenger =
      challenger.fame + charisma(challenger) + rng.between(0, rules.disputeLuck);
    const [winner, loser] = scoreChallenger > scoreHeir ? [challenger, heir] : [heir, challenger];
    makeRivals(winner, loser);
    addDeed(winner, dispute.id);
    addDeed(loser, dispute.id);
    swearOath(run, loser, winner, dead, dispute.id);
    const custom = phrase;
    phrase = rules.disputePhrases[winner.id === heir.id ? 'held' : 'seized']
      .replace('{rule}', custom)
      .replace('{rival}', loser.name);
    heir = winner;
    causes.push(dispute.id);
    // The beaten claimant may raise part of the realm (civil-war.ts, later this year).
    run.claims.push({ civ: civ.id, claimant: loser.id, ruler: winner.id, dispute: dispute.id });
  }
  if (!heir) {
    phrase = rules.noHeirPhrase;
    heir = mostFamous(run, civ.id, true);
    if (heir?.id === dead.id) heir = undefined;
  }
  const capital = capitalOf(run, civ);
  if (!heir && capital) {
    const race = run.races.get(civ.raceId)!;
    heir = createPerson(run, {
      raceId: civ.raceId,
      cultureId: civ.cultureId,
      siteId: capital.id,
      civId: civ.id,
      cell: capital.cell,
      title: 'ruler',
      age: rng.between(race.maturityYears, race.maturityYears + NEW_RULER_SPAN),
      fame: 0,
    });
  }
  if (!heir) return;
  heir.title = 'ruler';
  heir.civId = civ.id;
  if (capital) heir.siteId = capital.id;
  heir.fame = Math.max(heir.fame, rules.fame.ruler);
  civ.rulerId = heir.id;
  const event = run.emit({
    type: 'ruler_succeeded',
    actors: [heir.id, dead.id],
    place: capital?.cell ?? null,
    causes,
    data: { ruler: heir.name, prior: dead.name, civ: civ.name, rule: phrase },
  });
  addDeed(heir, event.id);
  seatHouse(run, civ, heir, dead, event.id);
}

// --- marriage and children ----------------------------------------------------------------------

/** The person's most recently dead spouse, if any. */
function lateSpouse(run: HistoryRun, p: Person): Person | undefined {
  let late: Person | undefined;
  for (const id of p.family.spouses) {
    const spouse = run.world.people.get(id);
    if (spouse?.died !== undefined && (!late || spouse.died > late.died!)) late = spouse;
  }
  return late;
}

const inMourning = (run: HistoryRun, p: Person) => {
  const late = lateSpouse(run, p);
  return late !== undefined && run.year - late.died! < run.content.notables.mourningYears;
};

const eligibleToMarry = (run: HistoryRun, p: Person) =>
  p.civId != null &&
  isAdult(run, p) &&
  !isElder(run, p) &&
  !isMarried(run, p) &&
  !inMourning(run, p);

/** True if either has had a spouse of the other's name: a second "Erilu" reads as the same one. */
function sharesSpouseName(run: HistoryRun, a: Person, b: Person): boolean {
  const named = (p: Person, name: string) =>
    p.family.spouses.some((id) => run.world.people.get(id)?.name === name);
  return named(a, b.name) || named(b, a.name);
}

/** Civs sharing a link between their sites with the given civ, not at war with it. */
function linkedCivs(run: HistoryRun, civId: Id): Set<Id> {
  const out = new Set<Id>();
  for (const site of liveSites(run)) {
    if (site.civId !== civId) continue;
    for (const id of run.links.get(site.id) ?? []) {
      const other = run.world.sites.get(id);
      if (other && isLive(other) && other.civId !== null && other.civId !== civId) {
        out.add(other.civId);
      }
    }
  }
  return out;
}

function marriageEvent(run: HistoryRun, a: Person, b: Person, otherCiv: Civ | undefined) {
  const civA = civOfPerson(run, a);
  const bond =
    otherCiv && civA && otherCiv.id !== civA.id
      ? `binding the ${civA.name} to the ${otherCiv.name}`
      : `both of the ${civName(civA)}`;
  const data: SimEvent['data'] = {
    a: a.name,
    b: b.name,
    site: siteOf(run, a)?.name ?? 'the wilds',
    bond,
  };
  // A widow or widower's new marriage says whom they lost, so it never reads as the first again.
  const widowed = [a, b].find((p) => lateSpouse(run, p) !== undefined);
  const late = widowed && lateSpouse(run, widowed);
  if (widowed && late)
    Object.assign(data, { who: widowed.name, late: late.name, lateYear: late.died! });
  const event = run.emit({
    type: late ? 'remarriage' : 'marriage',
    actors: [a.id, b.id],
    place: placeOf(run, a),
    causes: [],
    data,
  });
  addDeed(a, event.id);
  addDeed(b, event.id);
}

/** A new spouse for a notable, of the other sex and about their age, living beside them. */
function createSpouse(run: HistoryRun, of: Person): Person {
  const race = raceOf(run, of);
  const age = ageOf(run, of);
  const low = Math.max(race.maturityYears, age - SPOUSE_AGE_GAP);
  const spouseAge = run.rng.notables.between(low, Math.max(low, age + SPOUSE_AGE_GAP));
  // Never a second spouse with an earlier one's name (a few rerolls; the name lists are long).
  const culture = run.content.cultures.find((c) => c.id === of.cultureId)!;
  const taken = new Set(of.family.spouses.map((id) => run.world.people.get(id)?.name));
  const sex = of.sex === 'f' ? 'm' : 'f';
  let name = cultureGivenName(culture.names, run.rng.notables, sex);
  for (let tries = 0; taken.has(name) && tries < NAME_REROLLS; tries += 1)
    name = cultureGivenName(culture.names, run.rng.notables, sex);
  const spouse = createPerson(run, {
    name,
    raceId: of.raceId,
    cultureId: of.cultureId!,
    siteId: of.siteId ?? null,
    civId: of.civId ?? null,
    cell: placeOf(run, of),
    title: 'kin',
    age: spouseAge,
    sex,
    fame: 0,
  });
  wed(of, spouse);
  return spouse;
}

/** Living notables per site, for `siteHasRoom`. */
function notablesBySite(run: HistoryRun): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const person of livingList(run)) {
    if (person.died !== undefined || person.siteId == null) continue;
    counts.set(person.siteId, (counts.get(person.siteId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether a site's named folk may grow by one: they stay under `siteShare` of its people, so a
 * small free city never houses a dynasty larger than the town. Counts the newcomer when it does.
 */
function siteHasRoom(run: HistoryRun, counts: Map<Id, number>, siteId: Id | null | undefined) {
  const site = siteId == null ? undefined : run.world.sites.get(siteId);
  if (!site) return false;
  const here = counts.get(site.id) ?? 0;
  if (here + 1 > totalPop(site) * run.content.notables.siteShare) return false;
  counts.set(site.id, here + 1);
  return true;
}

function runMarriages(run: HistoryRun): void {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  const cap = rules.notableCap;
  const counts = notablesBySite(run);
  const pool = new Map<Id, Person[]>();
  for (const person of livingList(run)) {
    if (!eligibleToMarry(run, person)) continue;
    const list = pool.get(person.civId!);
    if (list) list.push(person);
    else pool.set(person.civId!, [person]);
  }
  let linked: Map<Id, Set<Id>> | undefined;
  for (const person of livingList(run)) {
    if (person.died !== undefined || !eligibleToMarry(run, person)) continue;
    if (!rng.chance(rules.marryChance)) continue;
    const civ = civOfPerson(run, person)!;
    const culture = cultureOf(run, civ);
    const open = (q: Person) =>
      q.id !== person.id &&
      q.sex !== person.sex &&
      !closeKin(person, q) &&
      eligibleToMarry(run, q) &&
      !sharesSpouseName(run, person, q);
    let partner: Person | undefined;
    let otherCiv: Civ | undefined;
    // A ruler's child in an arranged-marriage culture may be matched with a linked civ.
    const ruler = rulerOf(run, civ);
    if (culture?.marriage.arranged && ruler && person.family.parents.includes(ruler.id)) {
      // Peoples who prize kinship seek marriage ties abroad more often.
      const kin = (culture.values.kin ?? 5) / run.rules.cultureValues.kinNeutral;
      if (rng.chance(Math.min(1, rules.allianceChance * kin))) {
        linked ??= new Map();
        if (!linked.has(civ.id)) linked.set(civ.id, linkedCivs(run, civ.id));
        const options: Person[] = [];
        for (const otherId of linked.get(civ.id)!) {
          const foreign = run.world.civs.get(otherId);
          if (!foreign || foreign.fell !== undefined || atWar(run, civ.id, otherId)) continue;
          for (const q of pool.get(otherId) ?? []) {
            if (q.title !== 'ruler' && open(q)) options.push(q);
          }
        }
        if (options.length > 0) {
          partner = rng.pick(options);
          otherCiv = civOfPerson(run, partner);
        }
      }
    }
    if (!partner) {
      const options = (pool.get(civ.id) ?? []).filter(open);
      const outside = options.filter(
        (q) => q.dynastyId === undefined || q.dynastyId !== person.dynastyId,
      );
      const list = outside.length > 0 ? outside : options;
      if (list.length > 0) partner = rng.pick(list);
    }
    if (!partner) {
      if (run.notables.living.size >= cap || !siteHasRoom(run, counts, person.siteId)) continue;
      partner = createSpouse(run, person);
      marriageEvent(run, person, partner, undefined);
      continue;
    }
    wed(person, partner);
    if (otherCiv) {
      // The partner joins the ruler's child, and the two peoples forgive each other a little.
      partner.civId = civ.id;
      partner.siteId = person.siteId ?? null;
      for (const [from, to] of [
        [civ, otherCiv],
        [otherCiv, civ],
      ] as const) {
        const grievance = from.grievances.get(to.id);
        if (grievance !== undefined)
          from.grievances.set(to.id, grievance * (1 - rules.allianceGrievanceCut));
      }
    }
    marriageEvent(run, person, partner, otherCiv);
  }
  // Some cultures let a ruler take more than one spouse.
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    const ruler = rulerOf(run, civ);
    if (!ruler || cultureOf(run, civ)?.marriage.custom !== 'leaders-many-spouses') continue;
    if (!isMarried(run, ruler) || !isAdult(run, ruler) || isElder(run, ruler)) continue;
    if (inMourning(run, ruler)) continue;
    if (run.notables.living.size >= cap || !rng.chance(rules.extraSpouseChance)) continue;
    if (!siteHasRoom(run, counts, ruler.siteId)) continue;
    marriageEvent(run, ruler, createSpouse(run, ruler), undefined);
  }
}

function schoolOf(person: Person): string {
  return primarySchool(person) ?? 'wild';
}

/** A birth or a mage's birth event; mages are strong or better at birth. */
function birthEvent(run: HistoryRun, child: Person, parents: string, site: Site | undefined) {
  const rules = run.content.notables;
  const tier = tierOfPower(child.magic.power);
  const mage = child.magic.power >= MAGE_POWER;
  if (mage) child.fame = rules.fame.mage[tier] ?? 0;
  const civ = civOfPerson(run, child);
  const event = run.emit({
    type: mage ? 'mage_born' : 'notable_born',
    actors: [child.id, ...child.family.parents],
    place: placeOf(run, child),
    causes: [],
    data: mage
      ? {
          child: child.name,
          parents,
          site: site?.name ?? 'the wilds',
          civ: civName(civ),
          tier,
          school: schoolOf(child),
        }
      : {
          child: child.name,
          parents,
          site: site?.name ?? 'the wilds',
          dynasty: dynastyName(run, child),
        },
  });
  addDeed(child, event.id);
  for (const id of child.family.parents) addDeed(run.world.people.get(id)!, event.id);
}

function runBirths(run: HistoryRun): void {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  const counts = notablesBySite(run);
  for (const mother of livingList(run)) {
    if (mother.sex !== 'f' || mother.died !== undefined || mother.siteId == null) continue;
    if (!isFertile(run, mother)) continue;
    const father = mother.family.spouses
      .map((id) => livingPerson(run, id))
      .find((p) => p !== undefined && p.sex === 'm');
    if (!father) continue;
    const room = Math.max(0, 1 - run.notables.living.size / rules.notableCap);
    if (!rng.chance(rules.childChance * raceOf(run, mother).fertility * room)) continue;
    if (!siteHasRoom(run, counts, mother.siteId)) continue;
    const child = createPerson(run, {
      raceId: mother.raceId,
      cultureId: mother.cultureId!,
      siteId: mother.siteId,
      civId: mother.civId ?? null,
      cell: placeOf(run, mother),
      title: 'kin',
      age: 0,
      parents: [mother, father],
      dynastyId: dynastyFor(run, mother, father),
      fame: 0,
    });
    birthEvent(run, child, `${mother.name} and ${father.name}`, siteOf(run, mother));
  }
}

/** Odds that a birth of the race is strong or better (the same weights `rollMagic` uses). */
function strongOdds(run: HistoryRun, raceId: string, aura: number): number {
  const high = aura >= 90 ? 1 : 0;
  const key = `${raceId}:${high}`;
  const known = run.notables.mageOdds.get(key);
  if (known !== undefined) return known;
  const race = run.races.get(raceId)!;
  let total = 0;
  let strong = 0;
  BIRTH_TIER_IDS.forEach((id, index) => {
    const weight = race.magicTierWeights[id] * (high === 1 && id !== 'none' ? 1.25 : 1);
    total += weight;
    if (index >= BIRTH_TIER_IDS.indexOf('strong')) strong += weight;
  });
  const odds = total > 0 ? strong / total : 0;
  run.notables.mageOdds.set(key, odds);
  return odds;
}

/** Commoners' strong-or-better births that get noticed become mage notables. */
function runCommonerMages(run: HistoryRun): void {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  for (const site of liveSites(run)) {
    const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
    if (!civ || civ.fell !== undefined) continue;
    const aura = run.cells.aura[site.cell]!;
    for (const band of site.pop) {
      if (band.band !== 'adult' || band.count <= 0) continue;
      const race = run.races.get(band.raceId);
      if (!race) continue;
      const expected =
        band.count *
        rules.mageBirthRate *
        race.fertility *
        strongOdds(run, race.id, aura) *
        rules.mageNotice *
        noticeFactor(run, civ.id);
      for (let n = stochasticRound(rng, expected); n > 0; n -= 1) {
        const mage = createPerson(run, {
          raceId: race.id,
          cultureId: band.cultureId,
          siteId: site.id,
          civId: civ.id,
          cell: site.cell,
          title: 'mage',
          age: 0,
          fame: 0,
          minTier: 'strong',
        });
        birthEvent(run, mage, 'common folk', site);
      }
    }
  }
}

/**
 * The person's latest deed of renown (`risePhrases`) that they led, within `riseYears`: what makes
 * the tales count them a legend (REBOOT_PLAN §1B.8, fame comes from deeds, not from power).
 */
function renownDeed(run: HistoryRun, person: Person): SimEvent | undefined {
  const { riseYears, risePhrases } = run.content.notables.deeds;
  const since = (run.year - riseYears) * DAYS_PER_YEAR;
  let best: SimEvent | undefined;
  for (const id of person.deeds) {
    const event = eventById(run, id);
    if (!event || event.day < since || event.actors[0] !== person.id) continue;
    if (risePhrases[event.type] === undefined) continue;
    if (!best || event.id > best.id) best = event;
  }
  return best;
}

/** The deed's phrase with its own event's names filled in. */
function deedPhrase(run: HistoryRun, deed: SimEvent): string {
  const phrase = run.content.notables.deeds.risePhrases[deed.type] ?? '';
  return phrase.replace(/\{(\w+)\}/g, (_, key: string) => String(deed.data[key] ?? ''));
}

/**
 * Adults of exceptional power may grow legendary on the back of a recent deed of renown, while
 * fewer than the cap are alive; the rise names the deed and is caused by it.
 */
function runLegends(run: HistoryRun): void {
  const rules = run.content.notables;
  const rng = run.rng.notables;
  let alive = 0;
  for (const person of livingList(run)) if (person.magic.power >= LEGEND_POWER[0]) alive += 1;
  for (const person of livingList(run)) {
    if (person.magic.power < LEGEND_FROM || person.magic.power >= LEGEND_POWER[0]) continue;
    if (!isAdult(run, person) || !legendSlotOpen(alive)) continue;
    const deed = renownDeed(run, person);
    if (!deed) continue;
    if (!rng.chance(rules.legendChance * legendFactor(run, person.civId))) continue;
    person.magic.power = rng.between(LEGEND_POWER[0], LEGEND_POWER[1]);
    const school = schoolOf(person);
    person.magic.affinities[school] = Math.max(
      person.magic.affinities[school] ?? 0,
      person.magic.power - 1,
    );
    person.fame = Math.max(person.fame, rules.fame.legend);
    markDeed(run, person);
    alive += 1;
    const event = run.emit({
      type: 'legend_risen',
      actors: [person.id],
      place: placeOf(run, person),
      causes: [deed.id],
      data: {
        name: person.name,
        school,
        deed: deedPhrase(run, deed),
        site: siteOf(run, person)?.name ?? 'the wilds',
        civ: civName(civOfPerson(run, person)),
      },
    });
    addDeed(person, event.id);
  }
}

/** Notables of a fallen civ serve the civ that holds their site, else nobody. */
function releaseFallen(run: HistoryRun): void {
  for (const person of livingList(run)) {
    const civ = civOfPerson(run, person);
    if (!civ || civ.fell === undefined) continue;
    const holder = siteOf(run, person)?.civId ?? null;
    const holding = holder === null ? undefined : run.world.civs.get(holder);
    person.civId = holding && holding.fell === undefined ? holder : null;
  }
}

/** Yearly: deaths, marriages, births, mages from the commons and legends. */
export function runNotables(run: HistoryRun): void {
  rebuildIndex(run);
  releaseFallen(run);
  runDeaths(run);
  runMarriages(run);
  runBirths(run);
  runCommonerMages(run);
  runLegends(run);
}
