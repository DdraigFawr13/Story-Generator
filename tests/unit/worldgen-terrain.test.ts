import { DEFAULT_CONTENT } from '../../src/content';
import { describe, expect, it } from 'vitest';
import {
  deserializeWorld,
  fractalNoise,
  generateWorld,
  serializeWorld,
  valueNoise,
  type WorldCells,
} from '../../src/engine';

// Terrain only: no history years, which these tests never read (a 250-year history per world
// pushed the three-world test past the 5 s limit once religion added wars).
const SMALL = { width: 96, height: 96, historyYears: 0 };

function landShare(cells: WorldCells): number {
  let land = 0;
  for (const height of cells.elevation) if (height > 0) land += 1;
  return land / cells.elevation.length;
}

describe('noise', () => {
  it('is deterministic, bounded and continuous', () => {
    expect(valueNoise(7, 3.25, 9.5)).toBe(valueNoise(7, 3.25, 9.5));
    expect(valueNoise(7, 3.25, 9.5)).not.toBe(valueNoise(8, 3.25, 9.5));
    for (let i = 0; i < 500; i += 1) {
      const x = i * 0.37;
      const y = i * 0.11;
      const value = fractalNoise(3, x, y, { scale: 16, octaves: 4, persistence: 0.5 });
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      // Neighbouring samples stay close: no tearing between lattice cells.
      expect(Math.abs(valueNoise(3, x, y) - valueNoise(3, x + 0.01, y))).toBeLessThan(0.1);
    }
  });
});

describe('terrain', () => {
  it('is reproducible per seed and differs between seeds', () => {
    const a = generateWorld('TERRAIN', SMALL, DEFAULT_CONTENT).cells!;
    const b = generateWorld('TERRAIN', SMALL, DEFAULT_CONTENT).cells!;
    const c = generateWorld('OTHER', SMALL, DEFAULT_CONTENT).cells!;
    expect(a.elevation).toEqual(b.elevation);
    expect(a.elevation).not.toEqual(c.elevation);
  });

  it('hits the land fraction, keeps ocean at the map edge and spans sea to peaks', () => {
    for (const seed of ['A', 'B', 'C']) {
      const cells = generateWorld(seed, { ...SMALL, landFraction: 0.4 }, DEFAULT_CONTENT).cells!;
      expect(Math.abs(landShare(cells) - 0.4)).toBeLessThan(0.05);
      const { width, height, elevation } = cells;
      for (let x = 0; x < width; x += 1) {
        expect(elevation[x]).toBeLessThanOrEqual(0);
        expect(elevation[(height - 1) * width + x]).toBeLessThanOrEqual(0);
      }
      expect(Math.max(...elevation)).toBeGreaterThan(3000);
      expect(Math.min(...elevation)).toBeLessThan(-3000);
    }
  });

  it('raises the highest ground near plate boundaries', () => {
    const cells = generateWorld('RANGES', SMALL, DEFAULT_CONTENT).cells!;
    const { width, height, elevation, plate } = cells;
    const nearBoundary = (i: number) => {
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -6; dy <= 6; dy += 1) {
        for (let dx = -6; dx <= 6; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (plate[ny * width + nx] !== plate[i]) return true;
        }
      }
      return false;
    };
    const land = [...elevation.keys()].filter((i) => elevation[i]! > 0);
    const highest = land.sort((a, b) => elevation[b]! - elevation[a]!).slice(0, 50);
    const share = highest.filter(nearBoundary).length / highest.length;
    expect(share).toBeGreaterThan(0.7);
  });

  it('round-trips through a save with typed arrays intact', () => {
    const world = generateWorld('SAVE', { width: 48, height: 48 }, DEFAULT_CONTENT);
    const loaded = deserializeWorld(serializeWorld(world));
    expect(loaded.cells!.elevation).toBeInstanceOf(Int16Array);
    expect(loaded.cells!.elevation).toEqual(world.cells!.elevation);
    expect(loaded.cells!.plate).toEqual(world.cells!.plate);
    expect(loaded.cells!.rainfall).toBeInstanceOf(Uint16Array);
    expect(loaded.cells!.rainfall).toEqual(world.cells!.rainfall);
    expect(loaded.cells!.risk.snow).toEqual(world.cells!.risk.snow);
  });

  it('rejects unusable world parameters', () => {
    expect(() => generateWorld('BAD', { width: 8 }, DEFAULT_CONTENT)).toThrow(/size/);
    expect(() => generateWorld('BAD', { continents: 0 }, DEFAULT_CONTENT)).toThrow(/continents/);
    expect(() => generateWorld('BAD', { landFraction: 0.95 }, DEFAULT_CONTENT)).toThrow(/land/);
  });
});
