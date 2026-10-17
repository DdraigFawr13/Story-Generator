// Great works and enchanting. A living legend, or the ruler of a rich realm, raises one great work
// (a tower, wall, bridge or warded grove) at a live site, paid for in the site's goods; a legend
// with nothing to build leaves a great item instead. Each decade a Strong mage may bind a spell of
// their school into an item made from a slain beast's remains or from rare ore. A work falls with
// its site (a wall also when its town is taken). Every roll comes from the `greatWorks` stream and
// every number from `content/great-works.ts`; each step is an event with its causes linked.

import type { GreatWorkKindDef } from '../core/content-types';
import type { Civ, Creature, GoodId, GreatWork, Id, Item, Person, Site } from '../core/types';
import { deedSoldiers, isLegend, rulerOf } from './notables';
import { isSpell, newItem, primarySchool, spellPower, uniqueName, fill } from './items';
import { addDeed, eventById, isAdult, isElder, livingList, rebuildIndex } from './people';
import { cellDistance } from './settle';
import { causesOf, isLive, liveSites, logOf, standingWork, type HistoryRun } from './state';
import { DAYS_PER_YEAR } from '../core/clock';

interface WorksMemory {
  /** People who have raised a work or made a great item: once in a life. */
  builders: Set<Id>;
  /** The year each realm last raised a work. */
  lastRealm: Map<Id, number>;
}
const memory = new WeakMap<HistoryRun, WorksMemory>();
function memoryOf(run: HistoryRun): WorksMemory {
  let mem = memory.get(run);
  if (!mem) memory.set(run, (mem = { builders: new Set(), lastRealm: new Map() }));
  return mem;
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const capWords = (text: string) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const fillIn = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

const liveCiv = (run: HistoryRun, id: Id | null | undefined): Civ | undefined => {
  const civ = id == null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
};

const kindOf = (run: HistoryRun, id: string): GreatWorkKindDef | undefined =>
  run.content.greatWorks.kinds.find((k) => k.id === id);

// --- the mage's strongest spell ---------------------------------------------------------------

/** The enchanter's school and strongest spell there, if they are a Strong mage who knows one. */
function strongestSpell(
  run: HistoryRun,
  person: Person,
): { school: string; spell: string; name: string } | undefined {
  const rules = run.content.greatWorks.enchant;
  if (person.magic.power < rules.minPower) return undefined;
  const school = primarySchool(person);
  if (school === undefined) return undefined;
  let best: { power: number; id: string; name: string } | undefined;
  for (const id of person.knownAbilities) {
    const ability = run.lore.byId.get(id);
    if (!ability || ability.school !== school || !isSpell(run, id)) continue;
    const power = spellPower(ability);
    if (power >= rules.spellPower && (!best || power > best.power))
      best = { power, id, name: ability.name };
  }
  return best ? { school, spell: best.id, name: best.name } : undefined;
}

// --- hooks other systems read -----------------------------------------------------------------

/** The strong spells a standing tower at this site keeps alive for its realm (lineages.ts). */
export function towerSpells(run: HistoryRun, site: Site): string[] {
  const tower = standingWork(site, 'tower');
  if (!tower || !isLive(site) || !liveCiv(run, site.civId)) return [];
  const builder = tower.builderId === null ? undefined : run.world.people.get(tower.builderId);
  if (!builder) return [];
  const keep = run.content.greatWorks.towerKeepPower;
  return builder.knownAbilities.filter((id) => {
    const ability = run.lore.byId.get(id);
    return ability !== undefined && isSpell(run, id) && spellPower(ability) >= keep;
  });
}

/** Soldiers an enchanted item adds to its living holder's fights against beasts. */
export function enchantedEdge(run: HistoryRun, person: Person): number {
  for (const item of run.world.items.values())
    if (item.holder === person.id && item.enchanted)
      return run.content.greatWorks.enchant.fightEdge;
  return 0;
}

/** A wall falls when its town is taken: the conquest is the cause. */
export function breachWall(run: HistoryRun, site: Site, cause: Id, taker: Civ): void {
  const wall = standingWork(site, 'wall');
  if (!wall) return;
  fall(
    run,
    site,
    wall,
    fillIn(run.content.greatWorks.fallPhrases.breached, { site: site.name, civ: taker.name }),
    [cause],
  );
}

// --- falling works -----------------------------------------------------------------------------

function fall(run: HistoryRun, site: Site, work: GreatWork, how: string, causes: Id[]) {
  const rules = run.content.greatWorks;
  work.fell = site.ruinedYear ?? run.year;
  const builder = work.builderId === null ? undefined : run.world.people.get(work.builderId);
  const kind = kindOf(run, work.kind);
  run.emit({
    type: 'great_work_fell',
    place: site.cell,
    actors: [],
    causes: causesOf(...causes, work.eventId),
    data: {
      work: work.name,
      word: kind?.word ?? rules.kinds[0]!.word,
      builder: builder?.name ?? 'its builders',
      site: site.name,
      civ: run.world.civs.get(site.civId ?? -1)?.name ?? '',
      how,
      raised: work.raised,
    },
  });
}

/** The latest event of a ruin kind at the site, this year or last. */
function ruinEvent(run: HistoryRun, site: Site): Id | undefined {
  const since = (run.year - 2) * DAYS_PER_YEAR;
  const kinds = run.content.greatWorks.fallCauses;
  const events = run.world.events;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.day < since) break;
    if (event.place === site.cell && kinds.includes(event.type)) return event.id;
  }
  return undefined;
}

function fallenWorks(run: HistoryRun): void {
  for (const site of run.world.sites.values()) {
    if (!site.works || isLive(site)) continue;
    for (const work of site.works) {
      if (work.fell !== undefined) continue;
      fall(
        run,
        site,
        work,
        fillIn(run.content.greatWorks.fallPhrases.ruined, { site: site.name }),
        causesOf(ruinEvent(run, site)),
      );
    }
  }
}

// --- raising a work ----------------------------------------------------------------------------

const canPay = (site: Site, cost: Partial<Record<GoodId, number>>): boolean =>
  (Object.entries(cost) as [GoodId, number][]).every(([good, n]) => site.goods[good] >= n);
function pay(site: Site, cost: Partial<Record<GoodId, number>>): void {
  for (const [good, n] of Object.entries(cost) as [GoodId, number][]) site.goods[good] -= n;
}

/** Whether the builder may raise this kind at this site now. */
function fits(run: HistoryRun, kind: GreatWorkKindDef, site: Site, builder: Person): boolean {
  const rules = run.content.greatWorks;
  if (!isLive(site) || !canPay(site, kind.cost)) return false;
  if (kind.siteKinds.length > 0 && !kind.siteKinds.includes(site.kind)) return false;
  if (kind.features.length > 0 && !kind.features.some((f) => site.features.includes(f)))
    return false;
  if (kind.thing) return true;
  const standing = (site.works ?? []).filter((w) => w.fell === undefined);
  if (standing.length >= rules.maxPerSite || standing.some((w) => w.kind === kind.id)) return false;
  const need = kind.builder;
  if (need.minPower > 0 && strongestSpell(run, builder) === undefined) return false;
  if (builder.magic.power < need.minPower) return false;
  if (need.schools.length > 0 || need.raceIds.length > 0) {
    const school = primarySchool(builder);
    const schoolOk = school !== undefined && need.schools.includes(school);
    if (!schoolOk && !need.raceIds.includes(builder.raceId)) return false;
  }
  return true;
}

/** The builder's rise or accession, the standing that let them raise a work. */
function standingEvent(run: HistoryRun, builder: Person): Id | undefined {
  for (let i = builder.deeds.length - 1; i >= 0; i -= 1) {
    const event = eventById(run, builder.deeds[i]!);
    if (event && (event.type === 'legend_risen' || event.type === 'ruler_succeeded')) {
      if (event.actors[0] === builder.id) return event.id;
    }
  }
  return undefined;
}

function nameWork(run: HistoryRun, kind: GreatWorkKindDef, builder: Person, site: Site): string {
  const rules = run.content.greatWorks;
  const rng = run.rng.greatWorks;
  const pattern = rng.pick(kind.names);
  const epithet = rng.pick(rules.epithets);
  const taken = new Set<string>();
  for (const other of run.world.sites.values())
    for (const w of other.works ?? []) taken.add(w.name);
  const candidates = fill(kind.names, pattern, {
    builder: builder.name,
    site: site.name,
    epithet,
  });
  const free = candidates.find((name) => !taken.has(name));
  if (free) return free;
  const first = candidates[0]!;
  for (const numeral of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])
    if (!taken.has(`${first} ${numeral}`)) return `${first} ${numeral}`;
  return `${first} ${site.works?.length ?? 0}${run.year}`;
}

function raise(
  run: HistoryRun,
  kind: GreatWorkKindDef,
  builder: Person,
  site: Site,
  civ: Civ,
): void {
  const rules = run.content.greatWorks;
  const rng = run.rng.greatWorks;
  const years = rng.between(rules.years[0], rules.years[1]);
  const name = nameWork(run, kind, builder, site);
  pay(site, kind.cost);
  const log = logOf(run, site.id);
  const raided = log.raided && run.year - log.raided.year <= 60 ? log.raided.event : undefined;
  const event = run.emit({
    type: 'great_work_raised',
    place: site.cell,
    actors: [builder.id],
    causes: causesOf(kind.id === 'wall' ? raided : undefined, standingEvent(run, builder)),
    data: {
      work: name,
      word: kind.word,
      builder: builder.name,
      site: site.name,
      civ: civ.name,
      years,
    },
  });
  (site.works ??= []).push({
    kind: kind.id,
    name,
    builderId: builder.id,
    raised: run.year,
    eventId: event.id,
  });
  addDeed(builder, event.id);
  memoryOf(run).builders.add(builder.id);
}

// --- enchanting --------------------------------------------------------------------------------

type Material = { from: 'beast'; remains: number } | { from: 'ore' };

/** Unused remains of a civ within range and age (nearest first), else ore if the site has a deposit. */
function pickMaterial(run: HistoryRun, site: Site, allowPlainOre: boolean): Material | undefined {
  const rules = run.content.greatWorks.enchant;
  let best = -1;
  let bestDistance = Infinity;
  run.remains.forEach((r, index) => {
    if (r.used || run.year - r.year > rules.remainsYears) return;
    const home = run.world.sites.get(r.siteId);
    if (!home || home.civId !== site.civId) return;
    const distance = cellDistance(run.cells.width, site.cell, home.cell);
    if (distance <= rules.remainsRange && distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  if (best >= 0) return { from: 'beast', remains: best };
  if (site.features.includes('deposit') || allowPlainOre) return { from: 'ore' };
  return undefined;
}

/** The living ruler, hero or captain of the civ who would be given an item (not the maker). */
function recipientFor(run: HistoryRun, civ: Civ, maker: Person): Person | undefined {
  let best: Person | undefined;
  let bestScore = -1;
  const ruler = rulerOf(run, civ);
  for (const person of livingList(run)) {
    if (person.civId !== civ.id || person.id === maker.id) continue;
    const able = person.id === ruler?.id || person.title === 'hero' || person.title === 'captain';
    if (!able || !isAdult(run, person) || isElder(run, person)) continue;
    const score = deedSoldiers(run, person) * 1000 + person.fame;
    if (score > bestScore) {
      best = person;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Makes one item. A Strong mage binds `enchant` into it; a legend's great item has none when the
 * legend is no mage. Returns false (changing nothing) when there is no material.
 */
function makeItem(
  run: HistoryRun,
  maker: Person,
  site: Site,
  civ: Civ,
  opts: { great: boolean; spell?: { school: string; spell: string; name: string } | undefined },
): boolean {
  const rules = run.content.greatWorks.enchant;
  const rng = run.rng.greatWorks;
  const material = pickMaterial(run, site, opts.great);
  if (!material) return false;
  const schools = Object.keys(rules.schools);
  const school = opts.spell?.school ?? primarySchool(maker) ?? schools[0]!;
  const def = rules.schools[school] ?? rules.schools[schools[0]!]!;
  const epithet = rng.pick(rules.epithets);
  const remains = material.from === 'beast' ? run.remains[material.remains] : undefined;
  const patterns = opts.great
    ? rules.greatNames
    : material.from === 'beast'
      ? def.beastNames
      : def.oreNames;
  const picked = rng.pick(patterns);
  const gift = rng.chance(rules.giftChance);
  const values = {
    builder: maker.name,
    maker: maker.name,
    Epithet: epithet,
    Form: cap(def.form),
    Beast: capWords(remains?.kindName ?? ''),
    beast: remains?.creatureName ?? '',
  };
  const recipient = !opts.great && gift ? recipientFor(run, civ, maker) : undefined;
  const holder = recipient ?? maker;
  const name = uniqueName(run, fill(patterns, picked, values));
  const beast: Creature | undefined = remains
    ? run.world.creatures.get(remains.creatureId)
    : undefined;
  if (opts.great) pay(site, kindOf(run, 'item')!.cost);
  const item: Item = newItem(run, {
    kind: 'artifact',
    name,
    form: def.form,
    makerId: maker.id,
    holder: holder.id,
  });
  if (opts.spell) {
    item.enchanted = {
      school: opts.spell.school,
      spell: opts.spell.spell,
      from: material.from,
      ...(remains ? { beast: remains.creatureName } : {}),
    };
    item.school = opts.spell.school;
  }
  if (opts.great) item.great = true;
  const matterOf = remains
    ? fillIn(rules.materials.beast, { beast: remains.creatureName })
    : fillIn(rules.materials.ore, { site: site.name });
  if (remains) remains.used = true;
  const event = run.emit({
    type: opts.great ? 'great_item_made' : 'item_enchanted',
    place: site.cell,
    actors: holder.id === maker.id ? [maker.id] : [maker.id, holder.id],
    causes: causesOf(
      remains?.eventId,
      remains ? undefined : opts.great ? standingEvent(run, maker) : maker.lore?.event,
    ),
    data: {
      item: name,
      form: def.form,
      maker: maker.name,
      spell: opts.spell?.name ?? '',
      school,
      material: matterOf,
      fate: recipient ? fillIn(rules.fates.gift, { holder: recipient.name }) : rules.fates.kept,
      site: site.name,
      civ: civ.name,
      ...(remains ? { beast: remains.creatureName } : {}),
    },
  });
  item.deeds.push(event.id);
  beast?.deeds.push(event.id);
  addDeed(maker, event.id);
  addDeed(holder, event.id);
  if (opts.great) memoryOf(run).builders.add(maker.id);
  return true;
}

/** Decade: each Strong mage with a spell of their school may enchant an item. */
function enchanting(run: HistoryRun): void {
  const rules = run.content.greatWorks.enchant;
  const rng = run.rng.greatWorks;
  for (const person of livingList(run)) {
    if (!isAdult(run, person) || person.siteId == null) continue;
    const spell = strongestSpell(run, person);
    if (!spell) continue;
    if (!rng.chance(rules.chance)) continue;
    const site = run.world.sites.get(person.siteId);
    const civ = liveCiv(run, person.civId);
    if (!site || !isLive(site) || !civ) continue;
    makeItem(run, person, site, civ, { great: false, spell });
  }
}

// --- who raises a work -------------------------------------------------------------------------

/** The first kind in the order that fits, as a work or the great item. */
function raiseFirst(
  run: HistoryRun,
  order: readonly string[],
  builder: Person,
  site: Site,
  civ: Civ,
): boolean {
  for (const id of order) {
    const kind = kindOf(run, id);
    if (!kind || !fits(run, kind, site, builder)) continue;
    if (kind.thing) {
      if (makeItem(run, builder, site, civ, { great: true, spell: strongestSpell(run, builder) }))
        return true;
      continue;
    }
    raise(run, kind, builder, site, civ);
    return true;
  }
  return false;
}

function legendWorks(run: HistoryRun): void {
  const rules = run.content.greatWorks;
  const rng = run.rng.greatWorks;
  const { builders } = memoryOf(run);
  for (const person of livingList(run)) {
    if (!isLegend(person) || !isAdult(run, person) || isElder(run, person)) continue;
    if (builders.has(person.id) || person.siteId == null) continue;
    const site = run.world.sites.get(person.siteId);
    const civ = liveCiv(run, person.civId);
    if (!site || !isLive(site) || !civ || site.civId !== civ.id) continue;
    if (!rng.chance(rules.legendChance)) continue;
    const order = strongestSpell(run, person) ? rules.legendOrder.mage : rules.legendOrder.warrior;
    raiseFirst(run, order, person, site, civ);
  }
}

function realmWorks(run: HistoryRun): void {
  const rules = run.content.greatWorks;
  const rng = run.rng.greatWorks;
  const { builders, lastRealm } = memoryOf(run);
  for (const civ of [...run.world.civs.values()].sort((a, b) => a.id - b.id)) {
    if (civ.fell !== undefined) continue;
    const ruler = rulerOf(run, civ);
    const capital = run.world.sites.get(civ.capital);
    if (!ruler || !capital || !isLive(capital) || ruler.siteId !== capital.id) continue;
    if (capital.wealth < rules.realmWealthMin || builders.has(ruler.id)) continue;
    const last = lastRealm.get(civ.id);
    if (last !== undefined && run.year - last < rules.realmGapYears) continue;
    if (!rng.chance(rules.realmChance)) continue;
    if (raiseFirst(run, rules.realmOrder, ruler, capital, civ)) lastRealm.set(civ.id, run.year);
  }
}

/** Yearly: works fall with their sites, bridges pay, then legends and rich realms raise works; each decade, enchanting. */
export function runGreatWorks(run: HistoryRun): void {
  rebuildIndex(run);
  fallenWorks(run);
  const bridge = run.content.greatWorks.bridgeWealth;
  for (const site of liveSites(run)) if (standingWork(site, 'bridge')) site.wealth += bridge;
  legendWorks(run);
  realmWorks(run);
  if (run.year % 10 === 0) enchanting(run);
}
