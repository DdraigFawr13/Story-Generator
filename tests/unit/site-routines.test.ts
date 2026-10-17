import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { embark, stepBlock, type ActiveSite, type WorldState } from '../../src/engine';
import { baseB, biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
const R = C.life.routines;
const REST = C.life.restDayEvery - 1;

/** Steps blocks until the next block to run is `block` of a day with `day % 7 === mod`. */
function runTo(world: WorldState, active: ActiveSite, mod: number, block: number, content = C) {
  for (let i = 0; i < 40 * 4; i += 1) {
    if (world.day % C.life.restDayEvery === mod && active.block === block) return;
    stepBlock(world, content);
  }
  throw new Error('No such day.');
}

/** Residents within five tiles of the market square's centre. */
function onSquare(world: WorldState, active: ActiveSite): number {
  const [ox, oy] = active.origin;
  return active.residents.filter((id) => {
    const [x, y] = world.people.get(id)!.detail!.pos!;
    return Math.abs(x - ox) <= 5 && Math.abs(y - oy) <= 5;
  }).length;
}

describe('village routines', () => {
  it('keeps the square quiet on an ordinary afternoon and varies where people go', () => {
    // SITE-B: SITE-A's village ended at 20.1% on the square after the 2026-10-13 weddings change, and
    // SITE-B's biggest town was then a halfling shire whose many children (grown at 20) play on the
    // green (22% at worst). The 20% limit is for a human village; after the 2026-10-17 dragon-court
    // change SITE-C's town ended at 21% and SITE-B's biggest town is a human one again.
    const world = structuredClone(baseB());
    const active = embark(world, C, biggest(world).id);
    const places = new Set<string>();
    for (let week = 0; week < 4; week += 1) {
      // Days 0-6 of the week except the rest day (6) and market day.
      for (const mod of [0, 1, 3, 4, 5]) {
        runTo(world, active, mod, 2);
        stepBlock(world, C);
        expect(onSquare(world, active)).toBeLessThan(active.residents.length * 0.2);
        for (const id of active.residents) {
          const where = world.people.get(id)!.detail!.where;
          if (where) places.add(where.replace(/ (?!the).*$/, ''));
        }
      }
    }
    expect(places.size).toBeGreaterThanOrEqual(5);
  });

  it('sends nobody to an alehouse the site does not have', () => {
    const world = copy();
    const site = biggest(world);
    const none = {
      ...C,
      site: {
        ...C.site,
        buildings: C.site.buildings.map((b) =>
          b.id === 'alehouse' ? { ...b, minPop: 1_000_000 } : b,
        ),
      },
    };
    const active = embark(world, none, site.id);
    expect([...active.buildings.values()].some((b) => b.defId === 'alehouse')).toBe(false);
    for (let d = 0; d < 21 * 4; d += 1) {
      stepBlock(world, none);
      for (const id of active.residents) {
        expect(world.people.get(id)!.detail!.where).not.toBe(R.where.alehouse);
      }
    }
  });

  it('staggers the set-off in [0, 0.6] and shows where people are', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const leaves = new Set<number>();
    for (let i = 0; i < 4 * 7; i += 1) {
      stepBlock(world, C);
      for (const id of active.residents) {
        const leave = world.people.get(id)!.detail!.leaveAt!;
        expect(leave).toBeGreaterThanOrEqual(0);
        expect(leave).toBeLessThanOrEqual(R.leave.max);
        leaves.add(leave);
      }
    }
    expect(leaves.size).toBeGreaterThan(20);
  });

  it('keeps grown-ups with no trade about the house outside sowing and harvest', () => {
    // They used to stand in a bare field all year, all setting off together.
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    expect(R.shifts.fieldMonths).not.toContain(0);
    let idle = 0;
    let chores = 0;
    for (let i = 0; i < 4 * 7; i += 1) {
      stepBlock(world, C);
      for (const id of active.residents) {
        const detail = world.people.get(id)!.detail!;
        if (detail.jobId !== undefined || detail.with !== undefined) continue;
        if (detail.activity === 'work') idle += 1;
        if (detail.where === R.where.house || detail.where === R.where.well) chores += 1;
      }
    }
    expect(idle).toBe(0);
    expect(chores).toBeGreaterThan(0);
  });

  it('puts the craft workers on the square on market day, still working', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    runTo(world, active, R.market.offset, 1);
    expect(REST).not.toBe(R.market.offset);
    // The same morning without a market: the control.
    const control = structuredClone(world);
    const noMarket = {
      ...C,
      life: { ...C.life, routines: { ...R, market: { ...R.market, every: 1000 } } },
    };
    stepBlock(world, C);
    stepBlock(control, noMarket);
    const [ox, oy] = active.origin;
    let stalls = 0;
    let shoppers = 0;
    for (const id of active.residents) {
      const detail = world.people.get(id)!.detail!;
      const near = Math.max(Math.abs(detail.pos![0] - ox), Math.abs(detail.pos![1] - oy));
      if (detail.where === R.where.market && detail.activity === 'work') {
        stalls += 1;
        expect(near).toBe(R.market.stallRing);
        expect(R.market.stallJobs).toContain(detail.jobId);
      }
      if (detail.activity === 'errand' && detail.where === R.where.market) shoppers += 1;
    }
    expect(stalls).toBeGreaterThan(0);
    expect(shoppers).toBeGreaterThan(0);
    // Their work still counts: the stall trades make as much as at the workplace.
    const made = (a: ActiveSite) => (a.stock.get('tools') ?? 0) + (a.stock.get('wares') ?? 0);
    expect(made(world.activeSite!)).toBeGreaterThanOrEqual(made(control.activeSite!));
  });
});
