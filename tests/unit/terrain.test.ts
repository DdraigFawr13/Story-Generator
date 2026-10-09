import { describe, expect, it } from 'vitest';
import { digestCanonical } from '../../src/adapters/crypto';
import {
  generateGeography,
  MAP_HEIGHT,
  MAP_WIDTH,
  prepareFounding,
  terrainFixture,
  type Tile,
} from '../../src/sim/terrain';
import { createFoundingSnapshot, validateFoundingSnapshot } from '../../src/sim/founding';
import { FoundingController } from '../../src/controller/founding';
import { deriveStream } from '../../src/sim/seed';
import terrainVectors from '../fixtures/terrain.json';

function waterIndices(tiles: readonly Tile[]) {
  return tiles.flatMap((tile, index) => (tile[2] === 'water' ? [index] : []));
}
function connectedWater(tiles: readonly Tile[]) {
  const water = new Set(waterIndices(tiles));
  const first = water.values().next().value;
  if (first === undefined) return false;
  const seen = new Set([first]),
    queue = [first];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]!,
      x = index % MAP_WIDTH,
      y = Math.floor(index / MAP_WIDTH);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nx = x + dx,
        ny = y + dy,
        next = ny * MAP_WIDTH + nx;
      if (
        nx >= 0 &&
        nx < MAP_WIDTH &&
        ny >= 0 &&
        ny < MAP_HEIGHT &&
        water.has(next) &&
        !seen.has(next)
      ) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === water.size;
}

describe('Python terrain contract port', () => {
  it('matches the exact RIVERSIDE digest and post-generation state', async () => {
    const fixture = terrainFixture('RIVERSIDE');
    expect(await digestCanonical(fixture)).toBe(
      '07a68eb6bb14a59ac536def9ac133478774970d059b49e1da5406d48be7268eb',
    );
    expect(fixture.terrainRng).toBe(2847659418);
    expect(fixture.center).toBe(1327);
    expect(fixture.tiles.filter((tile) => tile[3] > 0)).toHaveLength(1056);
  });
  it('reproduces the full fixed 100-seed battery', async () => {
    const maps = new Set<string>(),
      centers = new Set<number>(),
      forests: number[] = [];
    let fallbacks = 0;
    for (const { seed, digest, center, terrainRng } of terrainVectors) {
      const raw = generateGeography(seed),
        fixture = terrainFixture(seed);
      expect(await digestCanonical(fixture)).toBe(digest);
      expect(fixture.center).toBe(center);
      expect(fixture.terrainRng).toBe(terrainRng);
      expect(fixture).toEqual(terrainFixture(seed));
      expect(connectedWater(fixture.tiles)).toBe(true);
      expect(waterIndices(fixture.tiles)).toHaveLength(120);
      expect(waterIndices(fixture.tiles)).toEqual(waterIndices(raw.tiles));
      expect(
        fixture.river.every(
          (x, index) => index === 0 || Math.abs(x - fixture.river[index - 1]!) <= 1,
        ),
      ).toBe(true);
      for (const [tile, kind] of fixture.buildings) {
        expect(fixture.tiles[tile]!.slice(2)).toEqual(['grass', 0]);
        if (kind === 'field') expect(fixture.tiles[tile]![1]).toBeGreaterThanOrEqual(50);
      }
      expect(fixture.buildings.filter(([, kind]) => kind === 'field')).toHaveLength(2);
      expect(fixture.buildings.filter(([, kind]) => kind === 'hut')).toHaveLength(6);
      expect(fixture.buildings.filter(([, kind]) => kind === 'store')).toHaveLength(1);
      expect(
        raw.tiles.reduce((sum, tile) => sum + tile[3], 0) -
          fixture.tiles.reduce((sum, tile) => sum + tile[3], 0),
      ).toBe(fixture.clearedTimber);
      expect(fixture.terrainRng).toBe(raw.terrainRng);
      maps.add(await digestCanonical(fixture.tiles));
      centers.add(fixture.center);
      forests.push(fixture.tiles.filter((tile) => tile[3] > 0).length);
      fallbacks += Number(fixture.fallback);
    }
    expect(maps.size).toBe(100);
    expect(centers.size).toBe(72);
    expect(fallbacks).toBe(0);
    expect([Math.min(...forests), Math.max(...forests)]).toEqual([481, 1429]);
  });
  it('preserves the river under forced fallback and rejects all-water input', () => {
    const raw = generateGeography('RIVERSIDE');
    const forced: Tile[] = raw.tiles.map((tile) =>
      tile[2] === 'water' ? tile : [90, 0, 'rock', 0],
    );
    const before = JSON.stringify(forced),
      found = prepareFounding(forced);
    expect(found.fallback).toBe(true);
    expect(found.buildings).toHaveLength(9);
    expect(waterIndices(found.tiles)).toEqual(waterIndices(forced));
    expect(connectedWater(found.tiles)).toBe(true);
    expect(JSON.stringify(forced)).toBe(before);
    expect(() =>
      prepareFounding(Array.from({ length: 2560 }, (): Tile => [0, 0, 'water', 0])),
    ).toThrow('no dry founding patch');
  });
  it('uses deterministic anchor/index ties when an injected map has no water', () => {
    const fixture = prepareFounding(Array.from({ length: 2560 }, (): Tile => [50, 70, 'grass', 0]));
    expect(fixture.center).toBe(20 * 64 + 32);
    expect(fixture.fallback).toBe(false);
    expect(fixture.buildings.slice(0, 3).map(([, kind]) => kind)).toEqual([
      'field',
      'field',
      'store',
    ]);
    expect(() => prepareFounding([])).toThrow('dimensions');
  });
});

describe('founding state and controller publication', () => {
  it('records stable identities, explicit clearing and untouched other RNG streams', () => {
    const world = createFoundingSnapshot('RIVERSIDE');
    expect(world.allocators).toEqual({ entity: 11, event: 2 });
    expect(world.world.entities.map((entity) => entity.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(
      world.world.buildings.every(
        (building, index) => building.id === index + 2 && building.creationEventId === 1,
      ),
    ).toBe(true);
    expect(world.rng.weather.state).toBe(deriveStream('RIVERSIDE', 'weather'));
    expect(world.rng.demographics.state).toBe(deriveStream('RIVERSIDE', 'demographics'));
    expect(world.world.settlement).toMatchObject({
      population: 24,
      households: 6,
      food: 360,
      timber: 40,
      health: 100,
    });
    expect(Object.isFrozen(world.world.map.tiles[0])).toBe(true);
    expect(() => validateFoundingSnapshot(JSON.parse(JSON.stringify(world)))).not.toThrow();
    expect(() => validateFoundingSnapshot({ ...world, schemaVersion: 2 })).toThrow();
    expect(() =>
      validateFoundingSnapshot({
        ...world,
        rng: { ...world.rng, terrain: { algorithm: 'xorshift32-v1', state: 1 } },
      }),
    ).toThrow();
    let invoked = false;
    expect(() =>
      validateFoundingSnapshot({
        get seed() {
          invoked = true;
          return 'RIVERSIDE';
        },
      }),
    ).toThrow();
    expect(invoked).toBe(false);
  });
  it('retains the prior world/view when generation or admission fails', () => {
    const controller = new FoundingController();
    const old = controller.snapshot,
      view = controller.view;
    expect(() => controller.generate('bad seed')).toThrow();
    expect(controller.snapshot).toBe(old);
    expect(controller.view).toBe(view);
    expect(controller.generate('RIVERSIDE')).toEqual(view);
    expect(
      () => new FoundingController('RIVERSIDE', { maxEvents: 0, maxBytes: 16_777_216 }),
    ).toThrow('event-limit');
    expect(() => new FoundingController('RIVERSIDE', { maxEvents: 50_000, maxBytes: 10 })).toThrow(
      'payload-limit',
    );
  });
});
