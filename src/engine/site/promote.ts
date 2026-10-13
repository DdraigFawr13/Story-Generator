// Promotion (M3.1, REBOOT_PLAN §7.4): turns a site's counts into people. Notables keep their
// records; everyone else becomes a new `Person` matching the site's race, culture and age bands,
// grouped into households by the culture's marriage custom, and housed in a freshly laid-out map.

import { sortedById } from '../core/math';
import { totalPop } from '../history/pop';
import { streamFor, type RngStream } from '../core/rng';
import {
  GOODS,
  type ActiveSite,
  type Building,
  type Household,
  type Id,
  type Person,
  type WorldState,
} from '../core/types';
import type { CultureDef, RaceDef } from '../core/content-types';
import { rollAptitude } from '../people/aptitude';
import { cultureGivenName } from '../people/names';
import { ageBands, bandOfAge, type SiteContent } from './defs';
import { blankEnvironment, initEnvironment } from './environment';
import { layoutSite } from './layout';
import { buildLocalMap } from './localmap';
import { blankSociety } from './society';
import { blankThreats } from './threats';
import { goodAmount } from './stock';
import { seedSkills } from './work';
import { hash2 } from '../worldgen/noise';

/** Chance a generated adult has a spouse here (the rest are single or widowed). */
const MARRIED_CHANCE = 0.8;
/** Most years a spouse may differ in age from the first. */
const SPOUSE_AGE_GAP = 6;
/** Tries to find a given name nobody else at the site has. */
const NAME_TRIES = 12;
/** A generated mother is at least this many years past maturity. */
const MOTHER_MIN_AFTER_MATURITY = 2;
/** Chance a resident gets a second trait. */
const SECOND_TRAIT_CHANCE = 0.5;
/** Buildings start between this condition and 100, by a hash of their id (some need repair soon). */
const MIN_START_CONDITION = 55;

interface Resident {
  person: Person;
  age: number;
  notable: boolean;
  /** An elder who lives with this adult. */
  livesWith?: Id;
}

/** Full needs for a person whose culture weighs faith at `faith` (the faith need only above its line). */
export function startingNeeds(content: SiteContent, faith: number): Record<string, number> {
  const needs: Record<string, number> = {};
  for (const need of content.needs) {
    if (need.minCultureFaith === undefined || faith >= need.minCultureFaith) needs[need.id] = 100;
  }
  return needs;
}

/** Gives a person one trait, and often a second, that fit with each other (the same draws as promotion). */
export function rollTraits(content: SiteContent, person: Person, rng: RngStream): void {
  const traitDefs = new Map(content.traits.map((t) => [t.id, t]));
  const want = rng.chance(SECOND_TRAIT_CHANCE) ? 2 : 1;
  for (let n = 0; n < want; n += 1) {
    const options = content.traits.filter(
      (t) =>
        !person.traits.includes(t.id) &&
        !t.excludes.some((x) => person.traits.includes(x)) &&
        !person.traits.some((x) => traitDefs.get(x)?.excludes.includes(t.id)),
    );
    if (options.length === 0) break;
    person.traits.push(rng.weighted(options.map((t) => [t.id, t.weight] as const)));
  }
}

export function embark(world: WorldState, content: SiteContent, siteId: Id): ActiveSite {
  const site = world.sites.get(siteId);
  const cells = world.cells;
  if (!site || !cells) throw new Error(`Cannot embark on site ${siteId}.`);
  if (world.activeSite) throw new Error('A site is already being watched.');
  const rules = content.site;
  const rng = streamFor(world, 'site.promote');
  const year = world.params.historyYears;
  const races = new Map<string, RaceDef>(content.races.map((r) => [r.id, r]));
  const cultures = new Map<string, CultureDef>(content.cultures.map((c) => [c.id, c]));
  const raceOf = (id: string): RaceDef => {
    const race = races.get(id);
    if (!race) throw new Error(`Unknown race "${id}".`);
    return race;
  };
  const cultureOf = (id: string): CultureDef => {
    const culture = cultures.get(id);
    if (!culture) throw new Error(`Unknown culture "${id}".`);
    return culture;
  };
  const total = totalPop(site);
  const share = total > rules.followCap ? rules.followCap / total : 1;

  const residents = new Map<Id, Resident>();
  const promoted: Id[] = [];
  const names = new Set<string>();
  // Notables at the site keep their records.
  const notables = [...world.people.values()]
    .filter((p) => p.siteId === siteId && p.died === undefined)
    .sort((a, b) => a.id - b.id);
  const want = new Map<string, number>();
  const groupKey = (raceId: string, cultureId: string, band: string) =>
    `${raceId}|${cultureId}|${band}`;
  for (const b of site.pop) {
    want.set(groupKey(b.raceId, b.cultureId, b.band), Math.round(b.count * share));
  }
  for (const p of notables) {
    const age = year - p.born;
    residents.set(p.id, { person: p, age, notable: true });
    names.add(p.name);
    const key = groupKey(p.raceId, p.cultureId ?? '', bandOfAge(raceOf(p.raceId), age));
    want.set(key, Math.max(0, (want.get(key) ?? 0) - 1));
  }

  const spousesHere = (r: Resident) => r.person.family.spouses.filter((id) => residents.has(id));
  const make = (
    raceId: string,
    cultureId: string,
    age: number,
    sex: 'f' | 'm',
    parents: Resident[] = [],
  ): Resident => {
    const culture = cultureOf(cultureId);
    const aptitude = rollAptitude(
      {
        race: raceOf(raceId),
        parents: parents.map((p) => p.person),
        birthplaceAura: cells.aura[site.cell] ?? 0,
      },
      rng,
    );
    // Re-roll a name already used at the site, a few times, so residents rarely share one.
    let name = cultureGivenName(culture.names, rng);
    for (let t = 0; t < NAME_TRIES && names.has(name); t += 1) {
      name = cultureGivenName(culture.names, rng);
    }
    names.add(name);
    const id = world.nextId.person;
    world.nextId.person += 1;
    const person: Person = {
      id,
      name,
      raceId,
      cultureId,
      sex,
      born: year - age,
      birthplaceCell: site.cell,
      family: { parents: parents.map((p) => p.person.id), spouses: [], children: [] },
      attributes: aptitude.attributes,
      potential: aptitude.potential,
      magic: aptitude.magic,
      traits: [],
      skills: {},
      knownAbilities: [],
      fame: 0,
      deeds: [],
      health: 100,
      siteId,
      civId: site.civId,
    };
    for (const parent of parents) parent.person.family.children.push(id);
    world.people.set(id, person);
    promoted.push(id);
    const resident: Resident = { person, age, notable: false };
    residents.set(id, resident);
    return resident;
  };
  const marry = (a: Resident, b: Resident) => {
    a.person.family.spouses.push(b.person.id);
    b.person.family.spouses.push(a.person.id);
  };
  const randomSex = (): 'f' | 'm' => (rng.chance(0.5) ? 'f' : 'm');

  const groups = [...want.keys()].sort().map((key) => {
    const [raceId, cultureId, band] = key.split('|') as [string, string, string];
    return { raceId, cultureId, band, count: want.get(key)! };
  });
  // Adults first: couples by the culture's marriage custom.
  for (const g of groups) {
    if (g.band !== 'adult') continue;
    const race = raceOf(g.raceId);
    const culture = cultureOf(g.cultureId);
    const bands = ageBands(race);
    const adultAge = () =>
      rng.between(bands.adultFrom + 2, Math.max(bands.adultFrom + 2, bands.elderFrom - 1));
    let left = g.count;
    while (left > 0) {
      const a = make(g.raceId, g.cultureId, adultAge(), randomSex());
      left -= 1;
      if (left > 0 && rng.chance(MARRIED_CHANCE)) {
        const age = Math.max(bands.adultFrom, a.age + rng.between(-SPOUSE_AGE_GAP, SPOUSE_AGE_GAP));
        const b = make(g.raceId, g.cultureId, age, a.person.sex === 'f' ? 'm' : 'f');
        marry(a, b);
        left -= 1;
        // Where leaders take many spouses, some husbands take a second wife.
        const husband = a.person.sex === 'm' ? a : b;
        if (
          left > 0 &&
          culture.marriage.custom === 'leaders-many-spouses' &&
          rng.chance(rules.extraSpouseChance)
        ) {
          const wife = make(g.raceId, g.cultureId, adultAge(), 'f');
          marry(husband, wife);
          left -= 1;
        }
      }
    }
  }
  // Make sure someone is grown, so no household is ever without an adult; elders still to come count.
  const isAdult = (r: Resident) => r.age >= raceOf(r.person.raceId).maturityYears;
  const eldersToCome = groups.some((g) => g.band === 'elder' && g.count > 0);
  if (!eldersToCome && ![...residents.values()].some(isAdult)) {
    const g = groups[0];
    if (g) make(g.raceId, g.cultureId, raceOf(g.raceId).maturityYears + 4, randomSex());
  }
  // Children go to couples; elders live with a grown person of their own people.
  for (const g of groups) {
    if (g.band === 'adult') continue;
    const race = raceOf(g.raceId);
    const bands = ageBands(race);
    for (let n = 0; n < g.count; n += 1) {
      if (g.band === 'child') {
        // Notables keep the families history gave them, so only promoted couples take children.
        const mothers = [...residents.values()].filter(
          (r) =>
            !r.notable &&
            r.person.sex === 'f' &&
            r.person.raceId === g.raceId &&
            r.person.cultureId === g.cultureId &&
            r.age >= bands.adultFrom + MOTHER_MIN_AFTER_MATURITY &&
            r.age < bands.elderFrom &&
            spousesHere(r).length > 0,
        );
        if (mothers.length === 0) {
          make(g.raceId, g.cultureId, rng.between(0, bands.adultFrom - 1), randomSex());
          continue;
        }
        const mother = mothers[rng.int(mothers.length)]!;
        const father = spousesHere(mother)
          .map((id) => residents.get(id)!)
          .find((r) => r.person.sex === 'm');
        const maxAge = Math.min(bands.adultFrom - 1, mother.age - bands.adultFrom);
        make(
          g.raceId,
          g.cultureId,
          rng.between(0, maxAge),
          randomSex(),
          father ? [mother, father] : [mother],
        );
      } else {
        const elder = make(
          g.raceId,
          g.cultureId,
          rng.between(bands.elderFrom, bands.elderTo),
          randomSex(),
        );
        const kin = [...residents.values()].filter(
          (r) => isAdult(r) && r.age < bands.elderFrom && r.person.raceId === g.raceId,
        );
        const pool =
          kin.length > 0 ? kin : [...residents.values()].filter((r) => isAdult(r) && r !== elder);
        if (pool.length > 0) elder.livesWith = pool[rng.int(pool.length)]!.person.id;
      }
    }
  }

  // Households.
  const households = new Map<Id, Household>();
  const householdOf = new Map<Id, Id>();
  const aloneIds = new Set<Id>();
  let nextHousehold = 1;
  const found = (head: Id, alone: boolean): Household => {
    const household: Household = { id: nextHousehold, members: [], head, home: null };
    nextHousehold += 1;
    households.set(household.id, household);
    if (alone) aloneIds.add(household.id);
    return household;
  };
  const join = (id: Id, household: Household) => {
    household.members.push(id);
    householdOf.set(id, household.id);
  };
  const order = [...residents.values()].sort((a, b) => b.age - a.age || a.person.id - b.person.id);
  const here = (ids: readonly Id[]) => ids.filter((id) => residents.has(id));
  // 1. Married adults with a spouse here found households.
  for (const r of order) {
    if (householdOf.has(r.person.id) || !isAdult(r) || r.livesWith !== undefined) continue;
    const spouses = spousesHere(r).filter(
      (id) => isAdult(residents.get(id)!) && !householdOf.has(id),
    );
    if (spouses.length === 0) continue;
    const household = found(r.person.id, false);
    join(r.person.id, household);
    for (const id of spouses) join(id, household);
  }
  // 2. Single adults join a parent's or grown child's household, else live alone; elders placed
  // with a chosen adult go last so that adult already has a household.
  const kinHousehold = (r: Resident): Household | undefined => {
    const kin =
      r.livesWith !== undefined
        ? [r.livesWith]
        : [
            ...here(r.person.family.parents),
            ...here(r.person.family.children).filter((id) => isAdult(residents.get(id)!)),
          ];
    for (const id of kin) {
      const hid = householdOf.get(id);
      if (hid !== undefined) return households.get(hid);
    }
    return undefined;
  };
  for (const pass of [false, true]) {
    for (const r of order) {
      if (householdOf.has(r.person.id) || !isAdult(r) || (r.livesWith !== undefined) !== pass)
        continue;
      const household = kinHousehold(r);
      if (household) join(r.person.id, household);
      else join(r.person.id, found(r.person.id, true));
    }
  }
  // 3. Children go with a parent, else a grandparent or grown sibling, else are fostered into the
  // largest household.
  for (const r of order) {
    if (householdOf.has(r.person.id)) continue;
    const parents = r.person.family.parents;
    let household = households.get(
      here(parents)
        .map((id) => householdOf.get(id))
        .find((id) => id !== undefined) ?? -1,
    );
    if (!household) {
      const grand = parents.flatMap((id) => world.people.get(id)?.family.parents ?? []);
      const siblings = order
        .filter((q) => isAdult(q) && q.person.family.parents.some((id) => parents.includes(id)))
        .map((q) => q.person.id);
      const hid = [...here(grand), ...siblings]
        .map((id) => householdOf.get(id))
        .find((id) => id !== undefined);
      household = hid === undefined ? undefined : households.get(hid);
    }
    if (!household) {
      household = [...households.values()]
        .filter((h) => !aloneIds.has(h.id))
        .sort((a, b) => b.members.length - a.members.length || a.id - b.id)[0];
    }
    if (!household)
      household = [...households.values()].sort(
        (a, b) => b.members.length - a.members.length || a.id - b.id,
      )[0];
    join(r.person.id, household!);
  }
  for (const h of households.values()) if (h.members.length > 1) aloneIds.delete(h.id);
  // The ruler heads their own household.
  const civ = site.civId === null ? undefined : world.civs.get(site.civId);
  const rulerHousehold =
    civ?.rulerId !== undefined && householdOf.has(civ.rulerId)
      ? households.get(householdOf.get(civ.rulerId)!)
      : undefined;
  if (rulerHousehold) rulerHousehold.head = civ!.rulerId!;
  for (const h of households.values()) {
    h.members = [h.head, ...h.members.filter((id) => id !== h.head)];
  }

  // Map and layout: the ruler lives in the hall when the site has one.
  const coast = site.features.includes('coast');
  const isCapital = civ?.capital === siteId;
  const map = buildLocalMap(world, content, site.cell, String(siteId));
  const hallHousehold = isCapital ? rulerHousehold : undefined;
  const homeless = households.size - (hallHousehold ? 1 : 0);
  const layout = layoutSite(map, rules, {
    pop: Math.max(total, households.size * rules.peoplePerHome),
    followedHouseholds: homeless,
    isCapital,
    coast,
  });
  const buildings = new Map<Id, Building>();
  for (const b of layout.buildings) buildings.set(b.id, b);
  for (const b of layout.buildings) {
    if (b.defId === 'field') continue;
    b.condition =
      MIN_START_CONDITION + (hash2(map.cellX, map.cellY, b.id) % (101 - MIN_START_CONDITION));
  }
  const hall = layout.buildings.find((b) => b.defId === 'hall');
  const homes = layout.buildings.filter((b) => b.defId === 'home');
  let nextHome = 0;
  for (const h of sortedById(households.values())) {
    const home = h === hallHousehold && hall ? hall : homes[nextHome++];
    if (!home) continue;
    home.owner = h.head;
    h.home = home.id;
  }

  // Positions inside the home (or on the green when homeless), and the records' site-tier detail.
  const size = map.width;
  for (const h of households.values()) {
    const home = h.home === null ? undefined : buildings.get(h.home);
    const spots: [number, number][] = [];
    if (home) {
      for (let y = home.y + 1; y < home.y + home.h - 1; y += 1) {
        for (let x = home.x + 1; x < home.x + home.w - 1; x += 1) spots.push([x, y]);
      }
    }
    h.members.forEach((id, i) => {
      const person = residents.get(id)!.person;
      const pos: [number, number] =
        spots.length > 0
          ? spots[i % spots.length]!
          : [
              Math.min(size - 1, layout.origin[0] - 3 + (i % 7)),
              Math.min(size - 1, layout.origin[1] - 2 + (Math.floor(i / 7) % 5)),
            ];
      person.family.householdId = h.id;
      const faith = person.cultureId ? (cultures.get(person.cultureId)?.values.faith ?? -1) : -1;
      const needs = startingNeeds(content, faith);
      person.detail = {
        needs,
        mood: 0,
        stress: 0,
        memories: [],
        relationships: new Map(),
        pos,
        // Watching begins after the evening meal; the first block run is the night.
        activity: 'eat',
        placeId: h.home,
        moodParts: [],
        lastAte: world.day,
        lastMet: Object.fromEntries(Object.keys(needs).map((id) => [id, world.day])),
        conditions: [],
      };
    });
  }

  // Traits: one, and often a second, for everyone who has none yet (notables keep what they gain after leaving).
  const traitRng = streamFor(world, 'site.traits');
  for (const id of [...residents.keys()].sort((a, b) => a - b)) {
    const person = residents.get(id)!.person;
    if (person.traits.length > 0) continue;
    rollTraits(content, person, traitRng);
  }

  // Stock: each good becomes its starting item, scaled by the followed share, in whole items.
  const { items, steward } = content;
  const stock = new Map<string, number>();
  for (const good of GOODS) {
    const def = items.find((i) => i.id === steward.startItems[good])!;
    stock.set(def.id, Math.round((site.goods[good] * share) / def.per));
  }
  // Everyone grown starts with a tool, made from the site's ore.
  const toolDef = items.find((i) => i.kind === 'tool');
  const oreDef = items.find((i) => i.id === steward.startItems.ore);
  const tools = [...residents.values()].filter(isAdult).length;
  if (toolDef && oreDef) {
    stock.set(toolDef.id, tools);
    stock.set(
      oreDef.id,
      Math.max(0, (stock.get(oreDef.id) ?? 0) - Math.round((tools * toolDef.per) / oreDef.per)),
    );
  }
  const itemsAtEntry: [Id, Id | null][] = [];
  for (const item of world.items.values()) {
    if (item.holder !== null && residents.has(item.holder))
      itemsAtEntry.push([item.id, item.holder]);
  }
  const active: ActiveSite = {
    siteId,
    enteredDay: world.day,
    map,
    residents: [...residents.keys()].sort((a, b) => a - b),
    promoted,
    households,
    buildings,
    stock,
    share,
    goodsAtEntry: { ...site.goods },
    stockAtEntry: {},
    origin: layout.origin,
    block: 0,
    storesEmptyEvent: null,
    dead: [],
    layoutVersion: 0,
    itemsAtEntry,
    stewardFocus: null,
    peopleVersion: 0,
    popDelta: {},
    interactions: 0,
    society: blankSociety(),
    threat: null,
    threats: blankThreats(),
    ...blankEnvironment(year),
  };
  for (const good of GOODS) active.stockAtEntry[good] = goodAmount(active, content, good);
  world.activeSite = active;
  initEnvironment(world, content, active);
  seedSkills(world, content, active);
  return active;
}
