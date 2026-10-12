// Daily life (M3.2, REBOOT_PLAN §6A): four blocks a day. Each block every resident picks an
// activity from the schedule (or a running breakdown), walks toward its place, satisfies and
// loses needs, and sums mood from low needs, memories and traits. Stress builds under bad mood
// and breaks out by trait: tantrum, despair, wandering or theft, which witnesses remember.
//
// A block runs in passes, each over residents in id order: (0) breakdowns end or begin, from the
// stress left at the end of the last block, so a breakdown acts in the block it starts; (1)
// activity, destination and walking; (2) needs, meals, work, memories, mood and stress.

import { DAYS_PER_YEAR, MONTHS_PER_YEAR, dateOf } from '../core/clock';
import { createEmitter, type EmitInput } from '../core/context';
import {
  DAY_BLOCKS,
  type Activity,
  type BreakdownKind,
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
import { bandOfAge, type SiteContent } from './defs';
import { findRoute, tileCost } from './path';

type Band = 'child' | 'adult' | 'elder';

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
  green: number;
  field: number;
  shrine: number;
  stockpile: number;
  wander: number;
  /** This block: where they stand after walking. */
  tile: number;
  placeId: Id | null;
  band: Band;
  ate: boolean;
}

/** Lookups derived once per watched site; never saved (they rebuild from the state). */
interface SiteCache {
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
  /** Food one average resident eats at a meal. */
  meal: number;
  /** Food one full work block in a field brings in (placeholder until M3.3 jobs). */
  workYield: number;
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

/** Days the stores feed the followed residents at one meal a day; Infinity when nobody eats. */
export function foodDaysLeft(world: WorldState, content: SiteContent): number {
  const active = world.activeSite;
  if (!active) return Infinity;
  const races = new Map(content.races.map((r) => [r.id, r]));
  let perDay = 0;
  for (const id of active.residents) {
    const person = world.people.get(id);
    const race = person && races.get(person.raceId);
    if (race) perDay += race.foodNeed * content.life.mealShare;
  }
  return perDay > 0 ? (active.stock.get('food') ?? 0) / perDay : Infinity;
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
  const centreOf = (b: Building): [number, number] => [b.x + (b.w >> 1), b.y + (b.h >> 1)];
  const cellOf = (b: Building | undefined, id: number, salt: number) =>
    b ? b.cells[mix(id, salt) % b.cells.length]! : -1;
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
      green,
      field: field ? cellOf(field, id, 4) : cellOf(stockpile, id, 5),
      shrine: shrine ? cellOf(shrine, id, 6) : green,
      stockpile: stockpile ? cellOf(stockpile, id, 7) : green,
      wander: wander < 0 ? green : wander,
      tile: 0,
      placeId: null,
      band: 'adult',
      ate: false,
    });
  }
  let meal = 0;
  for (const p of profiles) meal += p.race.foodNeed * life.mealShare;
  // Until M3.3 brings jobs, the fields bring in what history's harvest would in a normal year
  // (harvest.ts: min(pop × workerOutput, capacity) × need / pop), for the followed share, spread
  // over the work blocks the schedule expects in a year, weighted by age band.
  let need = 0;
  let pop = 0;
  for (const b of site?.pop ?? []) {
    pop += b.count;
    need += b.count * (races.get(b.raceId)?.foodNeed ?? 1);
  }
  const harvest =
    pop > 0 && site
      ? ((Math.min(pop * content.history.workerOutput, site.capacity) * need) / pop) * active.share
      : 0;
  let blocksPerYear = 0;
  for (const p of profiles) {
    const band = bandOfAge(p.race, world.params.historyYears - p.person.born);
    for (const block of DAY_BLOCKS) {
      if (life.schedule[band][block] !== 'work') continue;
      // Rest days turn the afternoon to worship or company.
      const days =
        block === 'afternoon' ? DAYS_PER_YEAR * (1 - 1 / life.restDayEvery) : DAYS_PER_YEAR;
      blocksPerYear += days * life.workOutput[band];
    }
  }
  return {
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
    workYield: blocksPerYear > 0 ? harvest / blocksPerYear : 0,
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

/** Runs one block of the watched site. After the evening block the day advances. */
export function stepBlock(world: WorldState, content: SiteContent): SimEvent[] {
  const active = world.activeSite;
  if (!active) throw new Error('No watched site.');
  const cache = caches.get(active) ?? buildCache(world, content, active);
  caches.set(active, cache);
  const { life, site: rules } = content;
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
    const foodMeal = p.race.foodNeed * life.mealShare;
    // With the stores too thin to steal from, a thief just rages.
    if (kind === 'theft' && (active.stock.get('food') ?? 0) < life.theftMeals * foodMeal) {
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
    const event = emit(life.events[kind], p, [...causes]);
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

  // Pass 0: breakdowns end or begin.
  for (const p of profiles) {
    const detail = p.person.detail!;
    p.band = bandOfAge(p.race, history - p.person.born + yearsIn);
    const running = detail.breakdown;
    if (
      running &&
      running.untilDay <= day &&
      running.kind !== 'tantrum' &&
      running.kind !== 'theft'
    ) {
      delete detail.breakdown;
      // Despair just lifts; a wanderer is back, which is news.
      if (running.kind === 'wandering') emit(life.events.returned, p, [running.eventId]);
    }
    if (detail.breakdown || detail.stress < life.breakdownAt * p.breakdownMul) continue;
    startBreakdown(p);
  }

  // Pass 1: activity, destination, walking.
  const budget = { left: life.pathBudget };
  cache.inside.fill(0);
  for (const p of profiles) {
    const detail = p.person.detail!;
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
    const from = tileOf(detail, width);
    const to =
      activity === 'tantrum'
        ? from
        : activity === 'sleep' || activity === 'eat' || activity === 'despair'
          ? p.home
          : activity === 'work'
            ? p.field
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
      let spent = 0;
      for (const step of route ?? []) {
        const cost = Math.max(1, tileCost(active, rules, life, step));
        if (spent + cost > life.walkPerBlock) break;
        spent += cost;
        tile = step;
      }
      if (tile !== from) detail.pos = [tile % width, Math.floor(tile / width)];
    }
    const building = active.map.building[tile]!;
    p.tile = tile;
    p.placeId = building === 0 ? null : building;
    detail.placeId = p.placeId;
    if (p.placeId === null) cache.outdoors[tile]! += 1;
    else cache.inside[p.placeId]! += 1;
  }

  // Pass 2: needs, meals, work, memories, mood, stress.
  cache.ateIn.fill(0);
  const temperature = siteTemperature(world, content, day);
  const coldLoss =
    clamp((life.warmth.comfortC - temperature) * life.warmth.perDegree, 0, life.warmth.maxPerDay) /
    BLOCKS;
  const food = (): number => active.stock.get('food') ?? 0;
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
    const meal = p.race.foodNeed * life.mealShare;
    let fed = false;
    if (activity === 'eat') {
      if (food() >= meal) {
        active.stock.set('food', food() - meal);
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
      const take = Math.min(food(), life.theftMeals * meal);
      active.stock.set('food', food() - take);
      fed = true;
      checkStores();
    } else if (activity === 'work' && p.placeId !== null) {
      // Placeholder until M3.3 jobs: a block in a field brings in its share of the harvest.
      if (active.buildings.get(p.placeId)?.defId === 'field') {
        active.stock.set('food', food() + cache.workYield * life.workOutput[p.band]);
      }
    }
    for (let j = 0; j < content.needs.length; j += 1) {
      const need = content.needs[j]!;
      let value = needs[need.id];
      if (value === undefined) continue;
      // Warmth is the one need whose decay follows the day's temperature.
      const decay = need.id === 'warmth' ? coldLoss : need.decayPerDay / BLOCKS;
      value -= decay * p.rates[j]!;
      const restore = need.restore[activity];
      if (restore !== undefined && (need.id !== 'food' || fed)) {
        if (!need.needsCompany || hasCompany(p)) value += restore * (atHome ? 1 : need.awayShare);
      }
      needs[need.id] = clamp(value, 0, 100);
    }
    if (activity === 'sleep' && !atHome) add(p, life.memoryOf.sleptRough);
    if (activity === 'worship') add(p, life.memoryOf.worshipped);
  }
  for (const p of profiles) {
    const detail = p.person.detail!;
    if (p.ate && p.placeId !== null && cache.ateIn[p.placeId]! > 1) {
      add(p, life.memoryOf.ateTogether);
    }
    p.ate = false;
    // Memories fade; the gone ones are dropped before the sum.
    detail.memories = detail.memories.filter((m) => day - m.createdDay < m.decayDays);
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
    if (bd && (bd.kind === 'tantrum' || bd.kind === 'theft')) delete detail.breakdown;
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

/** What the main thread needs after each tick to mirror the running site (M3.1 loose end). */
export interface SiteSnapshot {
  day: number;
  block: number;
  stock: [string, number][];
  storesEmptyEvent: Id | null;
  people: [Id, PersonDetail][];
}

/** The snapshot holds references; posting it to the main thread clones it. */
export function siteSnapshot(world: WorldState): SiteSnapshot {
  const active = world.activeSite;
  if (!active) throw new Error('No watched site.');
  const people: [Id, PersonDetail][] = [];
  for (const id of active.residents) {
    const detail = world.people.get(id)?.detail;
    if (detail) people.push([id, detail]);
  }
  return {
    day: world.day,
    block: active.block,
    stock: [...active.stock],
    storesEmptyEvent: active.storesEmptyEvent,
    people,
  };
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
}
