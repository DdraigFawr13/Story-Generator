import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { buildLegendIndex, generateWorld, playByPlay, type WorldState } from '../../src/engine';

let shared: WorldState | undefined;
/** One 64x64, 250-year world with epic battles and beast fights (S2: 7 battles, 32 fights). */
const base = () =>
  (shared ??= generateWorld('S2', { width: 64, height: 64, historyYears: 250 }, DEFAULT_CONTENT));

const FIGHTS = ['battle', 'beast_slain', 'beast_fought', 'beast_hunt_failed'];

describe('play-by-play', () => {
  it('tells epic fights in 3 to 6 true beats and leaves the rest out', () => {
    const world = base();
    const index = buildLegendIndex(world, DEFAULT_CONTENT);
    const seen = new Set<string>();
    let empty = 0;
    for (const event of world.events) {
      if (!FIGHTS.includes(event.type)) continue;
      const beats = playByPlay(world, DEFAULT_CONTENT, index, event);
      if (beats.length === 0) {
        empty += 1;
        continue;
      }
      seen.add(event.type === 'battle' ? 'battle' : 'beast');
      expect(beats.length).toBeGreaterThanOrEqual(3);
      expect(beats.length).toBeLessThanOrEqual(6);
      // Every number printed is in the event's own data (the odds line says "in 100").
      const given = new Set(Object.values(event.data).map(String));
      for (const beat of beats) {
        expect(beat).toMatch(/^[A-Z][^\n]*[.!]$/);
        for (const n of beat.replace(/,/g, '').match(/\d+/g) ?? [])
          expect(given.has(n) || n === '100', `${event.type} #${event.id}: ${n} in "${beat}"`).toBe(
            true,
          );
      }
      expect(playByPlay(world, DEFAULT_CONTENT, index, event)).toEqual(beats);
    }
    expect(seen).toEqual(new Set(['battle', 'beast']));
    expect(empty).toBeGreaterThan(0);
  });
});
