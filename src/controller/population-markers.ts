import type { SettlementSnapshot } from '../sim/state';

export type PopulationMapView = Pick<
  SettlementSnapshot['world']['map'],
  'tiles' | 'width' | 'height'
> &
  Pick<SettlementSnapshot['world'], 'buildings' | 'settlement' | 'project'> & {
    residents?: readonly {
      readonly id: number;
      readonly tile: number;
      readonly deathEventId: number | null;
    }[];
  };
export interface PopulationMarker {
  tile: number;
  x: number;
  y: number;
}

export const POPULATION_MARKER_LIMIT = 96;
const DISPLAY_RADIUS = 5;
const OFFSETS = [0.2, 0.8] as const;

// An illustrative population diagram, without individual identities or simulated positions.
// Read only the committed count/geography; never allocate IDs, draw RNG or change the world.
export function populationMarkers(view: PopulationMapView) {
  const population = view.settlement.population;
  const markers: PopulationMarker[] = [];
  if (population === 0) return { population, markers };
  if (view.residents) {
    const slots = new Map<number, number>();
    for (const person of view.residents
      .filter((person) => person.deathEventId === null)
      .slice(0, POPULATION_MARKER_LIMIT)) {
      const slot = slots.get(person.tile) ?? 0;
      slots.set(person.tile, slot + 1);
      markers.push({
        tile: person.tile,
        x: (person.tile % view.width) + OFFSETS[slot % 2]!,
        y: Math.floor(person.tile / view.width) + OFFSETS[Math.floor(slot / 2) % 2]!,
      });
    }
    return { population, markers };
  }
  const count = Math.min(population, POPULATION_MARKER_LIMIT);
  const centerX = view.settlement.center % view.width;
  const centerY = Math.floor(view.settlement.center / view.width);
  const buildings = new Map(view.buildings.map((building) => [building.tile, building.kind]));
  const candidates = [];
  for (const [index, tile] of view.tiles.entries()) {
    const distance =
      Math.abs((index % view.width) - centerX) + Math.abs(Math.floor(index / view.width) - centerY);
    const building = buildings.get(index);
    if (
      distance <= DISPLAY_RADIUS &&
      tile[2] === 'grass' &&
      tile[3] === 0 &&
      (!building || building === 'hut') &&
      index !== view.project?.tile
    )
      candidates.push({ tile: index, distance, occupied: building ? 1 : 0 });
  }
  // Prefer open ground; huts provide a dry fallback even on the smallest founding patch.
  candidates.sort((a, b) => a.occupied - b.occupied || a.distance - b.distance || a.tile - b.tile);
  for (const candidate of candidates) {
    for (const y of OFFSETS) {
      for (const x of OFFSETS) {
        markers.push({
          tile: candidate.tile,
          x: (candidate.tile % view.width) + x,
          y: Math.floor(candidate.tile / view.width) + y,
        });
        if (markers.length === count) return { population, markers };
      }
    }
  }
  return { population, markers };
}
