import { DEFAULT_CONTENT } from '../../src/content';
import { describe, expect, it } from 'vitest';
import {
  computeRainfall,
  computeSeaDistance,
  eastwardShare,
  generateWorld,
  windDirection,
  type WorldCells,
} from '../../src/engine';

// Worldgen only: history never changes the cells, regions or routes, so the 250 years are skipped.
const SMALL = { width: 96, height: 96, historyYears: 0 };

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function landCells(cells: WorldCells, filter: (i: number, x: number, y: number) => boolean) {
  const out: number[] = [];
  for (let i = 0; i < cells.elevation.length; i += 1) {
    const x = i % cells.width;
    const y = (i - x) / cells.width;
    if (cells.water[i] !== 3 && cells.elevation[i]! > 0 && filter(i, x, y)) out.push(i);
  }
  return out;
}

describe('climate fixtures', () => {
  it('measures distance to the sea', () => {
    const ocean = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const distance = computeSeaDistance(4, 3, ocean);
    expect(distance[0]).toBe(0);
    expect(distance[1]).toBe(1);
    expect(distance[11]).toBe(3);
  });

  it('rains harder on the windward side of a ridge than in its lee', () => {
    const width = 24;
    const height = 25;
    const row = 8; // latitude about 43: wind blows toward the east
    expect(windDirection(row, height)).toBe(1);
    const elevation = new Int16Array(width * height);
    const ocean = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (x < 5) {
          elevation[i] = -100;
          ocean[i] = 1;
        } else {
          elevation[i] = x === 10 || x === 11 ? 1500 : 100;
        }
      }
    }
    const rain = computeRainfall(width, height, elevation, ocean, 1);
    const windward = rain[row * width + 8]!;
    const lee = rain[row * width + 15]!;
    expect(elevation[row * width + 8]).toBe(elevation[row * width + 15]);
    expect(windward).toBeGreaterThan(lee * 1.5);
    const scaled = computeRainfall(width, height, elevation, ocean, 2);
    expect(scaled[row * width + 8]).toBeGreaterThan(windward * 1.9);
  });
});

describe('rainfall banding', () => {
  it('hands the westerlies over to the trade winds gradually', () => {
    for (let lat = -10; lat < 70; lat += 0.5) {
      expect(Math.abs(eastwardShare(lat + 0.5) - eastwardShare(lat))).toBeLessThan(0.1);
    }
    expect(eastwardShare(45)).toBe(1);
    expect(eastwardShare(20)).toBe(0);
    expect(eastwardShare(68)).toBe(0);
  });
});

describe('generated climate', () => {
  for (const seed of ['A', 'B', 'C']) {
    it(`is colder in the north, on heights, within risk bounds (seed ${seed})`, () => {
      const cells = generateWorld(seed, SMALL, DEFAULT_CONTENT).cells!;
      const { height, tempSummer, risk } = cells;
      const north = landCells(cells, (_i, _x, y) => y < height / 4);
      const south = landCells(cells, (_i, _x, y) => y >= (height * 3) / 4);
      expect(north.length).toBeGreaterThan(0);
      expect(south.length).toBeGreaterThan(0);
      expect(mean(north.map((i) => tempSummer[i]!))).toBeLessThan(
        mean(south.map((i) => tempSummer[i]!)),
      );
      expect(mean(north.map((i) => risk.snow[i]!))).toBeGreaterThan(
        mean(south.map((i) => risk.snow[i]!)),
      );

      for (let band = 0; band < 8; band += 1) {
        const rows = (i: number) => Math.floor(i / cells.width / 12) === band;
        const high = landCells(cells, (i) => rows(i) && cells.elevation[i]! > 1500);
        const low = landCells(cells, (i) => rows(i) && cells.elevation[i]! < 300);
        if (high.length < 5 || low.length < 5) continue;
        expect(mean(high.map((i) => tempSummer[i]!))).toBeLessThan(
          mean(low.map((i) => tempSummer[i]!)),
        );
      }

      for (const layer of [risk.drought, risk.storm, risk.snow]) {
        expect(Math.max(...layer)).toBeLessThanOrEqual(100);
      }
      expect(Math.max(...cells.rainfall)).toBeGreaterThan(Math.min(...cells.rainfall));
    });
  }

  it('swings wider between seasons inland than on the coast', () => {
    // Needs a map big enough to have ground 15 cells from the sea.
    const cells = generateWorld(
      'INLAND',
      { width: 192, height: 192, historyYears: 0 },
      DEFAULT_CONTENT,
    ).cells!;
    const { tempSummer, tempWinter, seaDistance } = cells;
    const spread = (i: number) => tempSummer[i]! - tempWinter[i]!;
    const inland = landCells(cells, (i) => seaDistance[i]! >= 15);
    const coastal = landCells(cells, (i) => seaDistance[i]! <= 2);
    expect(inland.length).toBeGreaterThan(0);
    expect(coastal.length).toBeGreaterThan(0);
    expect(mean(inland.map(spread))).toBeGreaterThan(mean(coastal.map(spread)));
  });

  it('shifts temperatures with temperatureShift and scales rainfall', () => {
    const base = generateWorld('SHIFT', SMALL, DEFAULT_CONTENT).cells!;
    const warm = generateWorld('SHIFT', { ...SMALL, temperatureShift: 10 }, DEFAULT_CONTENT).cells!;
    const wet = generateWorld('SHIFT', { ...SMALL, rainfallScale: 2 }, DEFAULT_CONTENT).cells!;
    const land = landCells(base, () => true);
    const diff =
      mean(land.map((i) => warm.tempSummer[i]!)) - mean(land.map((i) => base.tempSummer[i]!));
    expect(diff).toBeGreaterThan(9);
    expect(diff).toBeLessThan(11);
    expect(mean(land.map((i) => wet.rainfall[i]!))).toBeGreaterThan(
      mean(land.map((i) => base.rainfall[i]!)) * 1.5,
    );
  });

  it('rejects unusable climate parameters', () => {
    expect(() => generateWorld('BAD', { temperatureShift: 20 }, DEFAULT_CONTENT)).toThrow(
      /temperature/,
    );
    expect(() => generateWorld('BAD', { temperatureShift: Number.NaN }, DEFAULT_CONTENT)).toThrow(
      /temperature/,
    );
    expect(() => generateWorld('BAD', { rainfallScale: 0.1 }, DEFAULT_CONTENT)).toThrow(/rainfall/);
    expect(() => generateWorld('BAD', { rainfallScale: 3 }, DEFAULT_CONTENT)).toThrow(/rainfall/);
  });
});
