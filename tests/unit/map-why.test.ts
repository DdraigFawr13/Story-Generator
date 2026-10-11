import { describe, expect, it } from 'vitest';
import { explainCell, type WhyCells } from '../../src/app/why';

/** 3 rows (row 1 is at 30° latitude: the wind blows east, so upwind is west). */
function fixture(width: number, elevation: number[], rain: number): WhyCells {
  const size = width * 3;
  const elev = new Int16Array(size);
  elev.set(elevation, width); // middle row only
  return {
    width,
    height: 3,
    elevation: elev,
    water: new Uint8Array(size),
    rainfall: new Uint16Array(size).fill(rain),
    seaDistance: new Uint16Array(size).fill(20),
    floodplain: new Uint8Array(size),
    wildness: new Uint8Array(size),
    tempSummer: new Int8Array(size),
  };
}

describe('explainCell', () => {
  it('finds a rain shadow to the west and names the distance', () => {
    const cells = fixture(10, [2000, 100, 100, 100, 100, 100, 100, 100, 100, 100], 200);
    const lines = explainCell(cells, 4, 1);
    expect(lines[0]).toMatchObject({ id: 'rain-shadow', layer: 'rainfall' });
    expect(lines[0]!.text).toBe('rain shadow of the range 4 cells to the west');
  });

  it('needs enough rise and dry ground for a rain shadow', () => {
    expect(explainCell(fixture(10, [900, 100, 100, 100, 100, 100], 200), 4, 1)[0]!.id).toBe(
      'temperate',
    );
    expect(explainCell(fixture(10, [2000, 100, 100, 100, 100, 100], 900), 4, 1)[0]!.id).toBe(
      'temperate',
    );
  });

  it('detects windward slopes, altitude and sea distance', () => {
    const cells = fixture(10, [100, 300, 1900], 1800);
    cells.seaDistance.fill(3);
    const ids = explainCell(cells, 2, 1).map((l) => l.id);
    expect(ids).toEqual(['windward', 'maritime', 'altitude']);
    const altitude = explainCell(cells, 2, 1).find((l) => l.id === 'altitude')!;
    expect(altitude.text).toBe('high ground at 1,900 m');
  });

  it('falls back to temperate and caps the list at four lines', () => {
    const calm = explainCell(fixture(4, [100, 100], 800), 1, 1);
    expect(calm).toHaveLength(1);
    expect(calm[0]).toMatchObject({ lead: 'Temperate:', layer: null });

    const cells = fixture(10, [2000, 100, 100, 1600, 1700], 200);
    cells.seaDistance.fill(50);
    cells.floodplain.fill(1);
    cells.wildness.fill(90);
    expect(explainCell(cells, 4, 1)).toHaveLength(4);
  });
});
