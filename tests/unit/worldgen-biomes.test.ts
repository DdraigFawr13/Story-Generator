import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_RULES, DEFAULT_CONTENT, RESOURCES } from '../../src/content';
import {
  checkWorldCells,
  classifyBiomes,
  deserializeWorld,
  generateWorld,
  serializeWorld,
  validateContent,
  worldDigest,
  type WorldCells,
} from '../../src/engine';

const SMALL = { width: 96, height: 96 };
const index = (id: string) => BIOMES.findIndex((b) => b.id === id);
const SEEDS = ['A', 'B', 'C', 'D', 'E'];
const MEDIUM = { width: 128, height: 128 };
const worlds = SEEDS.map((seed) => generateWorld(seed, MEDIUM, DEFAULT_CONTENT).cells!);

describe('biome content', () => {
  it('has a complete table of known biomes and passes validation', () => {
    expect(BIOME_RULES.table).toHaveLength(BIOME_RULES.temperatureBands.length + 1);
    for (const row of BIOME_RULES.table) {
      expect(row).toHaveLength(BIOME_RULES.rainfallBands.length + 1);
      for (const id of row) expect(index(id)).toBeGreaterThanOrEqual(0);
    }
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
    expect(BIOMES[0]!.id).toBe('ocean');
    expect(BIOMES[1]!.id).toBe('coast');
  });

  it('reports an unknown biome in the table', () => {
    const bad = {
      ...DEFAULT_CONTENT,
      biomeRules: { ...BIOME_RULES, table: BIOME_RULES.table.map((r) => r.map(() => 'nope')) },
    };
    expect(validateContent(bad).join('\n')).toMatch(/unknown biome "nope"/);
  });
});

describe('classifyBiomes', () => {
  // 6x1 strip: deep sea, sea, land, land, land, land.
  const water = [3, 3, 0, 0, 0, 0];
  const classify = (summer: number, winter: number, rain: number, metres = 100) =>
    classifyBiomes(
      6,
      1,
      [-100, -10, metres, metres, metres, metres],
      [summer, summer, summer, summer, summer, summer],
      [winter, winter, winter, winter, winter, winter],
      [rain, rain, rain, rain, rain, rain],
      water,
      [0, 0, 0, 0, 0, 0],
      DEFAULT_CONTENT,
    );

  it('makes sea next to land coast and the rest ocean', () => {
    const wide = classifyBiomes(
      8,
      1,
      [-1, -1, -1, -1, -1, -1, 5, 5],
      new Array(8).fill(20),
      new Array(8).fill(10),
      new Array(8).fill(500),
      [3, 3, 3, 3, 3, 3, 0, 0],
      new Array(8).fill(0),
      DEFAULT_CONTENT,
    );
    expect(wide[0]).toBe(index('ocean'));
    expect(wide[5]).toBe(index('coast'));
    expect(wide[4]).toBe(index('coast'));
    expect(wide[3]).toBe(index('ocean'));
  });

  it('assigns alpine, jungle and tundra', () => {
    expect(classify(20, 5, 500, 3500)[3]).toBe(index('alpine'));
    expect(classify(32, 24, 2000)[3]).toBe(index('jungle'));
    expect(classify(2, -20, 100)[3]).toBe(index('tundra'));
  });

  it('keeps frost-free biomes out of cold winters', () => {
    expect(classify(34, 4, 2000)[3]).toBe(index('temperate-forest'));
  });
});

describe('generated habitat, resources and aura', () => {
  it('accepts every world and round-trips a save with the same hash', () => {
    for (const cells of worlds) expect(checkWorldCells(cells)).toEqual([]);
    const world = generateWorld('SAVE', { width: 48, height: 48 }, DEFAULT_CONTENT);
    const loaded = deserializeWorld(serializeWorld(world));
    expect(worldDigest(loaded)).toBe(worldDigest(world));
    expect(loaded.cells!.resources).toBeInstanceOf(Map);
    expect(loaded.cells!.biome).toBeInstanceOf(Uint8Array);
  });

  it('is deterministic per seed', () => {
    const again = generateWorld('A', MEDIUM, DEFAULT_CONTENT).cells!;
    for (const key of ['biome', 'volcano', 'aura', 'fertility', 'wildness'] as const) {
      expect(again[key]).toEqual(worlds[0]![key]);
    }
    expect(again.resources).toEqual(worlds[0]!.resources);
    expect(again.auraSpots).toEqual(worlds[0]!.auraSpots);
  });

  it('makes floodplains more fertile than nearby uplands', () => {
    let flood = 0;
    let floodCount = 0;
    let near = 0;
    let nearCount = 0;
    for (const c of worlds) {
      const { width, height } = c;
      for (let i = 0; i < width * height; i += 1) {
        if (!c.floodplain[i] || c.water[i] !== 0) continue;
        flood += c.fertility[i]!;
        floodCount += 1;
        const x = i % width;
        const y = (i - x) / width;
        for (let dy = -5; dy <= 5; dy += 1) {
          for (let dx = -5; dx <= 5; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (c.water[n] === 0 && !c.floodplain[n]) {
              near += c.fertility[n]!;
              nearCount += 1;
            }
          }
        }
      }
    }
    expect(flood / floodCount).toBeGreaterThan(near / nearCount);
  });

  it('places every resource on most seeds, never too widely, rare ones under their cap', () => {
    RESOURCES.forEach((resource, r) => {
      let seeds = 0;
      for (const c of worlds) {
        let cells = 0;
        let base = 0;
        for (let i = 0; i < c.width * c.height; i += 1) if (c.water[i] !== 3) base += 1;
        for (const list of c.resources.values()) if (list.some((d) => d.resource === r)) cells += 1;
        if (cells > 0) seeds += 1;
        if (!resource.aquatic) {
          expect(cells / base).toBeLessThan(0.25);
          expect(cells / base).toBeLessThanOrEqual(resource.maxCellShare);
        }
      }
      expect(seeds, resource.id).toBeGreaterThanOrEqual(3);
    });
  });

  it('puts volcanoes on continental plates and hot springs beside them', () => {
    let volcanoes = 0;
    for (const c of worlds) {
      const cells = [...c.volcano.keys()].filter((i) => c.volcano[i]);
      volcanoes += cells.length;
      for (const i of cells) expect(c.plates[c.plate[i]!]!.continental).toBe(true);
      for (const spot of c.auraSpots.filter((s) => s.kind === 'hot-spring')) {
        const near = cells.some(
          (v) =>
            Math.max(
              Math.abs((v % c.width) - (spot.cell % c.width)),
              Math.abs(Math.floor(v / c.width) - Math.floor(spot.cell / c.width)),
            ) <= 3,
        );
        expect(near).toBe(true);
      }
    }
    expect(volcanoes).toBeGreaterThan(0);
  });

  it('keeps background aura low and gives each seed a strong spot', () => {
    for (const c of worlds as WorldCells[]) {
      const land: number[] = [];
      for (let i = 0; i < c.width * c.height; i += 1) if (c.water[i] !== 3) land.push(c.aura[i]!);
      land.sort((a, b) => a - b);
      expect(land[land.length >> 1]!).toBeLessThanOrEqual(15);
      expect(c.auraSpots.some((s) => s.aura >= 70)).toBe(true);
    }
  });

  it('flags layers out of range', () => {
    const c = generateWorld('A', SMALL, DEFAULT_CONTENT).cells!;
    const broken = { ...c, fertility: c.fertility.slice() };
    broken.fertility[7] = 200;
    expect(checkWorldCells(broken).join('\n')).toMatch(/fertility\[7\] = 200/);
  });
});
