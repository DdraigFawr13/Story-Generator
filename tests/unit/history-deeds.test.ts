import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent, type WorldState } from '../../src/engine';

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
      feudChance: 1,
    },
  },
};
const LEGEND_POWER = 17;

// Compact continents (2026-10-13) moved DH-285's legend_founded (and spell_cast); DH-234 had every
// deed until roaming beasts (2026-10-13) moved its legend_founded; DH-338 had every deed until more
// land and free cities (2026-10-13) moved its legend_founded and spell_cast; DH-105 had every deed
// until legends as champions (2026-10-14) moved its spell_cast; DH-34 had every deed, a legend duel
// and a broken host until dragons (M5.6) moved its legend_duel; re-pinned for M5.6 dragons: history drift; DH-3 had every deed until mountain holds (2026-10-14) moved its legend_founded; DH-37 had every deed until expeditions (M4.7) moved its spell_cast; DH-79 had every deed until religion (faiths and holy wars) moved its spell_cast and its broken host; DH-81 had every deed until legends rose only from deeds of renown moved its legend_founded and broken host; M5.2 lineages: DH-152 had every deed until spellbooks and lineages gated spell casting; DH-180 and DH-189 failed other deed checks; DH-337 had every deed only with spells learnable by any mage, an override since removed; DH-134 has every deed with the default abilities.
let shared: WorldState | undefined;
const world = () =>
  (shared ??= generateWorld('DH-134', { width: 64, height: 64, historyYears: 250 }, FREQUENT));
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
      'legend_duel',
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

  it('send only legends on failed hunts, unless a dragon hoard drew the hunter', () => {
    // M5.6: heroes and great mages may ride for a dragon's hoard too (dragon_quest).
    for (const e of ofType('beast_hunt_failed')) {
      if (cause(e, 'dragon_quest')) continue;
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

  it('raise legends only on a recent deed of renown they led, and name it', () => {
    const { riseYears, risePhrases } = DEFAULT_CONTENT.notables.deeds;
    expect(ofType('legend_risen').length).toBeGreaterThan(0);
    for (const e of ofType('legend_risen')) {
      const deed = world().events.find((x) => x.id === e.causes[0])!;
      expect(risePhrases[deed.type], deed.type).toBeDefined();
      expect(deed.actors[0]).toBe(e.actors[0]);
      expect(e.day - deed.day).toBeLessThanOrEqual((riseYears + 1) * DAYS_PER_YEAR);
      expect(String(e.data.deed)).not.toMatch(/[{}]/);
    }
  });

  it('give every legend the fame of one', () => {
    for (const e of ofType('legend_risen')) {
      expect(world().people.get(e.actors[0]!)!.fame).toBeGreaterThanOrEqual(
        DEFAULT_CONTENT.notables.fame.legend,
      );
    }
  });

  it('break no more of a host than it brought, and only legends break one', () => {
    const battles = ofType('battle');
    expect(
      battles.some((b) => Number(b.data.attackerBroke) + Number(b.data.defenderBroke) > 0),
    ).toBe(true);
    for (const b of battles) {
      expect(Number(b.data.attackerBroke)).toBeLessThanOrEqual(Number(b.data.defenders));
      expect(Number(b.data.defenderBroke)).toBeLessThanOrEqual(Number(b.data.army));
    }
    for (const e of ofType('champion_fought')) {
      if (Number(e.data.broke) > 0)
        expect(world().people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
    }
  });

  it('duel only between legends of two peoples, and the slain die of the duel', () => {
    for (const e of ofType('legend_duel')) {
      const [winner, loser] = e.actors.map((id) => world().people.get(id)!);
      expect(winner!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      expect(loser!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      expect(winner!.civId).not.toBe(loser!.civId);
      const death = ofType('notable_died').find((d) => d.causes.includes(e.id));
      if (String(e.data.outcome).includes('killed')) {
        expect(death?.actors[0]).toBe(loser!.id);
        expect(loser!.causeOfDeath).toBe('duel');
      } else expect(death).toBeUndefined();
    }
  });

  it("spend a legend's day of power at most once a year", () => {
    const spent = new Set<string>();
    for (const e of world().events) {
      const named =
        e.type === 'legend_duel'
          ? e.actors.slice(0, 2)
          : e.type === 'champion_fought' && Number(e.data.broke) > 0
            ? e.actors.slice(0, 1)
            : [];
      for (const id of named) {
        const key = `${id}:${Math.floor(e.day / DAYS_PER_YEAR)}`;
        expect(spent.has(key), key).toBe(false);
        spent.add(key);
      }
    }
  });
});
