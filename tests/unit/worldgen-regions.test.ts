import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  RngStream,
  buildRegions,
  checkRegions,
  deserializeWorld,
  generateWorld,
  landmasses,
  paintRegions,
  saddleAxis,
  serializeWorld,
  type Region,
  type WorldCells,
} from '../../src/engine';
import { gridFromAscii } from './helpers/grid-from-ascii';

/** Fixture cells from ASCII elevation: sea is water 3, land water 0; `rivers` are [x, y] cells flowing south. */
function fixture(rows: string[], scale = 100, rivers: [number, number][] = []): WorldCells {
  const { width, height, elevation } = gridFromAscii(rows, scale);
  const size = width * height;
  const water = new Uint8Array(size);
  const flowDir = new Int8Array(size).fill(-1);
  const flow = new Uint32Array(size);
  for (let i = 0; i < size; i += 1) if (elevation[i]! <= 0) water[i] = 3;
  for (const [x, y] of rivers) {
    water[y * width + x] = 1;
    flowDir[y * width + x] = 4; // south
    flow[y * width + x] = y + 1;
  }
  return {
    width,
    height,
    elevation,
    water,
    flowDir,
    flow,
    biome: new Uint8Array(size),
    volcano: new Uint8Array(size),
    fertility: new Uint8Array(size),
  } as unknown as WorldCells;
}

function regionsOf(cells: WorldCells): Region[] {
  return buildRegions(cells, DEFAULT_CONTENT, RngStream.detached('T', 'worldgen.names'));
}

describe('passes', () => {
  const cells = fixture([
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
    '999955999999',
    '000000000000',
    '000000000000',
    '000000000000',
    '000000000000',
  ]);

  it('finds the notch in a ridge, lower than the ridge on both sides', () => {
    const passes = regionsOf(cells).filter((r) => r.kind === 'pass');
    expect(passes).toHaveLength(1);
    const pass = passes[0]!;
    expect(pass.cells).toEqual([52, 53]);
    expect(pass.anchor).toBe(52);
    const axis = saddleAxis(cells, pass.anchor, 150);
    expect(axis).toBe(1);
    const row = 4 * cells.width;
    expect(Math.max(...[0, 1, 2, 3].map((x) => cells.elevation[row + x]!))).toBeGreaterThan(
      cells.elevation[pass.anchor]! + 150,
    );
    expect(Math.max(...[6, 7, 8, 9].map((x) => cells.elevation[row + x]!))).toBeGreaterThan(
      cells.elevation[pass.anchor]! + 150,
    );
  });

  it('does not call flat ridge cells passes', () => {
    expect(saddleAxis(cells, 4 * cells.width + 1, 60)).toBe(-1);
    expect(saddleAxis(cells, 4 * cells.width + 9, 60)).toBe(-1);
  });
});

describe('harbours', () => {
  it('puts a harbour on land that touches the sea', () => {
    const cells = fixture([
      '~~~~~~000000',
      '~~~~~~000000',
      '~~~~~~000000',
      '~~~~~~000000',
      '~~~~~~~~0000',
      '~~~~~~~~0000',
      '~~~~~~000000',
      '~~~~~~000000',
      '~~~~~~000000',
      '~~~~~~000000',
    ]);
    const regions = regionsOf(cells);
    const harbours = regions.filter((r) => r.kind === 'harbour');
    expect(harbours.length).toBeGreaterThan(0);
    for (const harbour of harbours) {
      expect(cells.water[harbour.anchor]).toBe(0);
      expect(harbour.cells.some((c) => cells.water[c] === 3)).toBe(true);
    }
    expect(checkRegions(cells, regions)).toEqual([]);
  });
});

describe('straits', () => {
  it('finds a narrow channel between two landmasses', () => {
    const cells = fixture(Array.from({ length: 7 }, () => '555555~~555555'));
    const masses = landmasses(cells);
    expect(masses[0]).not.toBe(masses[13]);
    const straits = regionsOf(cells).filter((r) => r.kind === 'strait');
    expect(straits).toHaveLength(1);
    expect(straits[0]!.cells).toEqual([3 * 14 + 6, 3 * 14 + 7]);
  });
});

describe('fords', () => {
  it('puts a ford on a shallow river and names it after the river', () => {
    const rivers: [number, number][] = [0, 1, 2, 3, 4, 5, 6, 7].map((y) => [5, y]);
    const rows = Array.from({ length: 8 }, () => '222222222222');
    rows.push('~~~~~~~~~~~~');
    const cells = fixture(rows, 10, rivers);
    const regions = regionsOf(cells);
    const ford = regions.find((r) => r.kind === 'ford')!;
    const river = regions.find((r) => r.kind === 'river')!;
    expect(ford).toBeDefined();
    expect(cells.water[ford.anchor]).toBe(1);
    expect(river.cells).toHaveLength(8);
    const stem = ford.name.split(' ')[0]!;
    expect(river.name).toContain(stem);
    expect(checkRegions(cells, regions)).toEqual([]);
  });
});

describe('generated worlds', () => {
  const world = generateWorld('S1', { width: 128, height: 128 }, DEFAULT_CONTENT);
  const regions = [...world.regions.values()];

  it('are sound, numbered 1..n and uniquely named', () => {
    expect(checkRegions(world.cells!, regions)).toEqual([]);
    expect(regions.map((r) => r.id)).toEqual(regions.map((_, n) => n + 1));
    expect(new Set(regions.map((r) => r.name)).size).toBe(regions.length);
    expect(regions.every((r) => r.name.length <= 28)).toBe(true);
    expect(regions.some((r) => r.kind === 'pass')).toBe(true);
    expect(regions.some((r) => r.kind === 'harbour')).toBe(true);
  });

  it('are deterministic', () => {
    const again = generateWorld('S1', { width: 128, height: 128 }, DEFAULT_CONTENT);
    expect(JSON.stringify([...again.regions.values()])).toBe(JSON.stringify(regions));
  });

  it('survive a save round trip', () => {
    const loaded = deserializeWorld(serializeWorld(world));
    expect(loaded.regions).toEqual(world.regions);
    expect(loaded.regions.size).toBe(regions.length);
  });

  it('give every 256x256 seed S1-S5 a pass and a harbour', () => {
    for (const seed of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      // Regions are worldgen only; history never changes them, so the 250 years are skipped.
      const w = generateWorld(seed, { historyYears: 0 }, DEFAULT_CONTENT);
      const list = [...w.regions.values()];
      expect(checkRegions(w.cells!, list), seed).toEqual([]);
      expect(
        list.some((r) => r.kind === 'pass'),
        `${seed} pass`,
      ).toBe(true);
      expect(
        list.some((r) => r.kind === 'harbour'),
        `${seed} harbour`,
      ).toBe(true);
    }
  }, 30_000);
});

describe('checkRegions', () => {
  it('reports a pass on flat ground, a repeated name and a ford off the river', () => {
    const cells = fixture(['0000', '0000']);
    const make = (id: number, kind: Region['kind'], name: string): Region => ({
      id,
      kind,
      name,
      cells: [0],
      anchor: 0,
    });
    const problems = checkRegions(cells, [make(1, 'pass', 'A'), make(2, 'ford', 'A')]).join('\n');
    expect(problems).toMatch(/not lower than a ridge/);
    expect(problems).toMatch(/used twice/);
    expect(problems).toMatch(/not a river cell/);
  });
});

describe('paintRegions', () => {
  it('paints features and darkens ranges', () => {
    const pixels = new Uint8ClampedArray(2 * 4).fill(200);
    paintRegions(pixels, 2, [
      { id: 1, kind: 'range', name: 'R', cells: [0], anchor: 0 },
      { id: 2, kind: 'pass', name: 'P', cells: [1], anchor: 1 },
    ]);
    expect([...pixels.slice(0, 3)]).toEqual([160, 160, 160]);
    expect([...pixels.slice(4, 7)]).toEqual([235, 30, 30]);
  });
});
