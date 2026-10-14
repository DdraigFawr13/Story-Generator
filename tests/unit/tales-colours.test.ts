import { describe, expect, it } from 'vitest';
import { HUES, assignHues, hlsToRgb, hueGap, touching } from '../../src/app/tales/colours';

/** A strip of realms laid out on a grid: each cell holds the realm id. */
const GRID = [
  [1, 1, 2, 2, 3, 3],
  [1, 1, 2, 2, 3, 3],
  [4, 4, 5, 5, 6, 6],
  [4, 4, 5, 5, 6, 6],
  [7, 7, 8, 8, 0, 0],
].flat();

describe('realm colours', () => {
  it('never gives two neighbouring realms the same hue', () => {
    const { neighbours, size } = touching(GRID, 6, 5);
    const hue = assignHues([1, 2, 3, 4, 5, 6, 7, 8], neighbours, size);
    expect(hue.size).toBe(8);
    for (const [a, set] of neighbours) {
      for (const b of set) expect(hue.get(a)).not.toBe(hue.get(b));
    }
    // Neighbours are kept well apart on the wheel, not just different.
    for (const [a, set] of neighbours) {
      for (const b of set) expect(hueGap(hue.get(a)!, hue.get(b)!)).toBeGreaterThanOrEqual(60);
    }
    for (const h of hue.values()) expect(HUES).toContain(h);
  });

  it('is deterministic and ignores skipped cells', () => {
    const skip = GRID.map((v) => (v === 5 ? 1 : 0));
    const one = touching(GRID, 6, 5, skip);
    const two = touching(GRID, 6, 5, skip);
    expect([...assignHues([1, 2, 3, 4, 6, 7, 8], one.neighbours, one.size)]).toEqual([
      ...assignHues([1, 2, 3, 4, 6, 7, 8], two.neighbours, two.size),
    ]);
    expect(one.neighbours.get(2)?.has(5)).toBeFalsy();
  });

  it('converts HLS like the mock-up script', () => {
    expect(hlsToRgb(0, 0.5, 1)).toEqual([255, 0, 0]);
    expect(hlsToRgb(120, 0.5, 1)).toEqual([0, 255, 0]);
    expect(hlsToRgb(200, 0.5, 0)).toEqual([128, 128, 128]);
  });
});
