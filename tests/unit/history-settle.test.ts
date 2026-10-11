import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  checkSites,
  computeTerritory,
  createWorld,
  generateWorld,
  popBands,
  serializeWorld,
  settleWorld,
  siteCapacity,
  siteFeatures,
  suitability,
  buildSettlePlaces,
  type CultureDef,
  type SettleContent,
  type WorldCells,
  type WorldState,
} from '../../src/engine';
import { gridFromAscii } from './helpers/grid-from-ascii';

const GRASS = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'grassland');
const FISH = DEFAULT_CONTENT.resources.findIndex((r) => r.id === 'fish');
const RULES = DEFAULT_CONTENT.settlement;
const BIOME_IDS = DEFAULT_CONTENT.biomes.map((b) => b.id);
const HUMAN = DEFAULT_CONTENT.races.find((r) => r.id === 'human')!;

/** A river-loving culture with no biome preference, so only the land decides. */
const RIVER_FOLK: CultureDef = {
  ...DEFAULT_CONTENT.cultures.find((c) => c.id === 'gwerin')!,
  preferredBiomes: [],
  sitePreferences: ['river'],
};

/**
 * Fixture cells from ASCII: `~` sea, `.` dry grassland (fertility 10), `r` river, `f` floodplain
 * (fertility 80). Everything else a model of WorldCells needs is flat and empty.
 */
function fixture(rows: string[]): WorldCells {
  const { width, height, elevation } = gridFromAscii(rows.map((row) => row.replace(/[.rf]/g, '1')));
  const size = width * height;
  const cells = {
    width,
    height,
    elevation,
    water: new Uint8Array(size),
    floodplain: new Uint8Array(size),
    biome: new Uint8Array(size).fill(GRASS),
    fertility: new Uint8Array(size),
    aura: new Uint8Array(size),
    auraSpots: [],
    resources: new Map(),
    travelCost: new Uint8Array(size).fill(2),
    roads: new Uint8Array(size),
    territory: new Uint16Array(size),
  };
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const ch = row[x];
      if (ch === '~') cells.water[i] = 3;
      else if (ch === 'r') cells.water[i] = 1;
      else if (ch === 'f') cells.floodplain[i] = 1;
      cells.fertility[i] = ch === 'f' ? 80 : ch === '.' ? 10 : 0;
    }
  });
  return cells as unknown as WorldCells;
}

const NO_PLACES = (cells: WorldCells) => buildSettlePlaces(cells, [], { nodes: [], edges: [] });

describe('suitability and placement', () => {
  const rows = [
    '...........',
    '...ffrff...',
    '...ffrff...',
    '...ffrff...',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
    '...........',
  ];
  const cells = fixture(rows);
  const places = NO_PLACES(cells);
  const at = (x: number, y: number) => y * cells.width + x;
  const score = (x: number, y: number) =>
    suitability(
      cells,
      at(x, y),
      RIVER_FOLK,
      siteFeatures(cells, at(x, y), places, DEFAULT_CONTENT),
      RULES,
      BIOME_IDS,
    );

  it('scores a fertile floodplain beside a river above dry fertile-less land', () => {
    expect(siteFeatures(cells, at(4, 2), places, DEFAULT_CONTENT)).toEqual(
      expect.arrayContaining(['river', 'floodplain']),
    );
    expect(siteFeatures(cells, at(1, 8), places, DEFAULT_CONTENT)).not.toContain('river');
    expect(score(4, 2)).toBeGreaterThan(score(1, 8) + 30);
  });

  it('puts the capital of a river culture by the river in a full settle stage', () => {
    // The stage reads the grid size from the cells, not the params.
    const world = createWorld('FIX', { width: 32, height: 32 });
    world.cells = cells;
    const content: SettleContent = {
      ...DEFAULT_CONTENT,
      cultures: [RIVER_FOLK],
      settlement: {
        ...RULES,
        civs: { min: 1, max: 1, landCellsPerCiv: 1 },
        secondSiteChance: 0,
      },
    };
    settleWorld(world, content);
    expect(world.civs.size).toBe(1);
    const capital = [...world.sites.values()][0]!;
    expect(Math.abs((capital.cell % cells.width) - 5)).toBeLessThanOrEqual(2);
    expect(capital.features).toContain('river');
    expect(world.events.map((e) => e.type)).toEqual(['civ_founded']);
    expect(cells.territory[capital.cell]).toBe(1);
  });
});

describe('population and capacity', () => {
  it('splits a population into bands that sum to the total and follow the race shares', () => {
    for (const race of DEFAULT_CONTENT.races) {
      for (const total of [20, 37, 150, 300]) {
        const bands = popBands(total, race, { id: 'x' }, RULES);
        expect(bands.map((b) => b.band)).toEqual(['child', 'adult', 'elder']);
        expect(bands.reduce((n, b) => n + b.count, 0)).toBe(total);
        expect(bands.every((b) => Number.isInteger(b.count) && b.count >= 0)).toBe(true);
      }
    }
    const [child, adult, elder] = popBands(1000, HUMAN, { id: 'x' }, RULES);
    expect(child!.count).toBe(Math.round((1000 * HUMAN.maturityYears * 1.5) / HUMAN.lifespanYears));
    expect(elder!.count).toBe(100);
    expect(adult!.count).toBe(1000 - child!.count - elder!.count);
  });

  it('grows capacity with fertility and with a harbour, and shrinks it with hunger', () => {
    const poor = fixture([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ]);
    const rich = fixture([
      'fffffff',
      'fffffff',
      'fffffff',
      'fffffff',
      'fffffff',
      'fffffff',
      'fffffff',
    ]);
    const cell = 3 * 7 + 3;
    const cap = (c: WorldCells, features: Parameters<typeof siteCapacity>[4], race = HUMAN) =>
      siteCapacity(c, cell, race, DEFAULT_CONTENT, features);
    expect(cap(rich, [])).toBeGreaterThan(cap(poor, []));
    expect(cap(poor, ['harbour'])).toBeGreaterThan(cap(poor, []));
    expect(cap(poor, [], { ...HUMAN, foodNeed: 2 })).toBeLessThan(cap(poor, []));
    rich.resources.set(cell + 1, [{ resource: FISH, amount: 50 }]);
    expect(cap(rich, [])).toBeGreaterThan(
      cap(
        fixture(['fffffff', 'fffffff', 'fffffff', 'fffffff', 'fffffff', 'fffffff', 'fffffff']),
        [],
      ),
    );
  });
});

describe('territory', () => {
  it('goes to the nearer site by travel cost, never over sea, and stops at the reach', () => {
    const cells = fixture(['.....~.....', '.....~.....', '.....~.....']);
    const sites = [
      { id: 1, cell: 1, civId: 1 },
      { id: 2, cell: 9, civId: 2 },
    ];
    const t = computeTerritory(cells, sites, 6);
    expect(t[0]).toBe(1);
    expect(t[1]).toBe(1);
    expect(t[9]).toBe(2);
    expect(t[5]).toBe(0);
    expect(t[11 + 4]).toBe(1);
    // Reach 4 at cost 2 per cell is 2 cells: cell 4, three away, is unclaimed.
    expect(computeTerritory(cells, [sites[0]!], 4)[4]).toBe(0);
  });
});

describe('generated settlement', () => {
  const world = generateWorld('S1', { width: 128, height: 128 }, DEFAULT_CONTENT);

  it('passes the site checker: nothing in sea, lakes or rivers; 1-2 sites per civ', () => {
    expect(checkSites(world)).toEqual([]);
    expect(world.civs.size).toBeGreaterThanOrEqual(3);
    expect(world.civs.size).toBeLessThanOrEqual(8);
    const cells = world.cells!;
    for (const site of world.sites.values()) expect(cells.water[site.cell]).toBe(0);
  });

  it('emits a founding event per civ, and the second site names it as its cause', () => {
    const founded = world.events.filter((e) => e.type === 'civ_founded');
    expect(founded).toHaveLength(world.civs.size);
    for (const event of world.events.filter((e) => e.type === 'site_founded')) {
      expect(founded.map((e) => e.id)).toContain(event.causes[0]);
    }
  });

  it('is deterministic for a seed', () => {
    const again = generateWorld('S1', { width: 128, height: 128 }, DEFAULT_CONTENT);
    expect(serializeWorld(again)).toBe(serializeWorld(world));
    const other: WorldState = generateWorld('S2', { width: 128, height: 128 }, DEFAULT_CONTENT);
    expect([...other.sites.values()].map((s) => s.cell)).not.toEqual(
      [...world.sites.values()].map((s) => s.cell),
    );
  });
});
