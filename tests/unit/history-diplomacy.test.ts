import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DIPLOMACY } from '../../src/content/diplomacy';
import { DAYS_PER_YEAR, generateWorld, type SimEvent } from '../../src/engine';
import { findWorld } from './helpers/find-world';

// Diplomacy is rare in a small world, so the chances are raised: every rule still runs, just more
// often. Each test takes the first world of a short fixed seed list that has its example; if a
// history change empties a list, add seeds rather than re-pinning.
const content = {
  ...DEFAULT_CONTENT,
  history: {
    ...DEFAULT_CONTENT.history,
    diplomacy: {
      ...DIPLOMACY,
      alliance: {
        ...DIPLOMACY.alliance,
        chance: 1,
        maxGrievance: 5,
        maxStrangeness: 10,
        maxAllies: 4,
      },
      betrayal: { ...DIPLOMACY.betrayal, chance: 0 },
      vassal: { ...DIPLOMACY.vassal, minTaken: 1, strengthRatio: 1, chance: 1, revoltChance: 0.3 },
      marriagePeace: { ...DIPLOMACY.marriagePeace, chance: 1, minYears: 1 },
    },
  },
};
// DI-18 leads since the 2026-10-17 feuds change left DI-12 and DI-1 to DI-8 without a peace by marriage.
const SEEDS = ['DI-18', 'DI-12', 'DI-1', 'DI-2', 'DI-3', 'DI-4', 'DI-5', 'DI-6', 'DI-7', 'DI-8'];
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);

function example(what: string, seeds: string[], type: string) {
  const { world } = findWorld(
    what,
    'diplomacy64',
    seeds,
    (seed) => generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, content),
    (w) => w.events.some((e) => e.type === type),
  );
  return {
    world,
    of: (t: string) => world.events.filter((e) => e.type === t),
    byId: (id: number) => world.events.find((e) => e.id === id),
  };
}

describe('diplomacy64', () => {
  it('ends a war by a wedding of two spouses and no battle between the peoples follows', () => {
    const { world, of } = example('a peace by marriage', SEEDS, 'peace_by_marriage');
    for (const peace of of('peace_by_marriage')) {
      const [bride, groom] = peace.actors.map((id) => world.people.get(id)!);
      expect(bride!.family.spouses, `event ${peace.id}`).toContain(groom!.id);
      expect(groom!.family.spouses).toContain(bride!.id);
      const later = world.events.filter(
        (e) =>
          e.type === 'battle' &&
          e.id > peace.id &&
          yearOf(e) <= yearOf(peace) + 1 &&
          new Set([e.data.civ, e.data.enemy]).has(peace.data.civ) &&
          new Set([e.data.civ, e.data.enemy]).has(peace.data.enemy),
      );
      expect(later, `event ${peace.id}`).toHaveLength(0);
    }
  });

  it('cites a peace that ended a war the overlord began against the vassal', () => {
    const { of, byId } = example('a vassal', SEEDS, 'vassal_sworn');
    for (const sworn of of('vassal_sworn')) {
      const peace = byId(sworn.causes[0]!);
      expect(peace?.type, `event ${sworn.id}`).toBe('peace_made');
      expect([peace!.data.civ, peace!.data.enemy]).toEqual([sworn.data.overlord, sworn.data.civ]);
    }
  });

  it('cites the war declared for every call answered or refused', () => {
    const { of, byId } = example('an answered call', SEEDS, 'ally_answered');
    const calls = [...of('ally_answered'), ...of('call_refused')];
    for (const call of calls) {
      const war = call.causes.map(byId).find((e) => e?.type === 'war_declared');
      expect(war, `event ${call.id}`).toBeDefined();
      expect(war!.data.enemy).toBe(call.data.friend);
      expect(war!.data.civ).toBe(call.data.enemy);
    }
  });

  it('answers every revolt with a war declared that cites it', () => {
    const { world, of } = example('a vassal revolt', SEEDS, 'vassal_revolt');
    for (const revolt of of('vassal_revolt')) {
      const war = world.events.find(
        (e) => e.type === 'war_declared' && e.causes.includes(revolt.id),
      );
      expect(war, `event ${revolt.id}`).toBeDefined();
      expect(war!.data.civ).toBe(revolt.data.civ);
      expect(war!.data.enemy).toBe(revolt.data.overlord);
    }
  });
});
