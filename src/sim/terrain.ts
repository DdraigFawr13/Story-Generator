import { FOUNDATION_CONFIG } from './config';
import { deriveStream, validateSeed } from './seed';
import { uniform } from './rng';

export type TerrainKind = 'grass' | 'rock' | 'water';
export type Tile = readonly [
  elevation: number,
  fertility: number,
  kind: TerrainKind,
  timber: number,
];
export type BuildingKind = 'field' | 'store' | 'hut';
export type Site = readonly [tile: number, kind: BuildingKind];
const RULES = FOUNDATION_CONFIG.terrain;
export const MAP_WIDTH = RULES.width;
export const MAP_HEIGHT = RULES.height;

function interpolate(grid: readonly number[], x: number, y: number): number {
  const pitch = RULES.latticePitch;
  const gx = Math.floor(x / pitch),
    gy = Math.floor(y / pitch);
  const dx = x % pitch,
    dy = y % pitch;
  const offset = gy * RULES.latticeColumns + gx;
  return Math.floor(
    (grid[offset]! * (pitch - dx) * (pitch - dy) +
      grid[offset + 1]! * dx * (pitch - dy) +
      grid[offset + RULES.latticeColumns]! * (pitch - dx) * dy +
      grid[offset + RULES.latticeColumns + 1]! * dx * dy) /
      (pitch * pitch),
  );
}

export function generateGeography(seed: string) {
  validateSeed(seed);
  let state = deriveStream(seed, 'terrain');
  function draw(range: number) {
    const result = uniform(state, range);
    state = result.state;
    return result.value;
  }
  const grids = Array.from({ length: 3 }, () =>
    Array.from({ length: RULES.latticeColumns * RULES.latticeRows }, () => draw(101)),
  );
  const river = [RULES.riverStartBase + draw(RULES.riverStartRange)];
  for (let y = 1; y < MAP_HEIGHT; y++) {
    river.push(Math.max(RULES.riverMin, Math.min(RULES.riverMax, river[y - 1]! + draw(3) - 1)));
  }
  const tiles: Tile[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const elevation =
        RULES.elevationBase +
        Math.floor((RULES.elevationScale * interpolate(grids[0]!, x, y)) / 100);
      const fertility =
        RULES.fertilityBase +
        Math.floor((RULES.fertilityScale * interpolate(grids[1]!, x, y)) / 100);
      const kind = elevation >= RULES.rockElevation ? 'rock' : 'grass';
      const timber =
        kind === 'grass' && interpolate(grids[2]!, x, y) >= RULES.forestThreshold
          ? RULES.forestTimber
          : 0;
      tiles.push(
        Math.abs(x - river[y]!) <= RULES.riverHalfWidth
          ? [0, 0, 'water', 0]
          : [elevation, fertility, kind, timber],
      );
    }
  }
  return { tiles, river, terrainRng: state };
}

export function validateTiles(tiles: readonly Tile[]): void {
  if (tiles.length !== MAP_WIDTH * MAP_HEIGHT) throw new Error('Invalid map dimensions.');
  for (const tile of tiles) {
    if (!Array.isArray(tile) || tile.length !== 4) throw new Error('Invalid tile record.');
    const [elevation, fertility, kind, timber] = tile;
    if (
      ![elevation, fertility, timber].every(Number.isSafeInteger) ||
      elevation < 0 ||
      elevation > 100 ||
      fertility < 0 ||
      fertility > 100 ||
      timber < 0 ||
      timber > RULES.forestTimber ||
      !['grass', 'rock', 'water'].includes(kind) ||
      (kind !== 'grass' && timber !== 0) ||
      (kind === 'water' && (elevation !== 0 || fertility !== 0))
    ) {
      throw new Error('Invalid terrain values.');
    }
  }
}

function patch(x: number, y: number): number[] {
  const indices: number[] = [];
  for (const dy of [-1, 0, 1])
    for (const dx of [-1, 0, 1]) indices.push((y + dy) * MAP_WIDTH + x + dx);
  return indices;
}

interface FoundingCandidate {
  key: readonly number[];
  indices: number[];
  valid: boolean;
}
function before(left: FoundingCandidate, right: FoundingCandidate): boolean {
  for (let i = 0; i < left.key.length; i++) {
    if (left.key[i] !== right.key[i]) return left.key[i]! < right.key[i]!;
  }
  return false;
}

export function prepareFounding(input: readonly Tile[]) {
  validateTiles(input);
  const tiles: Tile[] = input.map((tile) => [...tile]);
  const water: number[] = [];
  tiles.forEach((tile, index) => {
    if (tile[2] === 'water') water.push(index);
  });
  let bestNatural: FoundingCandidate | null = null;
  let bestDry: FoundingCandidate | null = null;
  for (let y = RULES.foundingMinY; y <= RULES.foundingMaxY; y++) {
    for (let x = RULES.foundingMinX; x <= RULES.foundingMaxX; x++) {
      const indices = patch(x, y);
      if (indices.some((index) => tiles[index]![2] === 'water')) continue;
      let distance: number = RULES.noWaterDistance;
      for (const index of water)
        distance = Math.min(
          distance,
          Math.abs(x - (index % MAP_WIDTH)) + Math.abs(y - Math.floor(index / MAP_WIDTH)),
        );
      const candidate: FoundingCandidate = {
        key: [
          distance,
          Math.abs(x - RULES.anchorX) + Math.abs(y - RULES.anchorY),
          y * MAP_WIDTH + x,
        ],
        indices,
        valid:
          indices.every((index) => tiles[index]![2] === 'grass') &&
          indices.filter((index) => tiles[index]![1] >= RULES.fieldMinFertility).length >= 2,
      };
      if (!bestDry || before(candidate, bestDry)) bestDry = candidate;
      if (candidate.valid && (!bestNatural || before(candidate, bestNatural)))
        bestNatural = candidate;
    }
  }
  const chosen = bestNatural ?? bestDry;
  if (!chosen) throw new Error('Invalid geography: no dry founding patch.');
  const fallback = bestNatural === null;
  const originalPatch = chosen.indices.map((index) => [index, ...tiles[index]!] as const);
  const clearedTimber = chosen.indices.reduce((sum, index) => sum + tiles[index]![3], 0);
  for (const index of chosen.indices) {
    const tile = tiles[index]!;
    tiles[index] = fallback
      ? [RULES.fallbackElevation, RULES.fallbackFertility, 'grass', 0]
      : [tile[0], tile[1], tile[2], 0];
  }
  const fields = [...chosen.indices]
    .sort((a, b) => tiles[b]![1] - tiles[a]![1] || a - b)
    .slice(0, 2);
  const store = chosen.indices.find((index) => !fields.includes(index))!;
  const buildings: Site[] = chosen.indices.map((index) => [
    index,
    fields.includes(index) ? 'field' : index === store ? 'store' : 'hut',
  ]);
  return { tiles, center: chosen.key[2]!, fallback, clearedTimber, originalPatch, buildings };
}

// This is the contract fixture payload, distinct from the full authoritative snapshot.
export function terrainFixture(seed: string) {
  const geography = generateGeography(seed);
  return {
    seed,
    terrainRng: geography.terrainRng,
    river: geography.river,
    ...prepareFounding(geography.tiles),
  };
}
