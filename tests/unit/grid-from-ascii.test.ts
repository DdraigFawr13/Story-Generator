import { describe, expect, it } from 'vitest';
import { gridFromAscii } from './helpers/grid-from-ascii';

describe('gridFromAscii', () => {
  it('maps sea and digits to metres', () => {
    const grid = gridFromAscii(['~09', '~5~'], 10);
    expect(grid.width).toBe(3);
    expect(grid.height).toBe(2);
    expect([...grid.elevation]).toEqual([-10, 1, 90, -10, 50, -10]);
  });

  it('rejects ragged rows and unknown characters', () => {
    expect(() => gridFromAscii(['~~', '~'])).toThrow(/columns/);
    expect(() => gridFromAscii(['~x'])).toThrow(/character/);
  });
});
