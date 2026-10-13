import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { generateWorld, type SimEvent, type WorldState } from '../../src/engine';

/** Frequent deeds on a 64x64 world; the seed was picked because every deed type occurs in it (re-picked when history changes). */
const rules = DEFAULT_CONTENT.notables.deeds;
const FREQUENT = {
  ...DEFAULT_CONTENT,
  notables: {
    ...DEFAULT_CONTENT.notables,
    legendChance: 1,
    deeds: {
      ...rules,
      championPower: 7,
      huntIdleYears: 1,
      vengeanceChance: 1,
      legendFounds: 1,
    },
  },
};
const LEGEND_POWER = 17;

// Compact continents (2026-10-13) moved DH-285's legend_founded (and spell_cast); DH-234 has every deed.
let shared: WorldState | undefined;
const world = () =>
  (shared ??= generateWorld('DH-234', { width: 64, height: 64, historyYears: 250 }, FREQUENT));
const ofType = (type: string) => world().events.filter((e) => e.type === type);
const cause = (e: SimEvent, type: string) =>
  e.causes.map((id) => world().events.find((x) => x.id === id)).find((c) => c?.type === type);

describe('legend deeds', () => {
  it('happen at least once each in the fixture world', () => {
    for (const type of [
      'champion_fought',
      'vengeance_raid',
      'legend_founded',
      'beast_hunt_failed',
      'spell_cast',
      'college_founded',
    ]) {
      expect(ofType(type).length, type).toBeGreaterThan(0);
    }
  });

  it('send only powerful champions, in a battle at the same place', () => {
    for (const e of ofType('champion_fought')) {
      expect(world().people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(7);
      expect(cause(e, 'battle')?.data.site).toBe(e.data.site);
    }
  });

  it('ride for vengeance once, against a sworn enemy, after an oath', () => {
    const riders = new Set<number>();
    for (const e of ofType('vengeance_raid')) {
      const [avenger, enemy] = e.actors;
      expect(world().people.get(avenger!)!.enemies).toContain(enemy);
      for (const id of e.actors.filter((a) => a !== enemy)) {
        expect(riders.has(id)).toBe(false);
        riders.add(id);
      }
      expect(cause(e, 'oath_sworn')?.actors).toEqual([avenger, enemy]);
    }
  });

  it('have legends found sites after a founding with no made-up founder', () => {
    for (const e of ofType('legend_founded')) {
      expect(world().people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      const founding = cause(e, 'site_founded');
      expect(founding?.actors).toEqual([]);
      expect(founding?.data.site).toBe(e.data.site);
    }
  });

  it('send only legends on failed hunts', () => {
    for (const e of ofType('beast_hunt_failed')) {
      expect(world().people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
    }
  });

  it('bury those killed in battle at the battlefield', () => {
    for (const e of ofType('notable_died')) {
      if (!String(e.data.cause).startsWith('in battle')) continue;
      const fight = cause(e, 'battle') ?? cause(e, 'champion_fought');
      if (fight) expect(e.data.site).toBe(fight.data.site);
    }
  });

  it('give every legend the fame of one', () => {
    for (const e of ofType('legend_risen')) {
      expect(world().people.get(e.actors[0]!)!.fame).toBeGreaterThanOrEqual(
        DEFAULT_CONTENT.notables.fame.legend,
      );
    }
  });
});
