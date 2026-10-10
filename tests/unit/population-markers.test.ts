import { expect, it } from 'vitest';
import {
  populationMarkers,
  POPULATION_MARKER_LIMIT,
} from '../../src/controller/population-markers';
import { canonicalJson } from '../../src/sim/canonical';
import { createSettlement } from '../../src/sim/settlement-initial';
import { simulateSettlement } from '../../src/sim/settlement';
import type { SettlementSnapshot } from '../../src/sim/state';
import type { Tile } from '../../src/sim/terrain';

function mapView(snapshot: SettlementSnapshot) {
  const { world } = snapshot;
  return {
    ...world.map,
    buildings: world.buildings,
    settlement: world.settlement,
    project: world.project,
  };
}

it('represents all founders on dry open ground or huts for 100 seeds without changing history', () => {
  const seeds = [
    'RIVERSIDE',
    ...Array.from({ length: 99 }, (_, i) => `TERRAIN_${String(i).padStart(3, '0')}`),
  ];
  for (const seed of seeds) {
    const snapshot = createSettlement(seed);
    const before = canonicalJson(snapshot);
    const view = mapView(snapshot);
    const result = populationMarkers(view);
    expect(result.population).toBe(24);
    expect(result.markers).toHaveLength(24);
    expect(new Set(result.markers.map((marker) => `${marker.x}:${marker.y}`)).size).toBe(24);
    for (const marker of result.markers) {
      expect(view.tiles[marker.tile]![2]).toBe('grass');
      expect(view.tiles[marker.tile]![3]).toBe(0);
      const building = view.buildings.find((b) => b.tile === marker.tile);
      expect(!building || building.kind === 'hut').toBe(true);
      expect(marker.tile).toBe(Math.floor(marker.y) * view.width + Math.floor(marker.x));
    }
    expect(populationMarkers(mapView(JSON.parse(before) as SettlementSnapshot))).toEqual(result);
    expect(canonicalJson(snapshot)).toBe(before);
  }
}, 30_000);

it('uses the current population after demographics rather than the founding count', () => {
  const snapshot = simulateSettlement('RIVERSIDE', 48).state;
  const result = populationMarkers(mapView(snapshot));
  expect(snapshot.world.settlement.population).toBe(23);
  expect(result.population).toBe(23);
  expect(result.markers).toHaveLength(23);
});

it('bounds a large population display without changing the true count', () => {
  const view = mapView(createSettlement('RIVERSIDE'));
  // Controlled display input tests the cap, not a simulated population history.
  const result = populationMarkers({
    ...view,
    tiles: view.tiles.map((tile) => [tile[0], tile[1], 'grass', 0] as Tile),
    buildings: [],
    settlement: { ...view.settlement, population: 5000 },
  });
  expect(result.population).toBe(5000);
  expect(result.markers).toHaveLength(POPULATION_MARKER_LIMIT);
});

it('omits extinct populations and excludes fields, stores, projects and impassable ground', () => {
  const view = mapView(createSettlement('RIVERSIDE'));
  expect(
    populationMarkers({ ...view, settlement: { ...view.settlement, population: 0 } }).markers,
  ).toEqual([]);
  const projectTile = populationMarkers(view).markers[0]!.tile;
  const project = {
    id: 999,
    tile: projectTile,
    kind: 'hut' as const,
    escrow: 12,
    progress: 0,
    requiredLabor: 4,
    startEventId: 1,
  };
  const result = populationMarkers({ ...view, project });
  expect(result.markers.length).toBeGreaterThan(0);
  expect(result.markers.every((marker) => marker.tile !== projectTile)).toBe(true);
});
