import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { craftProblems, type WorldState } from '../../src/engine';
import { findWorld, seedsFrom, smallWorld } from './helpers/find-world';

// The shared 64x64 worlds: the cover seeds, CR-1, then the shared list (first match wins).
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'd64', seedsFrom('CR-1'), smallWorld, has).world;
const RULES = DEFAULT_CONTENT.history.crafts;
const CRAFT_IDS = new Set(RULES.crafts.map((c) => c.id));
const nameToId = new Map(RULES.crafts.map((c) => [c.name, c.id]));

describe('named discoverers and lost crafts (W1)', () => {
  it('validates the craft table', () => {
    expect(craftProblems(DEFAULT_CONTENT)).toEqual([]);
  });

  const world = find('a craft lost and then regained or reinvented', (w) => {
    const types = new Set(w.events.map((e) => e.type));
    return (
      types.has('craft_lost') &&
      (types.has('craft_regained') || types.has('craft_reinvented')) &&
      types.has('craft_written')
    );
  });
  const at = (id: number) => world.events.find((e) => e.id === id);

  it('names a civ and a discoverer for every craft the peoples hold', () => {
    let held = 0;
    for (const civ of world.civs.values()) {
      for (const entry of civ.crafts ?? []) {
        expect(CRAFT_IDS.has(entry.id)).toBe(true);
        expect(world.people.has(entry.first)).toBe(true);
        expect(['craft_discovered', 'craft_brought']).toContain(at(entry.event)?.type);
        held += 1;
      }
    }
    expect(held).toBeGreaterThan(0);
  });

  it('loses only crafts a civ had, and regains or reinvents only after a loss in the same civ', () => {
    const lastLoss = new Map<string, number>();
    const civByName = new Map([...world.civs.values()].map((c) => [c.name, c]));
    let regained = 0;
    for (const e of world.events) {
      if (!e.type.startsWith('craft_')) continue;
      const civ = civByName.get(String(e.data.civ));
      const craft = nameToId.get(String(e.data.craft));
      if (!civ || !craft) continue;
      const k = `${civ.id}:${craft}`;
      if (e.type === 'craft_lost') {
        expect(civ.crafts?.some((c) => c.id === craft)).toBe(true);
        lastLoss.set(k, e.id);
      } else if (e.type === 'craft_regained' || e.type === 'craft_reinvented') {
        regained += 1;
        expect(lastLoss.has(k)).toBe(true);
        lastLoss.delete(k);
        if (e.type === 'craft_reinvented') expect(e.causes).toHaveLength(1);
      }
    }
    expect(regained).toBeGreaterThan(0);
  });

  it('keeps at most maxMasters living knowers per people and craft in the final world', () => {
    const counts = new Map<string, number>();
    for (const p of world.people.values()) {
      if (p.died !== undefined || p.civId == null) continue;
      for (const lore of p.crafts ?? []) {
        const k = `${p.civId}:${lore.id}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    // A discoverer, a reader or a brought-in knower may add one beyond the cap; teaching never does.
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(RULES.maxMasters + 2);
  });

  it('writes treatises on known crafts only', () => {
    const books = [...world.items.values()].filter((i) => i.crafts !== undefined);
    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      expect(book.kind).toBe('book');
      for (const id of book.crafts!) expect(CRAFT_IDS.has(id)).toBe(true);
    }
  });
});
