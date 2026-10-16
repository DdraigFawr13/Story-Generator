import { describe, expect, it } from 'vitest';
import { contours, pathOf } from '../../src/app/tales/outline';

describe('shore outline', () => {
  // A 12 by 12 plane with a filled block of 6 by 6 in the middle.
  const w = 12;
  const plane = new Float32Array(w * w);
  for (let y = 3; y < 9; y += 1) for (let x = 3; x < 9; x += 1) plane[y * w + x] = 1;

  it('traces one closed loop round the land at the cut level', () => {
    const lines = contours(plane, w, w, 0.5, 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.closed).toBe(true);
    const p = lines[0]!.points;
    expect(p.at(-2)).toBe(p[0]);
    expect(p.at(-1)).toBe(p[1]);
    // Every point is near the block's edge: 3 to 9 cells across, with its centre at 6.
    for (let i = 0; i < p.length; i += 2) {
      const d = Math.max(Math.abs(p[i]! - 6), Math.abs(p[i + 1]! - 6));
      expect(d).toBeGreaterThan(2.4);
      expect(d).toBeLessThan(3.6);
    }
  });

  it('writes an SVG path, and nothing for open sea', () => {
    expect(pathOf(contours(plane, w, w, 0.5, 2))).toMatch(/^M[\d. ]+L.*Z$/);
    expect(contours(new Float32Array(w * w), w, w, 0.5, 2)).toEqual([]);
  });
});
