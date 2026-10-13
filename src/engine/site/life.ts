// Daily life (M3.2, REBOOT_PLAN §6A): four blocks a day. Each block every resident picks an
// activity from the schedule (or a running breakdown), walks toward its place, satisfies and
// loses needs, and sums mood from low needs, memories and traits. Stress builds under bad mood
// and breaks out by trait: tantrum, despair, wandering or theft, which witnesses remember.
//
// A block runs in passes, each over residents in id order: (0) breakdowns end or begin, from the
// stress left at the end of the last block, so a breakdown acts in the block it starts; (1)
// activity, destination and walking; (2) work, needs, meals, memories, mood and stress. Once a
// day, at the first block, the steward (work.ts) hands out the day's jobs.

import { DAYS_PER_YEAR, MONTHS_PER_YEAR, dateOf } from '../core/clock';
import { createEmitter, type EmitInput } from '../core/context';
import {
  ACTIVITIES,
  DAY_BLOCKS,
  type Activity,
  type BreakdownKind,
  type JobDef,
  type MemoryDef,
  type RaceDef,
  type TraitDef,
} from '../core/content-types';
import { streamFor } from '../core/rng';
import type {
  ActiveSite,
  Building,
  Household,
  Id,
  Memory,
  MoodPart,
  Person,
  PersonDetail,
  SimEvent,
  WorldState,
} from '../core/types';
import { bandOfAge, type Band, type SiteContent } from './defs';
import { findRoute, tileCost, walkAlong } from './path';
import { foodMeals, takeFood } from './stock';
import {
  residentItems,
  runSteward,
  runWork,
  theftTarget,
  transferItem,
  workTile,
  type CrewMember,
} from './work';

/** Per-person facts that do not change while the site runs. */
interface Profile {
  id: Id;
  person: Person;
  race: RaceDef;
  traits: TraitDef[];
  /** Product of the traits' decay rates, per `content.needs` index. */
  rates: number[];
  /** Product of the traits' `breakdownAt`. */
  breakdownMul: number;
  /** The first trait's breakdown, if any trait has one. */
  breakdownKind: BreakdownKind | undefined;
  /** Has a need that only some cultures keep (faith): such people keep the rest day. */
  faithful: boolean;
  household: Household | undefined;
  homeId: Id | null;
  /** Destination tiles; -1 where the site has none. */
  home: number;
  /** Where the evening meal is eaten: home, or the hall (else the green) for those who live alone. */
  table: number;
  green: number;
  field: number;
  shrine: number;
  stockpile: number;
  wander: number;
  /** This block: the job they were given today, and the tile they work it at (-1: none). */
  job: JobDef | undefined;
  workTile: number;
  /** The work tile last looked up, and for which job, layout version and day (construction moves daily). */
  tileJob: JobDef | undefined;
  tileVersion: number;
  tileDay: number;
  tileAt: number;
  /** A theft breakdown that takes an item rather than food. */
  itemTheft: boolean;
  /** This block: where they stand after walking. */
  tile: number;
  placeId: Id | null;
  band: Band;
  /** Whole years old this block. */
  age: number;
  ate: boolean;
}

/** Lookups derived once per watched site; never saved (they rebuild from the state). */
interface SiteCache {
  jobs: Map<string, JobDef>;
  /** Per activity: what it restores of each need (`content.needs` order); NaN where it restores none. */
  restore: Map<string, Float64Array>;
  /** The `layoutVersion` the profiles were built for; a change means rebuild. */
  version: number;
  profiles: Profile[];
  byId: Map<Id, Profile>;
  memoryDefs: Map<string, MemoryDef>;
  emit: (input: EmitInput) => SimEvent;
  siteName: string;
  siteCell: number;
  /** Residents standing in each building this block, by building id. */
  inside: Int32Array;
  /** Residents who ate in each building this block. */
  ateIn: Int32Array;
  /** Residents outdoors on each tile this block. */
  outdoors: Int32Array;
  /** Meals one average resident eats at a meal. */
  meal: number;
}

const caches = new WeakMap<ActiveSite, SiteCache>();

/** Residents this close (tiles) share company outdoors. */
const COMPANY_RANGE = 2;
/** The greens' spread: a person's spot is within this many tiles of the origin. */
const GREEN_SPREAD = 3;
/** Blocks in a day. */
const BLOCKS = DAY_BLOCKS.length;
/** Stress and mood limits. */
const MAX_STRESS = 200;
const MAX_MOOD = 100;

/** A stable pseudo-random number from an id and a salt, so a spot needs no storage. */
function mix(id: number, salt: number): number {
  return Math.imul(id * 31 + salt, 0x9e3779b1) >>> 7;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** A memory's mood on `day`: fades linearly from its full value to 0 over its decay days. */
export function memoryMood(
  memory: { moodDelta: number; createdDay: number; decayDays: number },
  day: number,
): number {
  const age = day - memory.createdDay;
  if (age >= memory.decayDays) return 0;
  return memory.moodDelta * (1 - Math.max(0, age) / memory.decayDays);
}

/** The day's temperature (°C) at the watched site's cell, from its summer high and winter low. */
export function siteTemperature(world: WorldState, content: SiteContent, day: number): number {
  const active = world.activeSite;
  const cells = world.cells;
  if (!active || !cells) throw new Error('No watched site.');
  const k = active.map.cellY * cells.width + active.map.cellX;
  const summer = cells.tempSummer[k]!;
  const winter = cells.tempWinter[k]!;
  const half = MONTHS_PER_YEAR / 2;
  const gap = Math.abs(dateOf(day).month - content.life.warmth.coldestMonth);
  const w = 1 - Math.min(gap, MONTHS_PER_YEAR - gap) / half;
  return summer + (winter - summer) * w;
}

function interiorSpot(b: Building, index: number, width: number): number {
  const w = Math.max(1, b.w - 2);
  const h = Math.max(1, b.h - 2);
  const n = w * h;
  const i = index % n;
  return (b.y + 1 + Math.floor(i / w)) * width + b.x + 1 + (i % w);
}

function buildCache(world: WorldState, content: SiteContent, active: ActiveSite): SiteCache {
  const { life, site: rules } = content;
  const map = active.map;
  const width = map.width;
  const site = world.sites.get(active.siteId);
  const races = new Map(content.races.map((r) => [r.id, r]));
  const traitDefs = new Map(content.traits.map((t) => [t.id, t]));
  const buildings = [...active.buildings.values()].sort((a, b) => a.id - b.id);
  const fields = buildings.filter((b) => b.defId === 'field' && b.followed);
  const stockpile = buildings.find((b) => b.defId === 'stockpile');
  const shrine = buildings.find((b) => b.defId === 'shrine');
  const hall = buildings.find((b) => b.defId === 'hall');
  const centreOf = (b: Building): [number, number] => [b.x + (b.w >> 1), b.y + (b.h >> 1)];
  const cellOf = (b: Building | undefined, id: number, salt: number) =>
    b ? b.cells[mix(id, salt) % b.cells.length]! : -1;
  // Homes of families, and how many live alone (see `table` below).
  const familyHomes: Building[] = [];
  let loners = 0;
  for (const h of [...active.households.values()].sort((a, b) => a.id - b.id)) {
    const home = h.home == null ? undefined : active.buildings.get(h.home);
    if (h.members.length > 1 && home) familyHomes.push(home);
    else if (h.members.length <= 1) loners += 1;
  }
  const profiles: Profile[] = [];
  const index = new Map<Id, number>();
  for (const id of active.residents) {
    const person = world.people.get(id);
    if (!person) continue;
    const household = active.households.get(person.family.householdId ?? -1);
    const home = household?.home == null ? undefined : active.buildings.get(household.home);
    const traits = person.traits.flatMap((t) => traitDefs.get(t) ?? []);
    const rates = content.needs.map((need) =>
      traits.reduce((r, t) => r * (t.needRates?.[need.id] ?? 1), 1),
    );
    const slot = household ? household.members.indexOf(id) : 0;
    const [ox, oy] = active.origin;
    const gx = clamp(ox + (mix(id, 1) % (2 * GREEN_SPREAD + 1)) - GREEN_SPREAD, 0, width - 1);
    const gy = clamp(oy + (mix(id, 2) % (2 * GREEN_SPREAD + 1)) - GREEN_SPREAD, 0, map.height - 1);
    const green = tileCost(active, rules, life, gy * width + gx)
      ? gy * width + gx
      : oy * width + ox;
    // The followed field nearest their home (or the green), measured centre to centre.
    const [hx, hy] = home ? centreOf(home) : [ox, oy];
    let field: Building | undefined;
    let best = Infinity;
    for (const f of fields) {
      const [fx, fy] = centreOf(f);
      const d = Math.abs(fx - hx) + Math.abs(fy - hy);
      if (d < best) {
        best = d;
        field = f;
      }
    }
    // The family home nearest theirs (or the green), for someone who would eat alone at the hall.
    let neighbour: Building | undefined;
    best = Infinity;
    for (const f of familyHomes) {
      const [fx, fy] = centreOf(f);
      const d = Math.abs(fx - hx) + Math.abs(fy - hy);
      if (d < best) {
        best = d;
        neighbour = f;
      }
    }
    // A wanderer heads for a map-edge tile found by walking the perimeter from a spot set by id.
    const ring = 4 * (width - 1);
    let wander = -1;
    for (let t = 0; t < ring && wander < 0; t += 1) {
      const p = (mix(id, 3) + t) % ring;
      const side = Math.floor(p / (width - 1));
      const off = p % (width - 1);
      const x = side === 0 ? off : side === 1 ? width - 1 : side === 2 ? width - 1 - off : 0;
      const y =
        side === 0 ? 0 : side === 1 ? off : side === 2 ? map.height - 1 : map.height - 1 - off;
      if (tileCost(active, rules, life, y * width + x)) wander = y * width + x;
    }
    index.set(id, profiles.length);
    profiles.push({
      id,
      person,
      race: races.get(person.raceId)!,
      traits,
      rates,
      breakdownMul: traits.reduce((m, t) => m * t.breakdownAt, 1),
      breakdownKind: traits.find((t) => t.breakdown)?.breakdown,
      faithful: content.needs.some(
        (n) => n.minCultureFaith !== undefined && person.detail?.needs[n.id] !== undefined,
      ),
      household,
      homeId: home?.id ?? null,
      home: home ? interiorSpot(home, slot, width) : green,
      // Someone who lives alone eats at the hall's hearth for company; with no hall, or nobody else
      // living alone, at a neighbour's table (the green, spread wide, rarely puts two loners together).
      table:
        home && (household?.members.length ?? 0) > 1
          ? interiorSpot(home, slot, width)
          : (!hall || loners < 2) && neighbour
            ? interiorSpot(neighbour, mix(id, 8), width)
            : hall
              ? interiorSpot(hall, mix(id, 8), width)
              : green,
      green,
      field: field ? cellOf(field, id, 4) : cellOf(stockpile, id, 5),
      shrine: shrine ? cellOf(shrine, id, 6) : green,
      stockpile: stockpile ? cellOf(stockpile, id, 7) : green,
      wander: wander < 0 ? green : wander,
      job: undefined,
      workTile: -1,
      tileJob: undefined,
      tileVersion: -1,
      tileDay: -1,
      tileAt: -1,
      itemTheft: false,
      tile: 0,
      placeId: null,
      band: 'adult',
      age: 0,
      ate: false,
    });
  }
  let meal = 0;
  for (const p of profiles) meal += p.race.foodNeed;
  return {
    version: active.layoutVersion,
    jobs: new Map(content.jobs.map((j) => [j.id, j])),
    restore: new Map(
      ACTIVITIES.map((a) => [a, Float64Array.from(content.needs, (n) => n.restore[a] ?? NaN)]),
    ),
    profiles,
    byId: new Map(profiles.map((p) => [p.id, p])),
    memoryDefs: new Map(content.memories.map((m) => [m.id, m])),
    emit: createEmitter(world, content.eventTypes),
    siteName: site?.name ?? '',
    siteCell: site?.cell ?? -1,
    inside: new Int32Array(Math.max(0, ...active.buildings.keys()) + 1),
    ateIn: new Int32Array(Math.max(0, ...active.buildings.keys()) + 1),
    outdoors: new Int32Array(map.width * map.height),
    meal: profiles.length > 0 ? meal / profiles.length : 0,
  };
}

function addMemory(
  cache: SiteCache,
  cap: number,
  detail: PersonDetail,
  type: string,
  day: number,
  about?: Id,
  eventId?: Id,
) {
  const def = cache.memoryDefs.get(type);
  if (!def) throw new Error(`Unknown memory "${type}".`);
  const memories = detail.memories;
  // One memory per type: seeing a second tantrum refreshes the first (now about the newest one)
  // rather than stacking, so a bad week cannot pile up past bearing.
  const same = memories.find((m) => m.type === type);
  const fresh: Memory = {
    type,
    moodDelta: def.mood,
    createdDay: day,
    decayDays: def.decayDays,
  };
  if (about !== undefined) fresh.about = about;
  if (eventId !== undefined) fresh.eventId = eventId;
  if (same) {
    Object.assign(same, fresh);
    if (about === undefined) delete same.about;
    if (eventId === undefined) delete same.eventId;
    return;
  }
  memories.push(fresh);
  // Past the cap the weakest by current mood go first.
  while (memories.length > cap) {
    let weakest = 0;
    for (let i = 1; i < memories.length; i += 1) {
      if (Math.abs(memoryMood(memories[i]!, day)) < Math.abs(memoryMood(memories[weakest]!, day))) {
        weakest = i;
      }
    }
    memories.splice(weakest, 1);
  }
}

function tileOf(detail: PersonDetail, width: number): number {
  const [x, y] = detail.pos!;
  return y * width + x;
}

/** Sums a resident's mood from low needs, memories and traits, then moves their stress. */
function settleMood(p: Profile, content: SiteContent, day: number): void {
  const { life } = content;
  const detail = p.person.detail!;
  // Memories fade; the gone ones are dropped before the sum.
  const memories = detail.memories;
  let kept = 0;
  for (let i = 0; i < memories.length; i += 1) {
    const m = memories[i]!;
    if (day - m.createdDay < m.decayDays) memories[kept++] = m;
  }
  memories.length = kept;
  const parts: MoodPart[] = [];
  let mood = 0;
  for (const need of content.needs) {
    const value = detail.needs[need.id];
    if (value === undefined || value >= need.lowAt) continue;
    const part = round1((need.moodAtZero * (need.lowAt - value)) / need.lowAt);
    if (part !== 0) parts.push({ kind: 'need', id: need.id, value: part });
    mood += part;
  }
  for (const m of detail.memories) {
    const part = round1(memoryMood(m, day));
    if (part === 0) continue;
    const entry: MoodPart = { kind: 'memory', id: m.type, value: part };
    if (m.about !== undefined) entry.about = m.about;
    parts.push(entry);
    mood += part;
  }
  for (const t of p.traits) {
    if (t.mood === 0) continue;
    parts.push({ kind: 'trait', id: t.id, value: t.mood });
    mood += t.mood;
  }
  detail.moodParts = parts;
  detail.mood = Math.round(clamp(mood, -MAX_MOOD, MAX_MOOD));
  if (detail.mood < life.stressBelow) {
    detail.stress += ((life.stressBelow - detail.mood) * life.stressRise) / BLOCKS;
  } else if (detail.mood > 0) {
    detail.stress -= Math.max(detail.mood * life.stressFall, life.stressFloorFall) / BLOCKS;
  }
  detail.stress = clamp(detail.stress, 0, MAX_STRESS);
  // A tantrum or theft is over with the block.
  const bd = detail.breakdown;
  if (bd && (bd.kind === 'tantrum' || bd.kind === 'theft')) detail.breakdown = undefined;
}

/** The lookups for the site as it stands: rebuilt when buildings or the map changed. */
function cacheFor(world: WorldState, content: SiteContent, active: ActiveSite): SiteCache {
  let cache = caches.get(active);
  if (!cache || cache.version !== active.layoutVersion) {
    cache = buildCache(world, content, active);
    caches.set(active, cache);
  }
  return cache;
}

/** Runs one block of the watched site. After the evening block the day advances. */
export function stepBlock(world: WorldState, content: SiteContent): SimEvent[] {
  const active = world.activeSite;
  if (!active) throw new Error('No watched site.');
  // Buildings or the map changed since the profiles were built (a home finished): rebuild them.
  const cache = cacheFor(world, content, active);
  const { life, site: rules, steward } = content;
  const first = world.events.length;
  const day = world.day;
  const block = active.block;
  const width = active.map.width;
  const cell = cache.siteCell;
  const profiles = cache.profiles;
  const rng = streamFor(world, 'site.life');
  const restDay = day % life.restDayEvery === life.restDayEvery - 1;
  const yearsIn = Math.floor((day - active.enteredDay) / DAYS_PER_YEAR);
  const history = world.params.historyYears;
  const emit = (type: string, p: Profile, causes: Id[]) =>
    cache.emit({
      type,
      actors: [p.id],
      place: cell,
      causes,
      data: { site: cache.siteName },
    });
  const add = (p: Profile, type: string, about?: Id, eventId?: Id) =>
    addMemory(cache, life.memoryCap, p.person.detail!, type, day, about, eventId);

  const startBreakdown = (p: Profile) => {
    const detail = p.person.detail!;
    let kind: BreakdownKind =
      p.band === 'child' ? life.childBreakdown : (p.breakdownKind ?? life.defaultBreakdown);
    // A thief goes for a treasure someone holds before the stores; with neither within reach, rages.
    const prize = kind === 'theft' ? theftTarget(world, content, active, p.id) : undefined;
    if (
      kind === 'theft' &&
      !prize &&
      foodMeals(active, content) < life.theftMeals * p.race.foodNeed
    ) {
      kind = 'tantrum';
    }
    const causes = new Set<Id>();
    for (const m of detail.memories) {
      if (m.eventId !== undefined && memoryMood(m, day) < 0) causes.add(m.eventId);
    }
    const food = content.needs.find((n) => n.id === 'food');
    if (active.storesEmptyEvent !== null && food && (detail.needs[food.id] ?? 100) < food.lowAt) {
      causes.add(active.storesEmptyEvent);
    }
    let event: SimEvent;
    if (prize) {
      event = cache.emit({
        type: steward.events.itemStolen,
        actors: [p.id, prize.holder],
        place: cell,
        causes: [...causes],
        data: { site: cache.siteName, item: prize.item.name },
      });
      transferItem(content, active, prize.item, p.id, event.id);
      p.itemTheft = true;
    } else event = emit(life.events[kind], p, [...causes]);
    const days =
      kind === 'despair'
        ? rng.between(life.despairDays[0], life.despairDays[1])
        : kind === 'wandering'
          ? rng.between(life.wanderDays[0], life.wanderDays[1])
          : 0;
    detail.breakdown = { kind, untilDay: day + days, eventId: event.id };
    detail.stress = life.stressAfter;
    add(p, life.memoryOf.vented, undefined, event.id);
    // Witnesses by distance; a wanderer is missed by the household instead.
    const [px, py] = detail.pos!;
    for (const q of profiles) {
      if (q === p) continue;
      const other = q.person.detail!;
      if (kind === 'wandering') {
        if (q.household && q.household === p.household) {
          add(q, life.memoryOf.kinWandered, p.id, event.id);
        }
        continue;
      }
      const [qx, qy] = other.pos!;
      if (Math.max(Math.abs(qx - px), Math.abs(qy - py)) > life.witnessRange) continue;
      const type =
        kind === 'tantrum'
          ? life.memoryOf.sawTantrum
          : kind === 'despair'
            ? life.memoryOf.sawDespair
            : life.memoryOf.sawTheft;
      add(q, type, p.id, event.id);
    }
  };

  /** A small child's carer: their mother in the household, else their father, else its head. */
  const carerOf = (p: Profile): Profile | undefined => {
    const members = p.household?.members ?? [];
    const grown = (id: Id) => {
      const q = cache.byId.get(id);
      return q && q !== p && q.age >= life.carriedUnder && q.band !== 'child' ? q : undefined;
    };
    const parents = p.person.family.parents.filter((id) => members.includes(id));
    const mother = parents.map(grown).find((q) => q?.person.sex === 'f');
    const father = parents.map(grown).find((q) => q !== undefined);
    return mother ?? father ?? (p.household ? grown(p.household.head) : undefined);
  };

  // Pass 0: breakdowns end or begin.
  for (const p of profiles) {
    const detail = p.person.detail!;
    p.age = history - p.person.born + yearsIn;
    p.band = bandOfAge(p.race, p.age);
    p.itemTheft = false;
    const running = detail.breakdown;
    if (
      running &&
      running.untilDay <= day &&
      running.kind !== 'tantrum' &&
      running.kind !== 'theft'
    ) {
      detail.breakdown = undefined;
      // Despair just lifts; a wanderer is back, which is news.
      if (running.kind === 'wandering') emit(life.events.returned, p, [running.eventId]);
    }
    if (detail.breakdown || detail.stress < life.breakdownAt * p.breakdownMul) continue;
    startBreakdown(p);
  }

  // The steward hands out the day's jobs before anyone sets out.
  if (block === 0) {
    runSteward(world, content, active, profiles, cache.emit, { name: cache.siteName, cell });
    // A building begun just now may be stood in this block. No household moves until it is
    // finished, so the profiles stay as they are.
    if (cache.version !== active.layoutVersion) {
      const slots = Math.max(0, ...active.buildings.keys()) + 1;
      cache.inside = new Int32Array(slots);
      cache.ateIn = new Int32Array(slots);
      cache.version = active.layoutVersion;
    }
  }

  // Pass 1: activity, destination, walking.
  const budget = { left: life.pathBudget };
  cache.inside.fill(0);
  /** Settles where a person stands this block and counts them there. */
  const standAt = (p: Profile, tile: number) => {
    const building = active.map.building[tile]!;
    p.tile = tile;
    p.placeId = building === 0 ? null : building;
    p.person.detail!.placeId = p.placeId;
    if (p.placeId === null) cache.outdoors[tile]! += 1;
    else cache.inside[p.placeId]! += 1;
  };
  const carried: Profile[] = [];
  for (const p of profiles) {
    const detail = p.person.detail!;
    p.job = detail.jobId === undefined ? undefined : cache.jobs.get(detail.jobId);
    p.workTile = -1;
    // Small children go where their carer goes, once the grown-ups have moved.
    if (p.age < life.carriedUnder && carerOf(p)) {
      carried.push(p);
      continue;
    }
    detail.with = undefined;
    const bd = detail.breakdown;
    let activity: Activity;
    if (bd?.kind === 'despair') activity = block === 0 ? 'sleep' : 'despair';
    else if (bd?.kind === 'wandering') activity = 'wander';
    else if (bd?.kind === 'tantrum') activity = 'tantrum';
    else if (bd?.kind === 'theft') activity = 'steal';
    else if (block === 2 && restDay) {
      activity = p.faithful ? life.restDayAfternoon.faithful : life.restDayAfternoon.others;
    } else activity = life.schedule[p.band][DAY_BLOCKS[block]!];
    detail.activity = activity;
    if (activity === 'work' && p.job) {
      const job = p.job;
      if (
        p.tileJob !== job ||
        p.tileVersion !== active.layoutVersion ||
        (job.workplace === 'construction' && p.tileDay !== day)
      ) {
        p.tileJob = job;
        p.tileVersion = active.layoutVersion;
        p.tileDay = day;
        p.tileAt = workTile(content, active, p, job);
      }
      p.workTile = p.tileAt;
    }
    const from = tileOf(detail, width);
    const to =
      activity === 'tantrum'
        ? from
        : activity === 'eat'
          ? p.table
          : activity === 'sleep' || activity === 'despair'
            ? p.home
            : activity === 'work'
              ? p.workTile >= 0
                ? p.workTile
                : p.field
              : activity === 'worship'
                ? p.shrine
                : activity === 'wander'
                  ? p.wander
                  : activity === 'steal'
                    ? p.stockpile
                    : p.green;
    let tile = from;
    if (to !== from) {
      const route = findRoute(active, rules, life, from, to, budget);
      const reached = route ? walkAlong(active, rules, life, route, life.walkPerBlock) : -1;
      if (reached >= 0) tile = reached;
      if (tile !== from) detail.pos = [tile % width, Math.floor(tile / width)];
    }
    standAt(p, tile);
  }
  for (const p of carried) {
    const detail = p.person.detail!;
    const carer = carerOf(p)!;
    const theirs = carer.person.detail!.activity!;
    // A carer who wandered off or broke down leaves the child asleep at home.
    const away = theirs === 'wander' || theirs === 'tantrum' || theirs === 'steal';
    detail.with = carer.id;
    detail.activity = away ? 'sleep' : theirs;
    const tile = away ? p.home : carer.tile;
    detail.pos = [tile % width, Math.floor(tile / width)];
    standAt(p, tile);
  }

  // Pass 2: work, needs, meals, memories, mood, stress.
  cache.ateIn.fill(0);
  // Whoever stands at their workplace works (builds, hauls or makes items, and learns).
  const crew: CrewMember[] = [];
  for (const p of profiles) {
    if (p.job && p.person.detail!.activity === 'work' && p.workTile >= 0 && p.tile === p.workTile) {
      crew.push({ id: p.id, person: p.person, band: p.band, traits: p.traits, job: p.job });
    }
  }
  const liked = runWork(world, content, active, crew, cache.emit, {
    name: cache.siteName,
    cell,
  });
  const temperature = siteTemperature(world, content, day);
  const coldLoss =
    clamp((life.warmth.comfortC - temperature) * life.warmth.perDegree, 0, life.warmth.maxPerDay) /
    BLOCKS;
  const food = (): number => foodMeals(active, content);
  // Warmth is the one need whose decay follows the day's temperature.
  const nNeeds = content.needs.length;
  const decays = content.needs.map((n) => (n.id === 'warmth' ? coldLoss : n.decayPerDay / BLOCKS));
  const checkStores = () => {
    if (active.storesEmptyEvent === null && food() < cache.meal) {
      active.storesEmptyEvent = cache.emit({
        type: life.events.storesEmpty,
        place: cell,
        data: { site: cache.siteName },
      }).id;
    }
  };
  const hasCompany = (p: Profile): boolean => {
    if (p.placeId !== null) return cache.inside[p.placeId]! > 1;
    const x = p.tile % width;
    const y = Math.floor(p.tile / width);
    let near = 0;
    for (let dy = -COMPANY_RANGE; dy <= COMPANY_RANGE; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= active.map.height) continue;
      for (let dx = -COMPANY_RANGE; dx <= COMPANY_RANGE; dx += 1) {
        const xx = x + dx;
        if (xx >= 0 && xx < width) near += cache.outdoors[yy * width + xx]!;
      }
    }
    return near > 1;
  };

  for (const p of profiles) {
    const detail = p.person.detail!;
    const activity = detail.activity!;
    const atHome = p.placeId !== null && p.placeId === p.homeId;
    const needs = detail.needs;
    const meal = p.race.foodNeed;
    let fed = false;
    if (activity === 'eat') {
      if (food() >= meal) {
        const { taken, cooked } = takeFood(active, content, meal, true);
        // A meal that was mostly cooked is remembered.
        if (cooked * 2 >= taken) add(p, life.memoryOf.ateWell);
        fed = true;
        p.ate = true;
        detail.lastAte = day;
        if (p.placeId !== null) cache.ateIn[p.placeId]! += 1;
        checkStores();
      } else {
        checkStores();
        add(p, life.memoryOf.hungry, undefined, active.storesEmptyEvent ?? undefined);
      }
    } else if (activity === 'steal') {
      // A thief after a treasure leaves the stores alone and goes hungry still.
      if (!p.itemTheft) {
        takeFood(active, content, life.theftMeals * meal, false);
        fed = true;
      }
      checkStores();
    }
    const restoreRow = cache.restore.get(activity)!;
    for (let j = 0; j < nNeeds; j += 1) {
      const need = content.needs[j]!;
      let value = needs[need.id];
      if (value === undefined) continue;
      value -= decays[j]! * p.rates[j]!;
      const restore = restoreRow[j]!;
      if (restore === restore && (need.id !== 'food' || fed)) {
        const gain =
          !need.needsCompany || hasCompany(p) ? restore * (atHome ? 1 : need.awayShare) : 0;
        if (gain > 0) {
          value += gain;
          // For "why" lines: "Idle: no work for 3 days".
          (detail.lastMet ??= {})[need.id] = day;
        }
      }
      // Work at a job they like feeds the purpose need more.
      if (need.id === 'purpose' && liked.has(p.id)) value += steward.likedPurpose;
      needs[need.id] = clamp(value, 0, 100);
    }
    if (activity === 'sleep' && !atHome) add(p, life.memoryOf.sleptRough);
    if (activity === 'worship') add(p, life.memoryOf.worshipped);
  }
  // Evening: a cursed heirloom troubles its holder, a treasure is envied at the table.
  if (block === BLOCKS - 1) {
    for (const held of residentItems(world, content, active)) {
      const holder = cache.byId.get(held.holder);
      if (!holder) continue;
      if (held.def.downsides?.includes('curse')) add(holder, life.memoryOf.cursed);
      if (!held.def.downsides?.includes('envy') || !holder.ate || holder.placeId === null) continue;
      for (const q of profiles) {
        if (q === holder || !q.ate || q.placeId !== holder.placeId) continue;
        if (q.traits.some((t) => t.id === steward.envyTrait)) {
          add(q, life.memoryOf.envied, holder.id);
        }
      }
    }
  }
  for (const p of profiles) {
    if (p.ate && p.placeId !== null && cache.ateIn[p.placeId]! > 1) {
      add(p, life.memoryOf.ateTogether);
    }
    p.ate = false;
    settleMood(p, content, day);
    if (p.placeId === null) cache.outdoors[p.tile] = 0;
  }
  // The stores count as refilled once they cover three meals for everyone.
  if (active.storesEmptyEvent !== null && food() > 3 * cache.meal * profiles.length) {
    active.storesEmptyEvent = null;
  }

  if (block === BLOCKS - 1) {
    world.day += 1;
    active.block = 0;
  } else active.block += 1;
  return world.events.slice(first);
}

/** The map layers that change when buildings go up: sent only when `layoutVersion` moves. */
export interface SiteMapSnapshot {
  terrain: Uint8Array;
  tree: Uint8Array;
  building: Uint16Array;
  bridges: number[];
}

/** What the main thread needs after each tick to mirror the running site (M3.1 loose end). */
export interface SiteSnapshot {
  day: number;
  block: number;
  stock: [string, number][];
  storesEmptyEvent: Id | null;
  people: [Id, PersonDetail][];
  /** M3.3: skills by person, the buildings and which home each household has. */
  skills: [Id, Record<string, number>][];
  buildings: Building[];
  homes: [Id, Id | null][];
  layoutVersion: number;
  /** The steward's top concern (see `ActiveSite.stewardFocus`). */
  stewardFocus: string | null;
  /** World items at the site and who holds each now. */
  items: [Id, Id | null][];
  /** Present only when `layoutVersion` differs from the version the caller last received. */
  map?: SiteMapSnapshot;
}

/**
 * The snapshot holds references; posting it to the main thread clones it. Pass the
 * `layoutVersion` of the last snapshot sent to leave out the map layers when they are unchanged.
 */
export function siteSnapshot(world: WorldState, sentVersion?: number): SiteSnapshot {
  const active = world.activeSite;
  if (!active) throw new Error('No watched site.');
  const people: [Id, PersonDetail][] = [];
  const skills: [Id, Record<string, number>][] = [];
  for (const id of active.residents) {
    const person = world.people.get(id);
    if (!person?.detail) continue;
    people.push([id, person.detail]);
    skills.push([id, person.skills]);
  }
  const snapshot: SiteSnapshot = {
    day: world.day,
    block: active.block,
    stock: [...active.stock],
    storesEmptyEvent: active.storesEmptyEvent,
    people,
    skills,
    buildings: [...active.buildings.values()],
    homes: [...active.households.values()].map((h) => [h.id, h.home]),
    layoutVersion: active.layoutVersion,
    stewardFocus: active.stewardFocus,
    items: active.itemsAtEntry.map(([id]) => [id, world.items.get(id)?.holder ?? null]),
  };
  if (sentVersion !== active.layoutVersion) {
    const { terrain, tree, building, bridges } = active.map;
    snapshot.map = { terrain, tree, building, bridges };
  }
  return snapshot;
}

/** Copies a snapshot into a world copy (the main thread's mirror). */
export function applySiteSnapshot(world: WorldState, snapshot: SiteSnapshot): void {
  const active = world.activeSite;
  if (!active) throw new Error('No watched site.');
  world.day = snapshot.day;
  active.block = snapshot.block;
  active.stock = new Map(snapshot.stock);
  active.storesEmptyEvent = snapshot.storesEmptyEvent;
  for (const [id, detail] of snapshot.people) {
    const person = world.people.get(id);
    if (person) person.detail = detail;
  }
  for (const [id, skills] of snapshot.skills) {
    const person = world.people.get(id);
    if (person) person.skills = skills;
  }
  active.buildings = new Map(snapshot.buildings.map((b) => [b.id, b]));
  for (const [id, home] of snapshot.homes) {
    const household = active.households.get(id);
    if (household) household.home = home;
  }
  active.layoutVersion = snapshot.layoutVersion;
  active.stewardFocus = snapshot.stewardFocus;
  for (const [id, holder] of snapshot.items) {
    const item = world.items.get(id);
    if (item) item.holder = holder;
  }
  if (snapshot.map) {
    const { terrain, tree, building, bridges } = snapshot.map;
    Object.assign(active.map, { terrain, tree, building, bridges });
  }
}
