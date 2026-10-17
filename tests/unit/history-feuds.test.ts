import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent, type WorldState } from '../../src/engine';
import { findWorld } from './helpers/find-world';

// Feuds are rarer in a small world, so each test searches a short fixed seed list for a world with
// the example it checks (first match wins); worlds are generated once per seed and shared.
const SEEDS = ['FD-1', 'FD-2', 'FD-5', 'FD-15', 'FD-3', 'FD-8', 'FD-10', 'FD-21'];
const make = (seed: string) =>
  generateWorld(seed, { width: 128, height: 128, historyYears: 250 }, DEFAULT_CONTENT);
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'feuds', SEEDS, make, has).world;
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const generationThree = (w: WorldState) =>
  ofType(w, 'feud_inherited').filter((e) => Number(e.data.generation) >= 3);

describe('generation feuds', () => {
  it('hands a feud down three generations, each step citing the one before', () => {
    const world = find(
      'a feud inherited into a third generation',
      (w) => generationThree(w).length > 0,
    );
    const byId = new Map(world.events.map((e) => [e.id, e]));
    const inherited = generationThree(world)[0]!;
    // Walk the causes back: the chain must end at the feud_began of the same two houses.
    const seen = new Set<number>();
    const queue = [...inherited.causes];
    let began: SimEvent | undefined;
    while (queue.length > 0 && !began) {
      const event = byId.get(queue.shift()!);
      if (!event || seen.has(event.id)) continue;
      seen.add(event.id);
      if (event.type === 'feud_began') began = event;
      else queue.push(...event.causes);
    }
    expect(began, `feud_inherited ${inherited.id}`).toBeDefined();
    expect([began!.data.house, began!.data.foe].sort()).toEqual(
      [inherited.data.house, inherited.data.foe].sort(),
    );
    expect(Number(inherited.data.beganYear)).toBe(yearOf(began!));
    expect(inherited.data.kin).toBeTruthy();
  });

  it('drives a notable to a foreign court, and some come home', () => {
    const world = find(
      'an exile who came home',
      (w) => ofType(w, 'notable_exiled').length > 0 && ofType(w, 'exile_returned').length > 0,
    );
    const names = new Set([...world.civs.values()].map((c) => c.name));
    for (const exiled of ofType(world, 'notable_exiled')) {
      expect(names.has(String(exiled.data.civ))).toBe(true);
      expect(names.has(String(exiled.data.host))).toBe(true);
      expect(exiled.data.host).not.toBe(exiled.data.civ);
      expect(world.people.get(exiled.actors[0]!)).toBeDefined();
    }
    const byId = new Map(world.events.map((e) => [e.id, e]));
    for (const back of ofType(world, 'exile_returned')) {
      const exiled = byId.get(back.causes[0]!);
      expect(exiled?.type).toBe('notable_exiled');
      expect(back.actors[0]).toBe(exiled!.actors[0]);
      expect(back.data.civ).toBe(exiled!.data.civ);
      expect(yearOf(back)).toBeGreaterThan(yearOf(exiled!));
    }
  });

  it('splits a house into a branch that remembers where it came from', () => {
    const world = find('a house split', (w) => ofType(w, 'house_split').length > 0);
    const dynasties = [...world.dynasties.values()];
    for (const split of ofType(world, 'house_split')) {
      // House names can repeat across peoples, so the branch is found by its founder too.
      const founder = split.actors[0]!;
      const branch = dynasties.find((d) => d.founderId === founder && d.name === split.data.branch);
      expect(branch, `house_split ${split.id}`).toBeDefined();
      expect(world.dynasties.get(branch!.branchOf!)?.name).toBe(split.data.house);
      // The founder stays in the branch unless they later founded another house (taking a seat).
      const later = dynasties.some((d) => d.founderId === founder && d.founded > yearOf(split));
      if (!later) expect(world.people.get(founder)?.dynastyId).toBe(branch!.id);
    }
  });

  it('never strikes at the dead, and a death by a strike names the striker', () => {
    const world = find('a feud strike', (w) => ofType(w, 'feud_struck').length > 0);
    for (const strike of ofType(world, 'feud_struck')) {
      const target = world.people.get(strike.actors[1]!)!;
      expect(target.died === undefined || target.died >= yearOf(strike)).toBe(true);
      if (strike.data.slain === 1) {
        expect(target.died).toBe(yearOf(strike));
        expect(target.killerId).toBe(strike.actors[0]);
      }
    }
  });
});
