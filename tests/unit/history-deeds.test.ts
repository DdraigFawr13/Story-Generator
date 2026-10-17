import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent, type WorldState } from '../../src/engine';
import { findWorld } from './helpers/find-world';

/** Frequent deeds on a 64x64 world. */
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

// The tests search this fixed list for a world with the event they check (first match wins).
// DH-144 and DH-137 lead since the 2026-10-17 feuds change (like the dragon-at-court change before
// it) left the older seeds without a legend founding or a duel.
const SEEDS = [
  'DH-144',
  'DH-137',
  'DH-60',
  'DH-134',
  'DH-3',
  'DH-37',
  'DH-79',
  'DH-81',
  'DH-152',
  'DH-34',
  'DH-105',
];
const make = (seed: string) =>
  generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, FREQUENT);
/** The first world in SEEDS where `has` holds. */
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'deeds', SEEDS, make, has).world;
const hasType = (type: string) => (w: WorldState) => w.events.some((e) => e.type === type);
const withType = (type: string) => find(`a ${type} event`, hasType(type));
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const cause = (w: WorldState, e: SimEvent, type: string) =>
  e.causes.map((id) => w.events.find((x) => x.id === id)).find((c) => c?.type === type);
const broke = (b: SimEvent) => Number(b.data.attackerBroke) + Number(b.data.defenderBroke) > 0;

describe('legend deeds', () => {
  it('happen at least once each, each found in some world', () => {
    for (const type of [
      'champion_fought',
      'vengeance_raid',
      'legend_founded',
      'beast_hunt_failed',
      'spell_cast',
      'college_founded',
      'legend_duel',
    ]) {
      expect(ofType(withType(type), type).length, type).toBeGreaterThan(0);
    }
  });

  it('send only powerful champions, in a battle at the same place', () => {
    const w = withType('champion_fought');
    for (const e of ofType(w, 'champion_fought')) {
      expect(w.people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(7);
      expect(cause(w, e, 'battle')?.data.site).toBe(e.data.site);
    }
  });

  it('ride for vengeance once, against a sworn enemy, after an oath', () => {
    const w = withType('vengeance_raid');
    const riders = new Set<number>();
    for (const e of ofType(w, 'vengeance_raid')) {
      const [avenger, enemy] = e.actors;
      expect(w.people.get(avenger!)!.enemies).toContain(enemy);
      for (const id of e.actors.filter((a) => a !== enemy)) {
        expect(riders.has(id)).toBe(false);
        riders.add(id);
      }
      expect(cause(w, e, 'oath_sworn')?.actors).toEqual([avenger, enemy]);
    }
  });

  it('have legends found sites after a founding with no made-up founder', () => {
    const w = withType('legend_founded');
    for (const e of ofType(w, 'legend_founded')) {
      expect(w.people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      const founding = cause(w, e, 'site_founded');
      expect(founding?.actors).toEqual([]);
      expect(founding?.data.site).toBe(e.data.site);
    }
  });

  it('send only legends on failed hunts, unless a dragon hoard drew the hunter', () => {
    // M5.6: heroes and great mages may ride for a dragon's hoard too (dragon_quest), and a hero of
    // a realm that put a price on a dragon may take it (dragon_bounty_taken).
    const w = withType('beast_hunt_failed');
    for (const e of ofType(w, 'beast_hunt_failed')) {
      if (cause(w, e, 'dragon_quest') || cause(w, e, 'dragon_bounty_taken')) continue;
      expect(w.people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
    }
  });

  it('bury those killed in battle at the battlefield', () => {
    const inBattle = (e: SimEvent) => String(e.data.cause).startsWith('in battle');
    const w = find('a notable killed in battle', (x) =>
      ofType(x, 'notable_died').some((e) => inBattle(e)),
    );
    for (const e of ofType(w, 'notable_died')) {
      if (!inBattle(e)) continue;
      const fight = cause(w, e, 'battle') ?? cause(w, e, 'champion_fought');
      if (fight) expect(e.data.site).toBe(fight.data.site);
    }
  });

  it('raise legends only on a recent deed of renown they led, and name it', () => {
    const { riseYears, risePhrases } = DEFAULT_CONTENT.notables.deeds;
    const w = withType('legend_risen');
    for (const e of ofType(w, 'legend_risen')) {
      const deed = w.events.find((x) => x.id === e.causes[0])!;
      expect(risePhrases[deed.type], deed.type).toBeDefined();
      expect(deed.actors[0]).toBe(e.actors[0]);
      expect(e.day - deed.day).toBeLessThanOrEqual((riseYears + 1) * DAYS_PER_YEAR);
      expect(String(e.data.deed)).not.toMatch(/[{}]/);
    }
  });

  it('give every legend the fame of one', () => {
    const w = withType('legend_risen');
    for (const e of ofType(w, 'legend_risen')) {
      expect(w.people.get(e.actors[0]!)!.fame).toBeGreaterThanOrEqual(
        DEFAULT_CONTENT.notables.fame.legend,
      );
    }
  });

  it('break no more of a host than it brought, and only legends break one', () => {
    const w = find('a battle that broke a host', (x) => ofType(x, 'battle').some(broke));
    for (const b of ofType(w, 'battle')) {
      expect(Number(b.data.attackerBroke)).toBeLessThanOrEqual(Number(b.data.defenders));
      expect(Number(b.data.defenderBroke)).toBeLessThanOrEqual(Number(b.data.army));
    }
    const c = withType('champion_fought');
    for (const e of ofType(c, 'champion_fought')) {
      if (Number(e.data.broke) > 0)
        expect(c.people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
    }
  });

  it('duel only between legends of two peoples, and the slain die of the duel', () => {
    const w = withType('legend_duel');
    for (const e of ofType(w, 'legend_duel')) {
      const [winner, loser] = e.actors.map((id) => w.people.get(id)!);
      expect(winner!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      expect(loser!.magic.power).toBeGreaterThanOrEqual(LEGEND_POWER);
      expect(winner!.civId).not.toBe(loser!.civId);
      const death = ofType(w, 'notable_died').find((d) => d.causes.includes(e.id));
      if (String(e.data.outcome).includes('killed')) {
        expect(death?.actors[0]).toBe(loser!.id);
        expect(loser!.causeOfDeath).toBe('duel');
      } else expect(death).toBeUndefined();
    }
  });

  it("spend a legend's day of power at most once a year", () => {
    const spent = new Set<string>();
    for (const e of withType('legend_duel').events) {
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
