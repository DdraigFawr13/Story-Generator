import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  PathSearch,
  checkRoutes,
  checkSites,
  deserializeWorld,
  generateWorld,
  paintRoutes,
  planRoutes,
  serializeWorld,
  travelCosts,
  validateContent,
  type Region,
  type RegionKind,
  type RouteGraph,
  type WorldCells,
} from '../../src/engine';
import { gridFromAscii } from './helpers/grid-from-ascii';

const GRASS = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'grassland');
const ALPINE = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'alpine');

/** Fixture cells from ASCII elevation: sea is water 3, `rivers` are [x, y] river cells; high land is alpine. */
function fixture(rows: string[], rivers: [number, number][] = []) {
  const { width, height, elevation } = gridFromAscii(rows);
  const size = width * height;
  const water = new Uint8Array(size);
  const biome = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    if (elevation[i]! <= 0) water[i] = 3;
    else biome[i] = elevation[i]! >= 800 ? ALPINE : GRASS;
  }
  for (const [x, y] of rivers) water[y * width + x] = 1;
  return {
    width,
    height,
    elevation,
    water,
    biome,
    flowDir: new Int8Array(size).fill(-1),
    fertility: new Uint8Array(size),
  };
}

/** A region of one cell at (x, y). */
function spot(width: number, id: number, kind: RegionKind, x: number, y: number): Region {
  const cell = y * width + x;
  return { id, kind, name: `${kind} ${id}`, cells: [cell], anchor: cell };
}

/** The edge joining nodes at the two cells, whichever way round. */
function edgeBetween(routes: RouteGraph, from: number, to: number) {
  const ids = [from, to].map((cell) => routes.nodes.find((n) => n.cell === cell)!.id);
  return routes.edges.find((e) => !e.sea && e.a === Math.min(...ids) && e.b === Math.max(...ids));
}

describe('travel cost', () => {
  const rows = ['1111111', '1111111', '9999999', '9999999', '1111111', '1111111'];
  const cells = fixture(rows);

  it('costs mountains more than grassland, and sea little, lakes nothing', () => {
    const costs = travelCosts(cells, DEFAULT_CONTENT, []);
    expect(costs[2 * 7 + 3]!).toBeGreaterThan(costs[3]!);
    expect(costs[7 + 3]!).toBeGreaterThan(costs[3]!);
    const lake = { ...cells, water: cells.water.map((w, i) => (i === 3 ? 2 : w)) };
    expect(travelCosts(lake, DEFAULT_CONTENT, [])[3]).toBe(255);
    const sea = fixture(['~11']);
    expect(travelCosts(sea, DEFAULT_CONTENT, [])[0]).toBe(2);
  });

  it('makes a river dear to cross except at a ford, and halves the slope in a pass', () => {
    const river = fixture(
      ['11111', '11111', '11111'],
      [
        [2, 0],
        [2, 1],
        [2, 2],
      ],
    );
    const ford = spot(5, 1, 'ford', 2, 1);
    const costs = travelCosts(river, DEFAULT_CONTENT, [ford]);
    expect(costs[2]!).toBe(costs[1]! + 12);
    expect(costs[7]!).toBe(costs[6]!);
    const rise = fixture(['11111', '19991', '11111']);
    const plain = travelCosts(rise, DEFAULT_CONTENT, []);
    const pass = travelCosts(rise, DEFAULT_CONTENT, [spot(5, 1, 'pass', 1, 1)]);
    expect(pass[6]!).toBeLessThan(plain[6]!);
  });
});

describe('route graph on a fixture', () => {
  it('sends the land path through the pass in a ridge', () => {
    const rows = [
      '11111111',
      '11111111',
      '11111111',
      '11111111',
      '99919999',
      '99919999',
      '99919999',
      '11111111',
      '11111111',
      '11111111',
      '11111111',
    ];
    const cells = fixture(rows);
    const w = cells.width;
    const regions = [
      spot(w, 1, 'harbour', 3, 1),
      spot(w, 2, 'harbour', 3, 9),
      spot(w, 3, 'pass', 3, 5),
    ];
    const { routes, roads, travelCost } = planRoutes(cells, DEFAULT_CONTENT, regions);
    const edge = edgeBetween(routes, 1 * w + 3, 9 * w + 3)!;
    expect(edge).toBeDefined();
    expect(edge.path).toContain(5 * w + 3);
    // No cell of the ridge but the notch is walked.
    for (const cell of edge.path) {
      if (Math.floor(cell / w) >= 4 && Math.floor(cell / w) <= 6) expect(cell % w).toBe(3);
    }
    expect(roads[5 * w + 3]).toBeGreaterThan(0);
    expect(roads[5 * w + 0]).toBe(0);
    expect(travelCost[5 * w + 0]!).toBeGreaterThan(travelCost[5 * w + 3]!);
  });

  it('crosses a river at its ford', () => {
    const rows = Array.from({ length: 5 }, () => '111111111');
    const river: [number, number][] = [0, 1, 2, 3, 4].map((y) => [4, y]);
    const cells = fixture(rows, river);
    const w = cells.width;
    const regions = [
      spot(w, 1, 'harbour', 1, 2),
      spot(w, 2, 'harbour', 7, 2),
      spot(w, 3, 'ford', 4, 0),
    ];
    const { routes } = planRoutes(cells, DEFAULT_CONTENT, regions);
    const edge = edgeBetween(routes, 2 * w + 1, 2 * w + 7)!;
    expect(edge).toBeDefined();
    expect(edge.path.filter((c) => cells.water[c] === 1)).toEqual([4]);
  });

  it('links harbours across the sea with a lane that is not a road', () => {
    const cells = fixture(['1~~~~~1', '1~~~~~1', '1~~~~~1']);
    const w = cells.width;
    const { routes, roads } = planRoutes(cells, DEFAULT_CONTENT, [
      spot(w, 1, 'harbour', 0, 1),
      spot(w, 2, 'harbour', 6, 1),
    ]);
    const lane = routes.edges.find((e) => e.sea)!;
    expect(lane.path.slice(1, -1).every((c) => cells.water[c] === 3)).toBe(true);
    expect(roads.every((v) => v === 0)).toBe(true);
    const pixels = new Uint8ClampedArray(w * 3 * 4);
    paintRoutes(pixels, w, { roads }, routes);
    expect(pixels[(1 * w + 3) * 4 + 2]).toBe(250);
    expect(pixels[(1 * w + 0) * 4]).toBe(0);
  });
});

describe('path search', () => {
  const rows = ['111~111', '111~111', '111~111'];
  const cells = fixture(rows);
  const cost = new Uint8Array(cells.width * cells.height).fill(2);
  const land = cells.water.map((w) => (w === 0 ? 1 : 0));
  const budget = { expansions: 1000, costPerDistance: 40 };

  it('finds the cheapest path and reports null for an unreachable island', () => {
    const search = new PathSearch(7, 3, cost, land, 1000);
    expect(search.find(0, 2, budget)).toEqual({ path: [0, 1, 2], cost: 4 });
    expect(search.find(0, 6, budget)).toBeNull();
  });

  it('gives up past its expansion or cost budget', () => {
    const open = new Uint8Array(40).fill(1);
    const flat = new Uint8Array(40).fill(2);
    const search = new PathSearch(40, 1, flat, open, 1000);
    expect(search.find(0, 39, budget)?.path).toHaveLength(40);
    expect(search.find(0, 39, { expansions: 10, costPerDistance: 40 })).toBeNull();
    expect(search.find(0, 39, { expansions: 1000, costPerDistance: 1 })).toBeNull();
  });
});

describe('content', () => {
  it('needs a travel cost of at least 1 on land biomes', () => {
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
    const bad = {
      ...DEFAULT_CONTENT,
      biomes: DEFAULT_CONTENT.biomes.map((b) => (b.id === 'grassland' ? { ...b, travel: 0 } : b)),
    };
    expect(validateContent(bad).join(' ')).toMatch(/grassland: travel/);
  });
});

describe('generated routes', () => {
  const world = generateWorld('S1', { width: 128, height: 128 }, DEFAULT_CONTENT);
  const cells = world.cells as WorldCells;
  const { nodes, edges } = world.routes;

  it('passes the route checker', () => {
    expect(nodes.length).toBeGreaterThan(5);
    expect(edges.length).toBeGreaterThan(5);
    expect(checkRoutes(cells, world.routes)).toEqual([]);
    expect(checkSites(world)).toEqual([]);
  });

  it('walks contiguous land paths from node to node, avoiding sea and lakes', () => {
    for (const edge of edges.filter((e) => !e.sea)) {
      expect(edge.path[0]).toBe(nodes[edge.a]!.cell);
      expect(edge.path[edge.path.length - 1]).toBe(nodes[edge.b]!.cell);
      edge.path.forEach((cell, k) => {
        expect(cells.water[cell] === 0 || cells.water[cell] === 1).toBe(true);
        if (k === 0) return;
        const p = edge.path[k - 1]!;
        const dx = Math.abs((cell % 128) - (p % 128));
        const dy = Math.abs(Math.floor(cell / 128) - Math.floor(p / 128));
        expect(Math.max(dx, dy)).toBe(1);
      });
    }
  });

  it('connects most nodes on each landmass', () => {
    const root = nodes.map((n) => n.id);
    const find = (n: number): number => (root[n] === n ? n : (root[n] = find(root[n]!)));
    for (const e of edges) if (!e.sea) root[find(e.a)] = find(e.b);
    let linked = 0;
    let counted = 0;
    for (const mass of new Set(nodes.map((n) => n.landmass))) {
      const members = nodes.filter((n) => n.landmass === mass);
      if (members.length < 2) continue;
      const sizes = new Map<number, number>();
      for (const n of members) sizes.set(find(n.id), (sizes.get(find(n.id)) ?? 0) + 1);
      linked += Math.max(...sizes.values());
      counted += members.length;
    }
    expect(linked / counted).toBeGreaterThanOrEqual(0.8);
  });

  it('survive a save', () => {
    const loaded = deserializeWorld(serializeWorld(world));
    expect(loaded.routes).toEqual(world.routes);
    expect(loaded.cells!.roads).toBeInstanceOf(Uint8Array);
    expect(loaded.cells!.roads).toEqual(cells.roads);
    expect(loaded.cells!.travelCost).toEqual(cells.travelCost);
  });
});
