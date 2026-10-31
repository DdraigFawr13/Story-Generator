import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, meetsRequirements } from '../../src/engine';
import { findWorld, seedsFrom, smallWorld } from './helpers/find-world';

const YEARS = 250;
// LN-3 first; a history change that burns no book there falls back to the shared list.
const world = findWorld(
  'a world with a burned book and apprentices',
  'd64',
  seedsFrom('LN-3'),
  smallWorld,
  (w) => [...w.items.values()].some((i) => i.burned !== undefined),
).world;
const rules = DEFAULT_CONTENT.history.lineages;
const abilities = new Map(DEFAULT_CONTENT.abilities.map((a) => [a.id, a]));
const race = (id: string) => DEFAULT_CONTENT.races.find((r) => r.id === id)!;
const yearOf = (day: number) => Math.floor(day / DAYS_PER_YEAR);

describe('spellbooks and lineages (M5.2)', () => {
  it('gives every grown mage a lore record, and every known spell a record of how it was learned', () => {
    let mages = 0;
    for (const p of world.people.values()) {
      if (p.magic.power < rules.minPower) continue;
      mages += 1;
      const lore = p.lore;
      if (
        p.died === undefined &&
        YEARS - p.born >= Math.round(rules.apprenticeShare * race(p.raceId).maturityYears)
      ) {
        // A notable made after the last year's lineage step has all their deeds in that year.
        const fresh = p.deeds.every((id) => {
          const e = world.events.find((x) => x.id === id);
          return e !== undefined && yearOf(e.day) >= YEARS;
        });
        if (!fresh) expect(lore, `${p.name} (${p.id}) has no lore`).toBeDefined();
      }
      for (const id of p.knownAbilities) {
        const ability = abilities.get(id)!;
        expect(meetsRequirements(p, ability), `${p.name} knows ${id}`).toBe(true);
        const learned = lore?.learned.find((l) => l.id === id);
        expect(learned, `${p.name} learned ${id}`).toBeDefined();
        if (lore!.via === 'old' || lore!.via === 'hedge') continue;
        expect(
          learned!.teacher !== undefined ||
            learned!.book !== undefined ||
            learned!.college !== undefined,
          `${p.name} has a source for ${id}`,
        ).toBe(true);
      }
    }
    expect(mages).toBeGreaterThan(0);
  });

  it('links teachers and apprentices both ways, and leaves burned books with no holder', () => {
    let pupils = 0;
    for (const p of world.people.values()) {
      for (const id of p.lore?.teachers ?? []) {
        pupils += 1;
        expect(world.people.get(id)!.lore!.apprentices, `${p.name} under ${id}`).toContain(p.id);
      }
      for (const id of p.lore?.apprentices ?? []) {
        expect(world.people.get(id)!.lore!.teachers).toContain(p.id);
      }
    }
    expect(pupils).toBeGreaterThan(0);
    const burned = [...world.items.values()].filter((i) => i.burned !== undefined);
    expect(burned.length).toBeGreaterThan(0);
    for (const item of burned) {
      expect(item.holder).toBeNull();
      expect(item.lostAt).toBeUndefined();
    }
  });
});
