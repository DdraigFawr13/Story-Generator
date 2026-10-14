import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  annals,
  battleRecords,
  buildLegendIndex,
  generateWorld,
  type WorldState,
} from '../../src/engine';

let shared: WorldState | undefined;
/** One 64x64, 250-year world (S2: 7 battles, several peoples). */
const base = () =>
  (shared ??= generateWorld('S2', { width: 64, height: 64, historyYears: 250 }, DEFAULT_CONTENT));

describe('named battles', () => {
  it('names every battle once, numbers repeats and keeps great battles few', () => {
    const world = base();
    const records = battleRecords(world, DEFAULT_CONTENT);
    expect(records.length).toBe(world.events.filter((e) => e.type === 'battle').length);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(records.map((r) => r.name)).size).toBe(records.length);
    for (const r of records) expect(r.name).toMatch(/^the (\w+ )?Battle of /);
    const places = new Map<string, number>();
    for (const r of records) {
      const place = r.name.replace(/^the (\w+ )?Battle of /, '');
      const nth = (places.get(place) ?? 0) + 1;
      places.set(place, nth);
      if (nth > 1) expect(r.name).toMatch(/^the (Second|Third|Fourth|Fifth|Sixth|\d+th) Battle/);
      else expect(r.name).toMatch(/^the Battle of /);
    }
    const great = records.filter((r) => r.great);
    expect(great.length).toBeLessThanOrEqual(
      DEFAULT_CONTENT.battles.greatCount + records.filter((r) => r.fallen.length > 0).length,
    );
    expect(great.filter((r) => r.fallen.length === 0).length).toBeLessThanOrEqual(
      DEFAULT_CONTENT.battles.greatCount,
    );
    expect(battleRecords(world, DEFAULT_CONTENT)).toBe(records);
  });
});

describe('annals', () => {
  it('splits each people into contiguous named eras and a short summary', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const rules = DEFAULT_CONTENT.annals;
    for (const civ of world.civs.values()) {
      const book = annals(world, index, DEFAULT_CONTENT, civ.id)!;
      expect(book.eras.length).toBeGreaterThan(0);
      expect(book.eras.length).toBeLessThanOrEqual(rules.maxEras);
      expect(book.eras[0]!.from).toBe(civ.founded);
      expect(book.eras[book.eras.length - 1]!.to).toBe(book.to);
      book.eras.forEach((era, k) => {
        if (k > 0) expect(era.from).toBe(book.eras[k - 1]!.to + 1);
        expect(era.to).toBeGreaterThanOrEqual(era.from);
        expect(era.keyEvents.length).toBeLessThanOrEqual(rules.keyEvents);
      });
      expect(new Set(book.eras.map((e) => e.name)).size).toBe(book.eras.length);
      expect(book.summary.length).toBeGreaterThan(0);
      expect(book.summary.length).toBeLessThanOrEqual(rules.maxSummary);
    }
  });
});
