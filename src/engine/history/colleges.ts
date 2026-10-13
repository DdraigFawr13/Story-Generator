// Colleges of magic (playtest add-on): a learned people with a strong mage may open a college in
// one of its towns. Its people notice more mage births among the commons, its mages grow stronger
// and rise to legend more often, and its masters (and any legend) work spells on the troubles of
// nearby sites: they break a dry or cold spell, ward a town against a sickness, or make the fields
// bear after a famine. A college burns with its site and passes to whoever conquers it.

import type { SpellDef } from '../core/content-types';
import type { Civ, Id, Person, Site } from '../core/types';
import { TIERS } from '../people/tiers';
import { epochAt } from './climate';
import { primarySchool } from './items';
import { addDeed, civOfPerson, isAdult, isElder, livingList, siteOf } from './people';
import { totalPop } from './pop';
import { cellDistance } from './settle';
import { atWar, cultureOf, isLive, liveSites, logOf, type College, type HistoryRun } from './state';

const STRONG = TIERS.strong.minPower;
const LEGENDARY = TIERS.legendary.minPower;
const FAME_MAX = 100;
const DECADE = 10;

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Open colleges, in founding order. */
function openColleges(run: HistoryRun): College[] {
  return run.colleges.filter((c) => c.closed === undefined);
}

/** The open college of a civ, if it has one. */
export function collegeOf(run: HistoryRun, civId: Id | null | undefined): College | undefined {
  if (civId === null || civId === undefined) return undefined;
  return run.colleges.find((c) => c.closed === undefined && c.civId === civId);
}

/** How many times the usual share of mage births a civ's commons have noticed. */
export function noticeFactor(run: HistoryRun, civId: Id | null): number {
  return collegeOf(run, civId) ? run.rules.colleges.noticeFactor : 1;
}

/** How many times as likely a civ's mages are to rise to legend. */
export function legendFactor(run: HistoryRun, civId: Id | null | undefined): number {
  return collegeOf(run, civId) ? run.rules.colleges.legendFactor : 1;
}

/** A college closes when its site is ruined; it serves whoever holds the site. */
function followSites(run: HistoryRun): void {
  for (const college of openColleges(run)) {
    const site = run.world.sites.get(college.siteId);
    if (!site || !isLive(site) || site.civId === null) {
      college.closed = run.year;
      run.emit({
        type: 'college_closed',
        place: site?.cell ?? null,
        causes: [college.event],
        data: { college: college.name, site: site?.name ?? 'the ruins' },
      });
      continue;
    }
    college.civId = site.civId;
  }
}

/** The strongest living Strong+ adult mage of a civ (fame, then lowest id, on ties). */
function strongestMage(run: HistoryRun, civ: Civ): Person | undefined {
  let best: Person | undefined;
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || person.magic.power < STRONG || !isAdult(run, person)) continue;
    if (
      !best ||
      person.magic.power > best.magic.power ||
      (person.magic.power === best.magic.power && person.fame > best.fame)
    )
      best = person;
  }
  return best;
}

/** Each decade, a learned civ with a strong mage may open a college in its largest fit site. */
function foundColleges(run: HistoryRun): void {
  const rules = run.rules.colleges;
  const rng = run.rng.magic;
  for (const civ of run.world.civs.values()) {
    if (openColleges(run).length >= rules.maxOpen) return;
    if (civ.fell !== undefined || collegeOf(run, civ.id)) continue;
    const master = strongestMage(run, civ);
    if (!master) continue;
    const learning = cultureOf(run, civ)?.values.learning ?? 0;
    if (!rng.chance((rules.foundChance * learning) / 10)) continue;
    // An aura spot or temple first, then the capital, then the most people.
    let site: Site | undefined;
    let best = -1;
    for (const s of liveSites(run)) {
      if (s.civId !== civ.id || totalPop(s) < rules.minPop) continue;
      const score =
        (s.features.includes('aura') || s.kind === 'temple' ? 2 : 0) +
        (s.id === civ.capital ? 1 : 0) +
        totalPop(s) / 100000;
      if (score > best) {
        best = score;
        site = s;
      }
    }
    if (!site) continue;
    const school = primarySchool(master) ?? 'wild';
    const name = rng
      .pick(rules.names)
      .replace('{site}', site.name)
      .replace('{school}', cap(school));
    master.siteId = site.id;
    master.fame = Math.min(FAME_MAX, master.fame + rules.spellFame);
    run.notables.lastDeed.set(master.id, run.year);
    const event = run.emit({
      type: 'college_founded',
      actors: [master.id],
      place: site.cell,
      causes: master.deeds.slice(-1),
      data: { name: master.name, college: name, site: site.name, civ: civ.name, school },
    });
    addDeed(master, event.id);
    run.colleges.push({
      name,
      siteId: site.id,
      civId: civ.id,
      school,
      founded: run.year,
      event: event.id,
    });
  }
}

/** The open college nearest a site within `travelRange`, of a people not at war with `civId`. */
function collegeInReach(run: HistoryRun, from: Site, civId: Id): College | undefined {
  let best: College | undefined;
  let nearest = Infinity;
  for (const college of openColleges(run)) {
    if (college.civId === civId || atWar(run, college.civId, civId)) continue;
    const site = run.world.sites.get(college.siteId)!;
    const distance = cellDistance(run.cells.width, from.cell, site.cell);
    if (distance <= run.rules.colleges.travelRange && distance < nearest) {
      nearest = distance;
      best = college;
    }
  }
  return best;
}

/**
 * Gifted mages of peoples without a college travel to one in reach and study there for
 * `studyYears`; they go home early if their people go to war with the college's. A student who
 * came back stronger is named, and may work spells for their own people from then on.
 */
function travelAbroad(run: HistoryRun): void {
  const rules = run.rules.colleges;
  for (const [id, student] of [...run.students]) {
    const person = run.world.people.get(id)!;
    const college = run.colleges.find((c) => c.siteId === student.siteId && c.closed === undefined);
    const atWarNow = college !== undefined && atWar(run, college.civId, person.civId ?? null);
    if (person.died === undefined && college && !atWarNow && run.year < student.until) continue;
    run.students.delete(id);
    // Each mage goes abroad once in their life.
    run.studied.add(id);
    if (person.died !== undefined) continue;
    const civ = civOfPerson(run, person);
    const home = run.world.sites.get(student.home);
    const back = home && isLive(home) && home.civId === person.civId ? home : undefined;
    const seat = civ ? run.world.sites.get(civ.capital) : undefined;
    person.siteId = (back ?? seat)?.id ?? person.siteId ?? null;
    if (person.magic.power <= student.power) continue;
    const event = run.emit({
      type: 'mage_came_home',
      actors: [id],
      place: siteOf(run, person)?.cell ?? null,
      causes: [student.event],
      data: {
        name: person.name,
        college: college?.name ?? 'the college',
        site: siteOf(run, person)?.name ?? 'the wilds',
        civ: civ?.name ?? '',
        school: primarySchool(person) ?? 'wild',
      },
    });
    addDeed(person, event.id);
  }
  if (openColleges(run).length === 0) return;
  for (const person of livingList(run)) {
    if (person.magic.power < STRONG || person.magic.power >= LEGENDARY) continue;
    if (run.students.has(person.id) || run.studied.has(person.id)) continue;
    if (collegeOf(run, person.civId) || person.title === 'ruler') continue;
    if (!isAdult(run, person) || isElder(run, person)) continue;
    const home = siteOf(run, person);
    if (!home || !isLive(home) || person.civId === null || person.civId === undefined) continue;
    const college = collegeInReach(run, home, person.civId);
    if (!college || !run.rng.magic.chance(rules.travelChance)) continue;
    const site = run.world.sites.get(college.siteId)!;
    const event = run.emit({
      type: 'mage_went_to_study',
      actors: [person.id],
      place: site.cell,
      causes: [college.event],
      data: {
        name: person.name,
        college: college.name,
        from: home.name,
        civ: civOfPerson(run, person)?.name ?? '',
      },
    });
    addDeed(person, event.id);
    run.students.set(person.id, {
      siteId: site.id,
      home: home.id,
      until: run.year + rules.studyYears,
      power: person.magic.power,
      event: event.id,
    });
    person.siteId = site.id;
  }
}

/** Strong+ mages of a college's people may gain one power a year, up to the edge of legend. */
function train(run: HistoryRun): void {
  const rules = run.rules.colleges;
  const top = LEGENDARY - 1;
  for (const person of livingList(run)) {
    if (person.magic.power < STRONG || person.magic.power >= top) continue;
    if (!(collegeOf(run, person.civId) || run.students.has(person.id)) || !isAdult(run, person))
      continue;
    if (!run.rng.magic.chance(rules.trainChance)) continue;
    person.magic.power += 1;
    const school = primarySchool(person);
    if (school !== undefined) {
      person.magic.affinities[school] = Math.max(
        person.magic.affinities[school] ?? 0,
        person.magic.power - 1,
      );
    }
  }
}

/** A trouble in reach of the caster that one of their spells answers, nearest first. */
function troubleFor(
  run: HistoryRun,
  caster: Person,
  home: Site,
  spells: readonly SpellDef[],
): { spell: SpellDef; site: Site; cause: Id; disease?: string } | undefined {
  const rules = run.rules.colleges;
  const school = primarySchool(caster);
  const able = spells.filter((s) => school !== undefined && s.schools.includes(school));
  if (able.length === 0) return undefined;
  const sites = liveSites(run)
    .filter(
      (s) =>
        s.civId === caster.civId &&
        cellDistance(run.cells.width, home.cell, s.cell) <= rules.spellRange,
    )
    .sort(
      (p, q) =>
        cellDistance(run.cells.width, home.cell, p.cell) -
          cellDistance(run.cells.width, home.cell, q.cell) || p.id - q.id,
    );
  for (const site of sites) {
    for (const spell of able) {
      if (spell.target === 'dry' || spell.target === 'cold') {
        const epoch = epochAt(run, site.cell, spell.target);
        if (epoch) return { spell, site, cause: epoch.began };
      } else if (spell.target === 'famine') {
        const famine = logOf(run, site.id).famine;
        if (famine && famine.year === run.year) return { spell, site, cause: famine.event };
      } else {
        for (const [id, state] of run.diseases) {
          const event = state.infected.get(site.id);
          if (event === undefined) continue;
          const def = run.content.diseases.find((d) => d.id === id);
          return { spell, site, cause: event, disease: lower(def?.name ?? 'sickness') };
        }
      }
    }
  }
  return undefined;
}

/** The spell takes hold: the spell ends, the sickness stops spreading, or the stores fill. */
function applySpell(
  run: HistoryRun,
  spell: SpellDef,
  site: Site,
  disease: string | undefined,
): void {
  const rules = run.rules.colleges;
  if (spell.target === 'dry' || spell.target === 'cold') {
    const epoch = epochAt(run, site.cell, spell.target);
    // The spell ends at the start of next year, with its usual closing line.
    if (epoch) epoch.end = run.year;
  } else if (spell.target === 'disease') {
    for (const [id, state] of run.diseases) {
      const def = run.content.diseases.find((d) => d.id === id);
      if (lower(def?.name ?? 'sickness') !== disease || !state.infected.has(site.id)) continue;
      state.infected.delete(site.id);
      const safe = run.year + rules.wardYears;
      for (const near of [site.id, ...(run.links.get(site.id) ?? [])]) {
        state.immuneUntil.set(near, Math.max(state.immuneUntil.get(near) ?? 0, safe));
      }
    }
  } else {
    const need = totalPop(site) * (run.races.get(civRaceOf(run, site))?.foodNeed ?? 1);
    site.goods.food += Math.round(need * rules.bountyYears);
  }
}

function civRaceOf(run: HistoryRun, site: Site): string {
  const civ = site.civId === null ? undefined : run.world.civs.get(site.civId);
  return civ?.raceId ?? '';
}

/** College masters and legends answer the troubles of their people's sites in reach. */
function castSpells(run: HistoryRun): void {
  const rules = run.rules.colleges;
  const rng = run.rng.magic;
  for (const caster of livingList(run)) {
    const power = caster.magic.power;
    if (power < rules.spellPower) continue;
    if (power < LEGENDARY && !collegeOf(run, caster.civId) && !run.studied.has(caster.id)) continue;
    if (run.students.has(caster.id)) continue;
    if (!isAdult(run, caster) || isElder(run, caster)) continue;
    const last = run.notables.lastDeed.get(caster.id);
    if (last !== undefined && run.year - last < rules.spellRest) continue;
    const home = siteOf(run, caster);
    if (!home || !isLive(home)) continue;
    const trouble = troubleFor(run, caster, home, rules.spells);
    if (!trouble || !rng.chance(rules.spellChance)) continue;
    applySpell(run, trouble.spell, trouble.site, trouble.disease);
    caster.fame = Math.min(FAME_MAX, caster.fame + rules.spellFame);
    run.notables.lastDeed.set(caster.id, run.year);
    const college = collegeOf(run, caster.civId);
    const deed = trouble.spell.deed
      .replace('{site}', trouble.site.name)
      .replace('{disease}', trouble.disease ?? 'sickness');
    const event = run.emit({
      type: 'spell_cast',
      actors: [caster.id],
      place: trouble.site.cell,
      causes: [trouble.cause],
      data: {
        name: caster.name,
        deed,
        site: trouble.site.name,
        civ: civOfPerson(run, caster)?.name ?? '',
        school: primarySchool(caster) ?? 'wild',
        from: college && college.siteId === home.id ? `of ${college.name}` : `of ${home.name}`,
      },
    });
    addDeed(caster, event.id);
  }
}

/** Yearly, after the notables: colleges follow their sites, mages train, spells are worked; colleges open each decade. */
export function runColleges(run: HistoryRun): void {
  followSites(run);
  if (run.year % DECADE === 0) foundColleges(run);
  travelAbroad(run);
  train(run);
  castSpells(run);
}
