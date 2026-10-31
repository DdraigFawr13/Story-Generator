// Crafts (W1): each people may discover crafts (content entries) through a named first maker. A
// craft passes from master to pupil, is lost when no living member of the people knows it, and
// is found again by reinvention or from a treatise a member holds. Every draw comes from the
// `crafts` stream (the notables stream is still used by `createAdult` for the person it makes).

import type { CraftDef } from '../core/content-types';
import type { Civ, CivCraft, CraftLore, GoodId, Id, Item, Person, Site } from '../core/types';
import { deathEventOf } from './lineages';
import { fill, newItem, uniqueName } from './items';
import {
  addDeed,
  createAdult,
  isAdult,
  livingAt,
  livingList,
  livingPerson,
  placeOf,
  siteOf,
} from './people';
import { liveSites, type HistoryRun } from './state';

/** "1 year", "7 years". */
const yearsText = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

const key = (civ: Id, craft: string) => `${civ}:${craft}`;

const fillIn = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    template,
  );

/** Craft names that start with "the" lose it inside a book title ("the purple dye" -> "purple dye"). */
const bare = (craft: CraftDef) => craft.name.replace(/^the /, '');

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id == null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};

const loreOf = (person: Person, id: string): CraftLore | undefined =>
  person.crafts?.find((c) => c.id === id);

/** The civ's entry for the craft, held or lost. */
const entryOf = (civ: Civ, id: string): CivCraft | undefined =>
  civ.crafts?.find((c) => c.id === id);

const holds = (civ: Civ, id: string): boolean => {
  const entry = entryOf(civ, id);
  return entry !== undefined && entry.lost === undefined;
};

function learns(person: Person, lore: CraftLore): void {
  (person.crafts ??= []).push(lore);
}

/** Where a person works: their site, else their people's capital. */
function homeOf(run: HistoryRun, person: Person, civ: Civ): Site {
  return siteOf(run, person) ?? run.world.sites.get(civ.capital)!;
}

// --- survey ----------------------------------------------------------------------------------

interface Knowers {
  /** "civ:craft" keys to the living knowers of live peoples, lowest id first. */
  of: Map<string, Id[]>;
}

/** Who knows which craft, by people. */
function survey(run: HistoryRun): Knowers {
  const of = new Map<string, Id[]>();
  for (const person of livingList(run)) {
    if (!person.crafts || !liveCiv(run, person.civId)) continue;
    for (const lore of person.crafts) {
      const k = key(person.civId!, lore.id);
      const list = of.get(k);
      if (list) list.push(person.id);
      else of.set(k, [person.id]);
    }
  }
  return { of };
}

function addKnower(found: Knowers, civ: Id, craft: string, who: Id): void {
  const k = key(civ, craft);
  const list = found.of.get(k);
  if (list) list.push(who);
  else found.of.set(k, [who]);
}

// --- the year's steps ------------------------------------------------------------------------

/** 1. A knower of a craft their people does not hold brings it home. */
function bringCrafts(run: HistoryRun, found: Knowers): void {
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    for (const craft of run.rules.crafts.crafts) {
      const knowers = found.of.get(key(civ.id, craft.id));
      if (!knowers || knowers.length === 0 || holds(civ, craft.id)) continue;
      const knower = livingPerson(run, knowers[0])!;
      const site = homeOf(run, knower, civ);
      const event = run.emit({
        type: 'craft_brought',
        actors: [knower.id],
        place: site.cell,
        causes: knower.deeds.slice(-1),
        data: { name: knower.name, craft: craft.name, site: site.name, civ: civ.name },
      });
      addDeed(knower, event.id);
      const entry = entryOf(civ, craft.id);
      if (entry) {
        delete entry.lost;
        delete entry.lostEvent;
      } else {
        (civ.crafts ??= []).push({
          id: craft.id,
          first: knower.id,
          year: run.year,
          event: event.id,
        });
      }
    }
  }
}

/** 2. A craft no living member of its people knows is lost. */
function loseCrafts(run: HistoryRun, found: Knowers): void {
  const rules = run.rules.crafts;
  const state = run.crafts;
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    for (const craft of rules.crafts) {
      const entry = entryOf(civ, craft.id);
      if (!entry || entry.lost !== undefined) continue;
      const knowers = found.of.get(key(civ.id, craft.id));
      if (knowers && knowers.length > 0) continue;
      const lastId = state.lastKnower.get(key(civ.id, craft.id));
      const last = lastId === undefined ? undefined : run.world.people.get(lastId);
      let how = rules.phrases.forgotten;
      const causes: Id[] = [];
      if (last && last.died !== undefined) {
        how = fillIn(rules.phrases.diedUntaught, { name: last.name });
        const death = deathEventOf(run, last);
        if (death !== undefined) causes.push(death);
      } else if (last && last.civId !== civ.id) {
        how = fillIn(rules.phrases.wentAway, { name: last.name });
      }
      const event = run.emit({
        type: 'craft_lost',
        actors: last ? [last.id] : [],
        place: last ? placeOf(run, last) : (run.world.sites.get(civ.capital)?.cell ?? null),
        causes,
        data: { craft: craft.name, name: last?.name ?? '', how, civ: civ.name },
      });
      entry.lost = run.year;
      entry.lostEvent = event.id;
    }
  }
}

/** The first unburned treatise on the craft that a living member of the civ holds. */
function treatiseHeld(run: HistoryRun, civ: Civ, craft: string): Item | undefined {
  for (const item of run.world.items.values()) {
    if (item.crafts === undefined || item.burned !== undefined || !item.crafts.includes(craft))
      continue;
    const holder = livingPerson(run, item.holder);
    if (holder && holder.civId === civ.id) return item;
  }
  return undefined;
}

/** 3. A lost craft is read back from a treatise a member holds. */
function readCrafts(run: HistoryRun, found: Knowers): void {
  const rules = run.rules.crafts;
  const rng = run.rng.crafts;
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    for (const craft of rules.crafts) {
      const entry = entryOf(civ, craft.id);
      // Not in the year of the loss: someone has to miss the craft and go looking.
      if (!entry || entry.lost === undefined || entry.lost === run.year) continue;
      const book = treatiseHeld(run, civ, craft.id);
      if (!book || !rng.chance(rules.readChance)) continue;
      const holder = livingPerson(run, book.holder)!;
      const site = homeOf(run, holder, civ);
      const learner =
        holder.title === 'crafter'
          ? holder
          : createAdult(run, civ, site, 'crafter', run.content.notables.fame.crafter);
      learns(learner, { id: craft.id, since: run.year, how: 'book', book: book.id, pupils: [] });
      addKnower(found, civ.id, craft.id, learner.id);
      const event = run.emit({
        type: 'craft_regained',
        actors: [learner.id],
        place: site.cell,
        causes: book.deeds.slice(-1),
        data: {
          craft: craft.name,
          item: book.name,
          name: learner.name,
          site: site.name,
          civ: civ.name,
          years: yearsText(run.year - entry.lost),
        },
      });
      book.deeds.push(event.id);
      addDeed(learner, event.id);
      delete entry.lost;
      delete entry.lostEvent;
    }
  }
}

/** The civ's live site of an allowed kind with the most of the craft's good, if it has enough. */
function qualifyingSite(civ: Civ, craft: CraftDef, sites: Site[]): Site | undefined {
  let best: Site | undefined;
  for (const site of sites) {
    if (site.civId !== civ.id || !craft.siteKinds.includes(site.kind)) continue;
    if (!best || site.goods[craft.good] > best.goods[craft.good]) best = site;
  }
  return best && best.goods[craft.good] >= craft.minGood ? best : undefined;
}

/** 4. A people with the stock for it discovers a craft it lacks, or hits on a lost one again. */
function discoverCrafts(run: HistoryRun, found: Knowers): void {
  const rules = run.rules.crafts;
  const rng = run.rng.crafts;
  const sites = liveSites(run);
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined) continue;
    for (const craft of rules.crafts) {
      if (holds(civ, craft.id)) continue;
      if (craft.requires !== undefined && !holds(civ, craft.requires)) continue;
      const site = qualifyingSite(civ, craft, sites);
      if (!site) continue;
      const entry = entryOf(civ, craft.id);
      const lost = entry?.lost !== undefined;
      if (lost && run.year - entry!.lost! < rules.reinventAfterYears) continue;
      if (!rng.chance(rules.discoverChance * (lost ? rules.reinventFactor : 1))) continue;
      const maker =
        livingAt(run, site.id).find(
          (p) =>
            p.title === 'crafter' &&
            p.civId === civ.id &&
            isAdult(run, p) &&
            // One discovery to a life: a crafter who already found a craft leaves the next to another.
            !(p.crafts ?? []).some((c) => c.how === 'found' || c.how === 'again'),
        ) ?? createAdult(run, civ, site, 'crafter', run.content.notables.fame.crafter);
      learns(maker, { id: craft.id, since: run.year, how: lost ? 'again' : 'found', pupils: [] });
      addKnower(found, civ.id, craft.id, maker.id);
      const data = {
        name: maker.name,
        craft: craft.name,
        first: craft.first,
        site: site.name,
        civ: civ.name,
      };
      if (entry && lost) {
        const event = run.emit({
          type: 'craft_reinvented',
          actors: [maker.id],
          place: site.cell,
          causes: entry.lostEvent === undefined ? [] : [entry.lostEvent],
          data: { ...data, years: yearsText(run.year - entry.lost!) },
        });
        addDeed(maker, event.id);
        delete entry.lost;
        delete entry.lostEvent;
      } else {
        const event = run.emit({
          type: 'craft_discovered',
          actors: [maker.id],
          place: site.cell,
          causes: [],
          data,
        });
        addDeed(maker, event.id);
        (civ.crafts ??= []).push({
          id: craft.id,
          first: maker.id,
          year: run.year,
          event: event.id,
        });
      }
    }
  }
}

/** True while a pupil of the master's in this craft lives and is still in training. */
function hasPupilInTraining(run: HistoryRun, lore: CraftLore, craft: string): boolean {
  const years = run.rules.crafts.trainingYears;
  return lore.pupils.some((id) => {
    const pupil = livingPerson(run, id);
    const pupilLore = pupil && loreOf(pupil, craft);
    return pupilLore !== undefined && pupilLore.since + years > run.year;
  });
}

/** A living grown child of the master in their people who does not know the craft. */
function childPupil(run: HistoryRun, master: Person, civ: Civ, craft: string): Person | undefined {
  for (const id of master.family.children) {
    const child = livingPerson(run, id);
    if (
      child &&
      child.civId === civ.id &&
      isAdult(run, child) &&
      loreOf(child, craft) === undefined
    )
      return child;
  }
  return undefined;
}

/** 5. A master with no pupil in training takes one while the people has room for another master. */
function teachCrafts(run: HistoryRun, found: Knowers): void {
  const rules = run.rules.crafts;
  const rng = run.rng.crafts;
  const byId = new Map(rules.crafts.map((c) => [c.id, c]));
  for (const master of livingList(run)) {
    const civ = liveCiv(run, master.civId);
    if (!civ || !master.crafts || !isAdult(run, master)) continue;
    // Pupils are added to the list below, so walk a copy of the master's own crafts.
    for (const lore of [...master.crafts]) {
      const craft = byId.get(lore.id);
      if (!craft || hasPupilInTraining(run, lore, craft.id)) continue;
      if ((found.of.get(key(civ.id, craft.id))?.length ?? 0) >= rules.maxMasters) continue;
      if (!rng.chance(rules.teachChance)) continue;
      const site = homeOf(run, master, civ);
      const pupil =
        childPupil(run, master, civ, craft.id) ??
        createAdult(run, civ, site, 'crafter', run.content.notables.fame.crafter);
      learns(pupil, {
        id: craft.id,
        since: run.year,
        how: 'taught',
        teacher: master.id,
        pupils: [],
      });
      lore.pupils.push(pupil.id);
      addKnower(found, civ.id, craft.id, pupil.id);
      const event = run.emit({
        type: 'craft_taught',
        actors: [master.id, pupil.id],
        place: site.cell,
        causes: master.deeds.slice(-1),
        data: { master: master.name, name: pupil.name, craft: craft.name, site: site.name },
      });
      addDeed(master, event.id);
      addDeed(pupil, event.id);
    }
  }
}

/** 6. A master who has not yet written a treatise on a craft may set it down. */
function writeTreatises(run: HistoryRun): void {
  const rules = run.rules.crafts;
  const rng = run.rng.crafts;
  const byId = new Map(rules.crafts.map((c) => [c.id, c]));
  for (const writer of livingList(run)) {
    const civ = liveCiv(run, writer.civId);
    if (!civ || !writer.crafts || !isAdult(run, writer)) continue;
    for (const lore of writer.crafts) {
      const craft = byId.get(lore.id);
      if (!craft || lore.wrote || !rng.chance(rules.bookChance)) continue;
      const site = homeOf(run, writer, civ);
      const pattern = rng.pick(rules.bookNames);
      const name = uniqueName(
        run,
        fill(rules.bookNames, pattern, {
          craft: bare(craft),
          writer: writer.name,
          site: site.name,
        }),
      );
      const item = newItem(run, {
        kind: 'book',
        name,
        form: craft.bookForm,
        makerId: writer.id,
        holder: writer.id,
      });
      item.crafts = [craft.id];
      lore.wrote = true;
      const event = run.emit({
        type: 'craft_written',
        actors: [writer.id],
        place: site.cell,
        causes: writer.deeds.slice(-1),
        data: { item: name, writer: writer.name, craft: craft.name, site: site.name },
      });
      item.deeds.push(event.id);
      addDeed(writer, event.id);
    }
  }
}

/** Remembers the highest-id living knower of each craft per people, and the effects each holds. */
function refresh(run: HistoryRun, found: Knowers): void {
  const state = run.crafts;
  for (const [k, list] of found.of) {
    if (list.length > 0) state.lastKnower.set(k, Math.max(...list));
  }
  state.held.clear();
  state.yields.clear();
  state.artifacts.clear();
  const byId = new Map(run.rules.crafts.crafts.map((c) => [c.id, c]));
  for (const civ of run.world.civs.values()) {
    if (civ.fell !== undefined || !civ.crafts) continue;
    const held = new Set<string>();
    const yields: Partial<Record<GoodId, number>> = {};
    let artifacts = 1;
    for (const entry of civ.crafts) {
      const craft = byId.get(entry.id);
      if (!craft || entry.lost !== undefined) continue;
      held.add(entry.id);
      if (craft.effect.kind === 'yield')
        yields[craft.effect.good] = (yields[craft.effect.good] ?? 1) * craft.effect.factor;
      else artifacts *= craft.effect.factor;
    }
    state.held.set(civ.id, held);
    state.yields.set(civ.id, yields);
    state.artifacts.set(civ.id, artifacts);
  }
}

/** Yearly, right after the lineages: survey, losses, treatises read, discoveries, teaching, writing. */
export function runCrafts(run: HistoryRun): void {
  const found = survey(run);
  // The last knowers of the previous survey are still in `lastKnower` when a craft is lost now.
  bringCrafts(run, found);
  loseCrafts(run, found);
  readCrafts(run, found);
  discoverCrafts(run, found);
  teachCrafts(run, found);
  writeTreatises(run);
  refresh(run, found);
}

/** The factor the people's crafts give to what its sites make of a good (1 with none). */
export function craftFactor(run: HistoryRun, civId: Id | null, good: GoodId): number {
  return civId === null ? 1 : (run.crafts.yields.get(civId)?.[good] ?? 1);
}

/** The factor the people's crafts give to the chance a town makes an artifact (1 with none). */
export function craftArtifactFactor(run: HistoryRun, civId: Id | null): number {
  return civId === null ? 1 : (run.crafts.artifacts.get(civId) ?? 1);
}
