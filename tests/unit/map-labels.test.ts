import { describe, expect, it } from 'vitest';
import type { Region } from '../../src/engine';
import { boxesOverlap, planLabels, regionLookup } from '../../src/app/map-labels';

const region = (id: number, kind: Region['kind'], cells: number[]): Region => ({
  id,
  kind,
  name: `R${id}`,
  cells,
  anchor: cells[0]!,
});

describe('map labels', () => {
  it('orders by kind priority then size, and gates by zoom', () => {
    const labels = planLabels([
      region(1, 'pass', [1]),
      region(2, 'lake', [2, 3, 4, 5]),
      region(3, 'range', [6, 7]),
      region(4, 'island', [8, 9]),
    ]);
    expect(labels.map((l) => l.region.id)).toEqual([3, 2, 4, 1]);
    expect(labels.map((l) => l.minScale)).toEqual([0, 3, 3, 5]);
  });

  it('looks up the regions covering a cell and detects overlaps', () => {
    const lookup = regionLookup([region(1, 'range', [1, 2]), region(2, 'pass', [2])]);
    expect(lookup.get(2)!.map((r) => r.name)).toEqual(['R1', 'R2']);
    expect(lookup.get(5)).toBeUndefined();
    expect(boxesOverlap([0, 0, 10, 10], [5, 5, 10, 10])).toBe(true);
    expect(boxesOverlap([0, 0, 10, 10], [10, 0, 5, 5])).toBe(false);
  });
});
