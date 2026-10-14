import { describe, expect, it } from 'vitest';
import { cardSide, fitMap, nearestCell } from '../../src/app/tales/layout';

describe('map fit', () => {
  const box = { x0: 100, y0: 120, w: 800, h: 700 };

  it('keeps the whole land box inside a phone stage, centred above the controls', () => {
    const stage = { w: 390, h: 680 };
    const fit = fitMap(stage, box, 1024);
    const left = fit.left + box.x0 * fit.s;
    const top = fit.top + box.y0 * fit.s;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + box.w * fit.s).toBeLessThanOrEqual(stage.w);
    expect(top).toBeGreaterThanOrEqual(52);
    expect(top + box.h * fit.s).toBeLessThanOrEqual(stage.h - 52);
    // Centred in the free space, not pinned to the top.
    expect(top - 52).toBeCloseTo(stage.h - 52 - (top + box.h * fit.s), 5);
  });

  it('centres the box in a wide stage', () => {
    const fit = fitMap({ w: 1200, h: 700 }, box, 1024);
    const top = fit.top + box.y0 * fit.s;
    expect(top + (box.h * fit.s) / 2).toBeCloseTo(350, 5);
  });
});

describe('pause card side', () => {
  const stage = { w: 1200, h: 700 };
  const land = (x0: number, _y0: number, x1: number) => (x1 <= 600 ? 0.5 : x0 >= 600 ? 0.02 : 0);

  it('takes the side with less land, and never the side holding the ring', () => {
    expect(cardSide(stage, land, null)).toBe('right');
    expect(cardSide(stage, land, { x: 1000, y: 600 })).toBe('mid');
  });

  it('goes to the bottom centre when both sides are heavy with land', () => {
    expect(cardSide(stage, (x0) => (x0 > 300 && x0 < 500 ? 0 : 0.4), null)).toBe('mid');
  });
});

describe('beast snapping', () => {
  it('finds the nearest accepted cell and leaves a fine cell alone', () => {
    const W = 10;
    const land = new Set([3 * W + 5, 7 * W + 1]);
    const ok = (c: number) => land.has(c);
    expect(nearestCell(3 * W + 5, W, 10, ok)).toBe(3 * W + 5);
    expect(nearestCell(3 * W + 7, W, 10, ok)).toBe(3 * W + 5);
    expect(nearestCell(6 * W + 2, W, 10, ok)).toBe(7 * W + 1);
    expect(nearestCell(0, W, 10, () => false)).toBe(0);
  });
});
