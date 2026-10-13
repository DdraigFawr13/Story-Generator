import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  dailyCrops,
  embark,
  foodMeals,
  planMeals,
  siteCodes,
  spoilStock,
  spreadFire,
  stepSite,
  voiceOf,
  type ActiveSite,
  type Building,
} from '../../src/engine';
import { base, biggest } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
const DAYS = 336;

function fresh() {
  const world = structuredClone(base());
  const active = embark(world, C, biggest(world).id);
  return { world, active, voice: voiceOf(world, C, active) };
}
const fieldsOf = (active: ActiveSite): Building[] =>
  [...active.buildings.values()].filter((b) => b.crop && b.followed);

describe('crops and frost', () => {
  it('a hard frost ruins a ripe field that is still standing', () => {
    const { world, active, voice } = fresh();
    const field = fieldsOf(active)[0]!;
    field.crop!.stage = 'ripe';
    field.crop!.growth = 1;
    field.crop!.left = 1;
    active.weather.lowC = -30;
    world.day = DAYS * 3 + 5 * 28 + 3;
    const before = world.events.length;
    dailyCrops(world, C, active, voice.emit, voice.label);
    expect(field.crop!.stage).toBe('ruined');
    expect(field.crop!.left).toBe(0);
    expect(world.events.slice(before).some((e) => e.type === C.environment.events.frostField)).toBe(
      true,
    );
  });

  it('a light night leaves ripe grain standing', () => {
    const { world, active, voice } = fresh();
    const field = fieldsOf(active)[0]!;
    field.crop!.stage = 'ripe';
    field.crop!.growth = 1;
    field.crop!.left = 1;
    active.weather.lowC = 8;
    world.day = DAYS * 3 + 5 * 28 + 3;
    dailyCrops(world, C, active, voice.emit, voice.label);
    expect(field.crop!.stage).toBe('ripe');
  });
});

describe('spoilage', () => {
  it('preserved food outlasts fresh food', () => {
    const { active } = fresh();
    active.stock.clear();
    active.stock.set('fish', 1000);
    active.stock.set('berries', 1000);
    active.stock.set('preserved', 1000);
    for (let d = 0; d < 56; d += 1) spoilStock(active, C, 12);
    const left = (id: string) => active.stock.get(id) ?? 0;
    expect(left('preserved')).toBeGreaterThan(left('berries'));
    expect(left('preserved')).toBeGreaterThan(900);
  });
});

describe('short meals', () => {
  const plan = (month: number, stockFood: number) => {
    const { world, active, voice } = fresh();
    active.stock.clear();
    active.stock.set('grain', stockFood);
    world.day = DAYS * 3 + month * 28;
    planMeals(world, C, active, voice.emit, voice.label);
    return active.mealShare;
  };

  it('meals are cut when the stores will not reach the harvest', () => {
    expect(plan(1, 50)).toBeLessThan(1);
  });
  it('meals stay full when the stores are ample', () => {
    expect(plan(1, 5_000_000)).toBe(1);
  });
  it('meals are never cut in the harvest months', () => {
    expect(plan(4, 50)).toBe(1);
    expect(plan(5, 50)).toBe(1);
  });
});

describe('fire', () => {
  it('stops: it burns out, and never crosses water or bare rock', () => {
    const { world, active, voice } = fresh();
    const code = siteCodes(C.site);
    const { map } = active;
    // A bare grass tile with no water, building or tree on it.
    let start = -1;
    for (let k = 0; k < map.terrain.length && start < 0; k += 1) {
      if (
        map.terrain[k] === code.grass &&
        map.water[k] === 0 &&
        map.building[k] === 0 &&
        map.tree[k] === 0
      ) {
        start = k;
      }
    }
    expect(start).toBeGreaterThanOrEqual(0);
    active.fire = {
      tiles: new Map([[start, 3]]),
      startedEvent: 0,
      cause: 'test',
      home: null,
      hits: new Map(),
      trees: 0,
      crops: 0,
      start,
      done: [],
      water: false,
      homes: [],
    };
    active.weather.dryDays = 30;
    const seen = new Set<number>([start]);
    for (let block = 0; block < 400 && active.fire; block += 1) {
      spreadFire(world, C, active, voice.emit, voice.label, []);
      for (const t of active.fire?.tiles.keys() ?? []) seen.add(t);
      for (const t of active.fire?.done ?? []) seen.add(t);
    }
    expect(active.fire).toBeNull();
    for (const t of seen) {
      expect(map.water[t]).toBe(0);
      expect(map.terrain[t] === code.rock && map.building[t] === 0 && map.tree[t] === 0).toBe(
        false,
      );
    }
  });
});

describe('a normal year at a site', () => {
  it('keeps the store, harvests near the target and cuts no meals; the run is repeatable', () => {
    const run = () => {
      const { world, active } = fresh();
      const start = foodMeals(active, C);
      for (let d = 0; d < DAYS; d += 1) stepSite(world, C);
      return {
        ratio: foodMeals(active, C) / start,
        share: active.mealShare,
        spoiled: Math.round(active.spoiled.total),
        harvest: Math.round(active.harvest.cut),
        events: world.events.length,
      };
    };
    const a = run();
    expect(a.share).toBe(1);
    expect(a.ratio).toBeGreaterThan(0.6);
    expect(run()).toEqual(a);
  });
});
