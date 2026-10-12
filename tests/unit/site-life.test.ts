import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  embark,
  findRoute,
  foodDaysLeft,
  generateWorld,
  memoryMood,
  nodesExpanded,
  sitePopulation,
  stepBlock,
  stepSite,
  straightLine,
  type ActiveSite,
  type SimEvent,
  type Site,
  type WorldState,
} from '../../src/engine';

const C = DEFAULT_CONTENT;
const LIFE = C.life;
const BREAKDOWNS = new Set([
  LIFE.events.tantrum,
  LIFE.events.despair,
  LIFE.events.wandering,
  LIFE.events.theft,
]);

let shared: WorldState | undefined;
const base = () => (shared ??= generateWorld('SITE-A', { width: 64, height: 64 }, C));
const copy = () => structuredClone(base());
const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;

/** Days until the first breakdown event (or `days` if none), and the events seen. */
function runUntilBreakdown(world: WorldState, days: number) {
  const events: SimEvent[] = [];
  for (let d = 0; d < days; d += 1) {
    const today = stepSite(world, C);
    events.push(...today);
    if (today.some((e) => BREAKDOWNS.has(e.type))) return { day: d + 1, events };
  }
  return { day: days, events };
}

describe('daily life', () => {
  it('gives every resident one or two traits and a full set of needs', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    for (const id of active.residents) {
      const p = world.people.get(id)!;
      expect(p.traits.length).toBeGreaterThanOrEqual(1);
      expect(p.traits.length).toBeLessThanOrEqual(2);
      expect(new Set(p.traits).size).toBe(p.traits.length);
      expect(p.detail!.needs.food).toBe(100);
    }
  });

  it('breaks the starving down within two months while the fed hold', () => {
    const fed = copy();
    const hungry = copy();
    const site = biggest(fed);
    const a = embark(fed, C, site.id);
    const b = embark(hungry, C, site.id);
    a.stock.set('food', 1e6);
    b.stock.set('food', 0);
    // No harvest either: without fields, work brings nothing in.
    for (const [id, building] of b.buildings)
      if (building.defId === 'field') b.buildings.delete(id);
    const starved = runUntilBreakdown(hungry, 60);
    expect(starved.events.some((e) => BREAKDOWNS.has(e.type))).toBe(true);
    // Over the same days the fed site has no more breakdowns than the starving one.
    const eaten = runUntilBreakdown(fed, starved.day);
    const count = (events: SimEvent[]) => events.filter((e) => BREAKDOWNS.has(e.type)).length;
    expect(count(eaten.events)).toBeLessThanOrEqual(count(starved.events));
    const empty = starved.events.find((e) => e.type === LIFE.events.storesEmpty)!;
    expect(empty).toBeDefined();
    expect(b.storesEmptyEvent).toBe(empty.id);
    expect(foodDaysLeft(hungry, C)).toBeLessThan(1);
    const caused = starved.events.find((e) => BREAKDOWNS.has(e.type))!;
    expect(caused.causes.length).toBeGreaterThan(0);
  });

  it('carries small children with a household adult and keeps every need recoverable', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    for (let d = 0; d < 60; d += 1) {
      stepSite(world, C);
      stepBlock(world, C); // stop at varied blocks: night, morning, afternoon, evening
    }
    for (const id of active.residents) {
      const detail = world.people.get(id)!.detail!;
      if (detail.with !== undefined) {
        const carer = world.people.get(detail.with)!.detail!;
        expect(world.params.historyYears - world.people.get(id)!.born).toBeLessThan(
          LIFE.carriedUnder,
        );
        if (carer.activity !== 'wander') expect(detail.pos).toEqual(carer.pos);
      }
      // A fed, housed site pins no need at zero.
      for (const value of Object.values(detail.needs)) expect(value).toBeGreaterThan(0);
    }
  });

  it('fades memories linearly and drops them when they expire', () => {
    const memory = { moodDelta: -8, createdDay: 10, decayDays: 4 };
    expect(memoryMood(memory, 10)).toBe(-8);
    expect(memoryMood(memory, 12)).toBe(-4);
    expect(memoryMood(memory, 14)).toBe(0);
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const person = world.people.get(active.residents[0]!)!;
    person.detail!.memories.push({
      type: 'saw-tantrum',
      moodDelta: -8,
      createdDay: world.day,
      decayDays: 4,
    });
    for (let d = 0; d < 3; d += 1) stepSite(world, C);
    expect(person.detail!.memories.some((m) => m.type === 'saw-tantrum')).toBe(true);
    // Day 4 after creation is the first block that sees it expired.
    stepSite(world, C);
    stepSite(world, C);
    expect(person.detail!.memories.some((m) => m.type === 'saw-tantrum')).toBe(false);
  });

  it('is the same for the same seed', () => {
    const run = () => {
      const world = copy();
      const active = embark(world, C, biggest(world).id);
      for (let d = 0; d < 20; d += 1) stepSite(world, C);
      return JSON.stringify([
        world.events,
        active.residents.map((id) => {
          const { relationships, ...rest } = world.people.get(id)!.detail!;
          return [rest, relationships.size];
        }),
      ]);
    };
    expect(run()).toBe(run());
  });

  it('advances the day after four blocks', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const day = world.day;
    for (let b = 0; b < 3; b += 1) stepBlock(world, C);
    expect(active.block).toBe(3);
    expect(world.day).toBe(day);
    stepBlock(world, C);
    expect([world.day, active.block]).toEqual([day + 1, 0]);
  });
});

describe('walking', () => {
  it('finds a route that keeps off water and walls, and respects the budget', () => {
    const world = copy();
    const active: ActiveSite = embark(world, C, biggest(world).id);
    const width = active.map.width;
    const home = [...active.buildings.values()].find((b) => b.defId === 'home' && b.followed)!;
    const from = (home.y + 1) * width + home.x + 1;
    const to = active.origin[1] * width + active.origin[0];
    const route = findRoute(active, C.site, LIFE, from, to, { left: 1e6 })!;
    expect(route[route.length - 1]).toBe(to);
    const bridges = new Set(active.map.bridges);
    for (const k of route) {
      expect(active.map.water[k] === 0 || bridges.has(k)).toBe(true);
      // The only wall tile a route may use is the door of the building it leaves.
      if (C.site.terrains[active.map.terrain[k]!]!.id === 'wall') {
        expect(active.map.building[k]).toBe(home.id);
      }
    }
    const before = nodesExpanded(active);
    expect(nodesExpanded(active)).toBeGreaterThan(0);

    const tiny = { left: 5 };
    const other = to + 2 * width + 3;
    const line = findRoute(active, C.site, LIFE, other, from, tiny)!;
    expect(nodesExpanded(active) - before).toBeLessThanOrEqual(5);
    expect(tiny.left).toBe(0);
    expect(line).toEqual(straightLine(width, other, from));
  });
});

describe('speed', () => {
  it('steps 150 residents through a year', () => {
    const world = copy();
    const content = { ...C, site: { ...C.site, followCap: 150 } };
    embark(world, content, biggest(world).id);
    const start = performance.now();
    for (let d = 0; d < 336; d += 1) stepSite(world, content);
    const ms = performance.now() - start;
    console.log(`life: 336 days in ${ms.toFixed(0)} ms (${(336000 / ms).toFixed(0)} days/s)`);
    expect(ms).toBeLessThan(1000);
  });
});
