import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  canDo,
  effectivePower,
  embark,
  foodMeals,
  generateWorld,
  goodAmount,
  GOODS,
  heldItems,
  leaveSite,
  applySiteSnapshot,
  siteSnapshot,
  siteWorkplaces,
  skillCap,
  stepBlock,
  stepSite,
  type HeldItem,
  type Person,
  type WorldState,
} from '../../src/engine';
import { biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
const ST = C.steward;

/** A world whose biggest site is not already at the food-worker ceiling when fed (SITE-C since
 * peoples settle closer on a quarter-land map: SITE-B's biggest town is at the ceiling). */
let shortBase: WorldState | undefined;
const shortCopy = () =>
  structuredClone((shortBase ??= generateWorld('SITE-C', { width: 64, height: 64 }, C)));
const bandOf = (world: WorldState, p: Person) => {
  const race = C.races.find((r) => r.id === p.raceId)!;
  const age = world.params.historyYears - p.born;
  return age < race.maturityYears
    ? 'child'
    : age < Math.round(race.lifespanYears * 0.7)
      ? 'adult'
      : 'elder';
};

describe('work', () => {
  it('gives no one a job they cannot do, and no elder or child a heavy or any job', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const places = siteWorkplaces(C, active);
    for (let d = 0; d < 30; d += 1) {
      stepSite(world, C);
      for (const id of active.residents) {
        const p = world.people.get(id)!;
        const jobId = p.detail!.jobId;
        if (jobId === undefined) continue;
        const job = C.jobs.find((j) => j.id === jobId)!;
        const band = bandOf(world, p);
        expect(band).not.toBe('child');
        if (band === 'elder') expect(job.heavy).toBeFalsy();
        expect(canDo(p, job, band, { held: heldItems(world, C, id) })).toBe(true);
        expect(places.size).toBeGreaterThan(0);
      }
    }
  });

  it('never lets a stock count go negative', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    for (let d = 0; d < 60; d += 1) {
      stepSite(world, C);
      for (const n of active.stock.values()) expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('puts more people on food when the stores run short', () => {
    const fed = shortCopy();
    const short = shortCopy();
    const site = biggest(fed);
    const a = embark(fed, C, site.id);
    const b = embark(short, C, site.id);
    const need = a.residents.length * 2;
    // The fed town gets a year of grain whatever its history left it; the short one two days.
    for (const item of C.items) {
      if (item.kind !== 'food') continue;
      a.stock.set(item.id, item.id === 'grain' ? need * 168 : 0);
      b.stock.set(item.id, item.id === 'grain' ? need : 0);
    }
    stepBlock(fed, C);
    stepBlock(short, C);
    const onFood = (w: WorldState, s: typeof a) =>
      s.residents.filter((id) => {
        const j = C.jobs.find((x) => x.id === w.people.get(id)!.detail!.jobId);
        return j?.serves === 'food';
      }).length;
    expect(foodMeals(b, C)).toBeLessThan(foodMeals(a, C));
    expect(onFood(short, b)).toBeGreaterThan(onFood(fed, a));
  });

  it('grows skill by doing and stops at the cap', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const farm = C.jobs.find((j) => j.id === ST.roles.farm)!;
    const ability = C.abilities.find((x) => x.id === farm.skill)!;
    const person = active.residents
      .map((id) => world.people.get(id)!)
      .find((p) => bandOf(world, p) === 'adult')!;
    person.skills[farm.skill!] = 0;
    for (const id of active.residents) {
      if (id !== person.id) world.people.get(id)!.skills = {};
    }
    // Only this person farms: others have no jobs to teach or crowd with.
    const cap = skillCap(person, ability);
    let last = 0;
    for (let d = 0; d < 400; d += 1) {
      person.detail!.jobId = farm.id;
      stepBlock(world, C);
      person.detail!.jobId = farm.id;
      stepBlock(world, C);
      stepBlock(world, C);
      stepBlock(world, C);
      const s = person.skills[farm.skill!] ?? 0;
      expect(s).toBeLessThanOrEqual(cap + 1e-9);
      last = s;
    }
    expect(last).toBeGreaterThan(0);
  });

  it('caps item power one tier above the holder', () => {
    const ring: HeldItem = {
      item: {
        id: 1,
        kind: 'artifact',
        name: 'r',
        form: 'ring',
        made: 0,
        makerId: null,
        holder: 1,
        deeds: [],
      },
      def: C.items.find((i) => i.id === 'ring')!,
    };
    const at = (power: number, bonus: number) =>
      effectivePower({ magic: { power, affinities: {} } }, [
        { ...ring, def: { ...ring.def, effects: [{ kind: 'power', bonus }] } },
      ]);
    expect(at(0, 3)).toBe(2);
    expect(at(5, 10)).toBe(12);
    expect(at(19, 3)).toBe(20);
  });

  it('turns a changed stock into a matching goods change on leaving', () => {
    const world = copy();
    const site = biggest(world);
    const before = { ...site.goods };
    const active = embark(world, C, site.id);
    const start = Object.fromEntries(GOODS.map((g) => [g, goodAmount(active, C, g)]));
    for (let d = 0; d < 30; d += 1) stepSite(world, C);
    const now = Object.fromEntries(GOODS.map((g) => [g, goodAmount(active, C, g)]));
    leaveSite(world, C);
    for (const g of GOODS) {
      const expected = Math.max(0, before[g] + now[g]! - start[g]!);
      expect(site.goods[g]).toBeCloseTo(expected, 9);
    }
  });

  it('is the same for the same seed', () => {
    const run = () => {
      const world = copy();
      const active = embark(world, C, biggest(world).id);
      for (let d = 0; d < 20; d += 1) stepSite(world, C);
      return JSON.stringify([
        [...active.stock],
        active.residents.map((id) => world.people.get(id)!.detail!.jobId ?? null),
      ]);
    };
    expect(run()).toBe(run());
  });

  it('sends the map layers only when the layout version moved, and the steward focus always', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const mirror = structuredClone(world);
    const first = siteSnapshot(world, active.layoutVersion);
    expect(first.map).toBeUndefined();
    expect(first.stewardFocus).toBe(active.stewardFocus);
    active.layoutVersion += 1;
    const next = siteSnapshot(world, active.layoutVersion - 1);
    expect(next.map).toBeDefined();
    applySiteSnapshot(mirror, next);
    expect(mirror.activeSite!.layoutVersion).toBe(active.layoutVersion);
    expect(mirror.activeSite!.map.building).toEqual(active.map.building);
  });
});
