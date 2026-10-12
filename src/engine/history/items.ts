// Artifacts and books (M2.5), made each decade and passed on, lost, stolen and found. An item's
// holder is a notable, or null while it lies lost at `lostAt`. Every event about an item is kept in
// `Item.deeds`; holders keep the make, steal and find events among theirs.

import type { Id, Item, Person, Site } from '../core/types';
import {
  addDeed,
  civOfPerson,
  createAdult,
  isAdult,
  livingAt,
  livingList,
  livingPerson,
  mostFamous,
  placeOf,
  rebuildIndex,
  siteOf,
} from './people';
import { liveSites, type HistoryRun } from './state';

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Items held by a person, in id order. */
export function itemsHeldBy(run: HistoryRun, person: Person): Item[] {
  const out: Item[] = [];
  for (const item of run.world.items.values()) if (item.holder === person.id) out.push(item);
  return out;
}

function newItem(
  run: HistoryRun,
  spec: Pick<Item, 'kind' | 'name' | 'form' | 'makerId' | 'holder'>,
) {
  const { world } = run;
  const item: Item = { id: world.nextId.item, made: run.year, deeds: [], ...spec };
  world.nextId.item += 1;
  world.items.set(item.id, item);
  return item;
}

/** The school a notable is strongest in, if any. */
export function primarySchool(person: Person): string | undefined {
  let best: string | undefined;
  let value = -1;
  for (const [school, level] of Object.entries(person.magic.affinities)) {
    if (level > value) {
      best = school;
      value = level;
    }
  }
  return best;
}

function makeArtifacts(run: HistoryRun): void {
  const { world, rng } = run;
  const rules = run.content.notables;
  for (const site of liveSites(run)) {
    if (site.kind !== 'town' && site.kind !== 'city') continue;
    const civ = site.civId === null ? undefined : world.civs.get(site.civId);
    if (!civ || civ.fell !== undefined || site.goods.luxury < rules.artifactMinLuxury) continue;
    if (!rng.notables.chance(rules.artifactChance)) continue;
    const form = rng.notables.pick(rules.artifactForms);
    const epithet = rng.notables.pick(rules.artifactEpithets);
    const pattern = rng.notables.pick(rules.artifactNames);
    const maker =
      livingAt(run, site.id).find((p) => p.title === 'crafter') ??
      createAdult(run, civ, site, 'crafter', rules.fame.crafter);
    const ruler = civ.capital === site.id ? livingPerson(run, civ.rulerId) : undefined;
    const holder = ruler ?? maker;
    const name = pattern
      .replace('{epithet}', cap(epithet))
      .replace('{form}', cap(form))
      .replace('{maker}', maker.name);
    const item = newItem(run, {
      kind: 'artifact',
      name,
      form,
      makerId: maker.id,
      holder: holder.id,
    });
    const event = run.emit({
      type: 'artifact_made',
      actors: holder.id === maker.id ? [maker.id] : [maker.id, holder.id],
      place: site.cell,
      causes: [],
      data: {
        item: name,
        form,
        maker: maker.name,
        holder: holder.name,
        site: site.name,
        civ: civ.name,
      },
    });
    item.deeds.push(event.id);
    addDeed(maker, event.id);
    addDeed(holder, event.id);
  }
}

function writeBook(run: HistoryRun, writer: Person, form: string, site: Site, scholar: boolean) {
  const rules = run.content.notables;
  const pattern = run.rng.notables.pick(rules.bookNames);
  // Lower case, so "the sailing-lore of Torfa" reads well inside a sentence.
  const name = pattern
    .replace('{form}', form)
    .replace('{writer}', writer.name)
    .replace('{site}', site.name);
  const item = newItem(run, { kind: 'book', name, form, makerId: writer.id, holder: writer.id });
  const event = run.emit({
    type: 'book_written',
    actors: [writer.id],
    place: site.cell,
    causes: [],
    data: {
      item: name,
      form,
      writer: writer.name,
      site: site.name,
      role: scholar ? 'scholar' : 'mage',
    },
  });
  item.deeds.push(event.id);
  addDeed(writer, event.id);
}

function writeBooks(run: HistoryRun): void {
  const { world, rng } = run;
  const rules = run.content.notables;
  const mundane = rules.bookForms.mundane!;
  for (const person of livingList(run)) {
    if (person.magic.power < 3 || !isAdult(run, person) || person.siteId == null) continue;
    if (!rng.notables.chance(rules.bookChance)) continue;
    const site = siteOf(run, person);
    if (!site) continue;
    const school = primarySchool(person);
    const forms = (school === undefined ? undefined : rules.bookForms[school]) ?? mundane;
    writeBook(run, person, rng.notables.pick(forms), site, false);
  }
  for (const site of liveSites(run)) {
    if (site.kind !== 'temple') continue;
    const civ = site.civId === null ? undefined : world.civs.get(site.civId);
    if (!civ || civ.fell !== undefined) continue;
    if (livingAt(run, site.id).some((p) => p.title === 'scholar')) continue;
    if (!rng.notables.chance(rules.scholarChance)) continue;
    const scholar = createAdult(run, civ, site, 'scholar', rules.fame.scholar);
    writeBook(run, scholar, rng.notables.pick(mundane), site, true);
  }
}

/** Each lost item may be found by the most famous notable of the civ whose land it lies in. */
function findLost(run: HistoryRun): void {
  const { world, rng } = run;
  for (const item of world.items.values()) {
    if (item.holder !== null || item.lostAt === undefined) continue;
    if (!rng.notables.chance(run.content.notables.itemFindChance)) continue;
    const owner = run.cells.territory[item.lostAt]!;
    const finder = owner === 0 ? undefined : mostFamous(run, owner);
    if (!finder) continue;
    const at = item.lostAt;
    delete item.lostAt;
    item.holder = finder.id;
    const event = run.emit({
      type: 'item_found',
      actors: [finder.id],
      place: at,
      causes: item.deeds.slice(-1),
      data: {
        item: item.name,
        finder: finder.name,
        site: siteOf(run, finder)?.name ?? 'the wilds',
        civ: civOfPerson(run, finder)?.name ?? 'no people',
      },
    });
    item.deeds.push(event.id);
    addDeed(finder, event.id);
  }
}

/** Decade: new artifacts and books, and a chance to find what was lost. */
export function runItems(run: HistoryRun): void {
  rebuildIndex(run);
  makeArtifacts(run);
  writeBooks(run);
  findLost(run);
}

/** The living child (or notable of the same site) the culture's inheritance rule names, if any. */
function heirOf(run: HistoryRun, dead: Person): Person | undefined {
  const culture = run.content.cultures.find((c) => c.id === dead.cultureId);
  const children = dead.family.children
    .map((id) => livingPerson(run, id))
    .filter((p): p is Person => p !== undefined)
    .sort((a, b) => a.born - b.born || a.id - b.id);
  switch (culture?.inheritance) {
    case 'eldest-son':
    case 'sons-temple-tithe':
      return children.find((p) => p.sex === 'm') ?? children[0];
    case 'youngest-keeps-hearth':
      return children[children.length - 1];
    case 'best-apprentice': {
      const pool = [
        ...children,
        ...(dead.siteId == null ? [] : livingAt(run, dead.siteId).filter((p) => p.id !== dead.id)),
      ];
      let best: Person | undefined;
      for (const p of pool) {
        if (!best || p.attributes.intellect > best.attributes.intellect) best = p;
      }
      // Children come first, so ties go to them; a stranger needs strictly more.
      return best;
    }
    default:
      return children[0];
  }
}

/** The dead holder's items go to an heir, a spouse, the ruler or are lost where they died. */
export function passItems(run: HistoryRun, dead: Person, deathEvent: Id): void {
  const rules = run.content.notables;
  for (const item of itemsHeldBy(run, dead)) {
    const spouse = dead.family.spouses.map((id) => livingPerson(run, id)).find((p) => p);
    let heir = heirOf(run, dead) ?? spouse;
    if (!heir) {
      const civ = civOfPerson(run, dead);
      const ruler = civ ? livingPerson(run, civ.rulerId) : undefined;
      if (ruler && run.rng.notables.chance(rules.itemToRulerChance)) heir = ruler;
    }
    const causes = [deathEvent, ...item.deeds.slice(-1)];
    const where = siteOf(run, dead)?.name ?? 'the wilds';
    if (heir) {
      item.holder = heir.id;
      const event = run.emit({
        type: 'item_inherited',
        actors: [dead.id, heir.id],
        place: placeOf(run, dead),
        causes,
        data: { item: item.name, from: dead.name, heir: heir.name, site: where },
      });
      item.deeds.push(event.id);
      addDeed(heir, event.id);
    } else {
      item.holder = null;
      item.lostAt = placeOf(run, dead) ?? 0;
      const event = run.emit({
        type: 'item_lost',
        actors: [dead.id],
        place: item.lostAt,
        causes,
        data: { item: item.name, from: dead.name, site: where },
      });
      item.deeds.push(event.id);
    }
  }
}

/** Moves an item to a thief; the cause is the conquest, razing or raid. */
export function stealItem(run: HistoryRun, item: Item, thief: Person, cause: Id): void {
  const from = livingPerson(run, item.holder);
  if (!from || from.id === thief.id) return;
  item.holder = thief.id;
  const event = run.emit({
    type: 'item_stolen',
    actors: [thief.id, from.id],
    place: placeOf(run, from),
    causes: [cause, ...item.deeds.slice(-1)],
    data: {
      item: item.name,
      from: from.name,
      thief: thief.name,
      site: siteOf(run, from)?.name ?? 'the wilds',
      civ: civOfPerson(run, thief)?.name ?? 'no people',
    },
  });
  item.deeds.push(event.id);
  addDeed(thief, event.id);
}

/** A raider may carry off one artifact held at the target site. */
export function raidSteal(run: HistoryRun, raider: Person, target: Site, cause: Id): void {
  const rng = run.rng.notables;
  if (!rng.chance(run.content.notables.raidStealChance)) return;
  const held: Item[] = [];
  for (const item of run.world.items.values()) {
    if (item.kind !== 'artifact') continue;
    const holder = livingPerson(run, item.holder);
    if (holder && holder.siteId === target.id) held.push(item);
  }
  if (held.length > 0) stealItem(run, rng.pick(held), raider, cause);
}
