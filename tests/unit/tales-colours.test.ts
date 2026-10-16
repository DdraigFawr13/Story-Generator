import { describe, expect, it } from 'vitest';
import {
  HUES,
  assignHues,
  assignRaceHues,
  hlsToRgb,
  hueGap,
  touching,
} from '../../src/app/tales/colours';

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

  it('gives peoples whose realms touch hues far apart, one hue per people', () => {
    // Realms 1 and 2 are elves, 3 dwarves, 4 humans; 1 touches 3, 2 touches 4, 3 touches 4.
    const link = (a: number, b: number) => [a, b] as const;
    const pairs = [link(1, 3), link(2, 4), link(3, 4)];
    const neighbours = new Map<number, Set<number>>();
    for (const [a, b] of pairs) {
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      if (!neighbours.has(b)) neighbours.set(b, new Set());
      neighbours.get(a)!.add(b);
      neighbours.get(b)!.add(a);
    }
    const size = new Map([
      [1, 30],
      [2, 10],
      [3, 25],
      [4, 20],
    ]);
    const race: Record<number, string> = { 1: 'elf', 2: 'elf', 3: 'dwarf', 4: 'human' };
    const hue = assignRaceHues(neighbours, size, (civ) => race[civ]);
    expect([...hue.keys()].sort()).toEqual(['dwarf', 'elf', 'human']);
    expect(new Set(hue.values()).size).toBe(3);
    for (const [a, b] of [
      ['elf', 'dwarf'],
      ['elf', 'human'],
      ['dwarf', 'human'],
    ] as const) {
      expect(hueGap(hue.get(a)!, hue.get(b)!)).toBeGreaterThanOrEqual(60);
    }
    expect(assignRaceHues(neighbours, size, (civ) => race[civ])).toEqual(hue);
  });
});
