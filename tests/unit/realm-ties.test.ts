import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DIPLOMACY } from '../../src/content/diplomacy';
import { generateWorld, type WorldState } from '../../src/engine';
import { allTies, standingAt, tiesOf } from '../../src/app/ties';
import { findWorld } from './helpers/find-world';

// The realm pages rebuild alliances and vassalage from the record. Vassals are rare in a small
// world, so the chances are raised as in the diplomacy test; the rules still run as written.
const content = {
  ...DEFAULT_CONTENT,
  history: {
    ...DEFAULT_CONTENT.history,
    diplomacy: {
      ...DIPLOMACY,
      alliance: { ...DIPLOMACY.alliance, chance: 1, maxGrievance: 5, maxStrangeness: 10 },
      vassal: { ...DIPLOMACY.vassal, minTaken: 1, strengthRatio: 1, chance: 1, revoltChance: 0.3 },
    },
  },
};
const SEEDS = ['DI-1', 'DI-2', 'DI-3', 'DI-4', 'DI-5', 'DI-6', 'DI-7', 'DI-8'];

function example(what: string, has: (w: WorldState) => boolean): WorldState {
  return findWorld(
    what,
    'realm-ties',
    SEEDS,
    (seed) => generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, content),
    has,
  ).world;
}

describe('realm ties', () => {
  it('match the vassals the history leaves standing, and every tie ends after it starts', () => {
    const world = example('a vassal at the end of history', (w) =>
      [...w.civs.values()].some((c) => c.overlord !== undefined && c.fell === undefined),
    );
    const final = world.params.historyYears;
    const open = allTies(world).filter((t) => t.kind === 'vassal' && t.to === undefined);
    for (const civ of world.civs.values()) {
      if (civ.fell !== undefined) continue;
      expect(standingAt(world, civ.id, final).overlord, civ.name).toBe(civ.overlord);
    }
    for (const tie of open) expect(world.civs.get(tie.b)!.overlord).toBe(tie.a);
    for (const tie of allTies(world)) {
      if (tie.to !== undefined) expect(tie.to).toBeGreaterThanOrEqual(tie.from);
      if (tie.ended !== undefined && tie.ended !== 'fell') expect(tie.end).toBeDefined();
    }
    const sworn = world.events.filter((e) => e.type === 'alliance_sworn').length;
    expect(allTies(world).filter((t) => t.kind === 'alliance')).toHaveLength(sworn);
  });

  it('ends an alliance at a refused call and a vassalage at a revolt', () => {
    const world = example('a revolt and a refused call', (w) =>
      ['vassal_revolt', 'call_refused'].every((t) => w.events.some((e) => e.type === t)),
    );
    const ties = allTies(world);
    const refused = world.events.find((e) => e.type === 'call_refused')!;
    const tie = ties.find((t) => t.end === refused.id)!;
    expect(tie.ended).toBe('refused');
    expect(world.civs.get(tie.by!)!.name).toBe(refused.data.civ);
    const revolt = world.events.find((e) => e.type === 'vassal_revolt')!;
    const vassal = ties.find((t) => t.end === revolt.id)!;
    expect(vassal.ended).toBe('revolt');
    expect(world.civs.get(vassal.b)!.name).toBe(revolt.data.civ);
    expect(tiesOf(world, vassal.b)).toContain(vassal);
    expect(tiesOf(world, vassal.a)).toContain(vassal);
  });
});
