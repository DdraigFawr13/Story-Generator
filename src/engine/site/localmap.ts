// Local map (M3.1): a tile map of one site cell plus half of each neighbour, built from the world
// cells. Deterministic: all noise seeds come from the world seed and a key.

import type { ContentBundle } from '../core/content-types';
import { clamp } from '../core/math';
import { hashString } from '../core/rng';
import type { LocalMap, WorldState } from '../core/types';
import { D8_DX, D8_DY } from '../worldgen/grid';
import { fractalNoise, hash2 } from '../worldgen/noise';
import { siteCodes } from './defs';

export type LocalMapContent = Pick<ContentBundle, 'biomes' | 'resources' | 'site'>;

// Noise tuning (tiles): feature size, octaves and persistence per layer.
const ELEVATION_NOISE = { scale: 24, octaves: 3, persistence: 0.5 };
const JITTER_NOISE = { scale: 16, octaves: 3, persistence: 0.5 };
const TREE_NOISE = { scale: 10, octaves: 3, persistence: 0.55 };
const ROCK_NOISE = { scale: 8, octaves: 2, persistence: 0.5 };
/** Metres of hills added on top of the interpolated cell elevation. */
const ELEVATION_RELIEF = 12;
/** How far (in cells) the noisy lookup moves which cell decides sea and biome. */
const COAST_JITTER = 0.22;
/** Percent of swamp tiles that are marsh rather than grass. */
const MARSH_PERCENT = 45;
/** Tree noise above this grows trees: low in forests, high in the open. */
const TREE_THRESHOLD = { forest: 0.05, swamp: 0.35, open: 0.3 };
/** Scrub grows this far below the tree threshold. */
const SCRUB_BAND = 0.12;
/** Rock outcrops need this rock noise and a cell at least this high (m). */
const ROCK_NOISE_MIN = 0.62;
const ROCK_MIN_ELEVATION = 30;
/** Percent of stone tiles that show the site cell's ore or clay. */
const DEPOSIT_PERCENT = 30;
/** River width (tiles on each side of the line) by flow: wide above 800, medium above 200. */
const RIVER_FLOW_WIDE = 800;
const RIVER_FLOW_MEDIUM = 200;
/** Steps drawn along each river segment, and its largest sideways meander in tiles. */
const RIVER_STEPS = 96;
const RIVER_MEANDER = 6;

/** Builds the map for the cell `siteCell`; `seedKey` (the site id or cell) varies the noise. */
export function buildLocalMap(
  world: WorldState,
  content: LocalMapContent,
  siteCell: number,
  seedKey: string,
): LocalMap {
  const cells = world.cells;
  if (!cells) throw new Error('buildLocalMap needs generated cells.');
  const rules = content.site;
  const code = siteCodes(rules);
  const size = rules.mapSize;
  const perCell = rules.tilesPerCell;
  const total = size * size;
  const seed = hashString(`${world.seed}:site:${seedKey}`);
  const cx = siteCell % cells.width;
  const cy = (siteCell - cx) / cells.width;
  const elevation = new Int16Array(total);
  const terrain = new Uint8Array(total);
  const water = new Uint8Array(total);
  const tree = new Uint8Array(total);
  const mineral = new Uint8Array(total);
  const building = new Uint16Array(total);
  const bridges: number[] = [];
  const cellAt = (wx: number, wy: number) =>
    clamp(wy, 0, cells.height - 1) * cells.width + clamp(wx, 0, cells.width - 1);
  // World coordinates of a tile (cell centres at integers): from cx - 0.5 - 0.5 over the whole map.
  const worldX = (tx: number) => cx - 1 + (tx + 0.5) / perCell;
  const worldY = (ty: number) => cy - 1 + (ty + 0.5) / perCell;

  const landed = new Uint8Array(total);
  for (let ty = 0; ty < size; ty += 1) {
    for (let tx = 0; tx < size; tx += 1) {
      const i = ty * size + tx;
      const fx = worldX(tx);
      const fy = worldY(ty);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const ax = fx - x0;
      const ay = fy - y0;
      const e = (dx: number, dy: number) => cells.elevation[cellAt(x0 + dx, y0 + dy)]!;
      const base =
        (e(0, 0) * (1 - ax) + e(1, 0) * ax) * (1 - ay) + (e(0, 1) * (1 - ax) + e(1, 1) * ax) * ay;
      elevation[i] = Math.round(
        base + fractalNoise(seed, tx, ty, ELEVATION_NOISE) * ELEVATION_RELIEF,
      );
      // The nearest cell, with noisy coordinates, decides sea or lake and the biome.
      const jx = fx + fractalNoise(seed + 7, tx, ty, JITTER_NOISE) * COAST_JITTER;
      const jy = fy + fractalNoise(seed + 11, tx, ty, JITTER_NOISE) * COAST_JITTER;
      const cell = cellAt(Math.round(jx), Math.round(jy));
      const biome = content.biomes[cells.biome[cell]!]?.id ?? '';
      if (cells.water[cell] === 3) water[i] = code.sea;
      else if (cells.water[cell] === 2) water[i] = code.lake;
      if (water[i] !== 0) continue;
      landed[i] = 1;
      terrain[i] =
        biome === 'swamp' && hash2(seed + 3, tx, ty) % 100 < MARSH_PERCENT
          ? code.marsh
          : code.grass;
      const open = biome === 'swamp' ? TREE_THRESHOLD.swamp : TREE_THRESHOLD.open;
      const forested = biome.includes('forest') || biome === 'taiga' || biome === 'jungle';
      const dense = forested ? TREE_THRESHOLD.forest : open;
      const treeNoise = fractalNoise(seed + 21, tx, ty, TREE_NOISE);
      if (treeNoise > dense) tree[i] = biome === 'taiga' ? code.conifer : code.broadleaf;
      else if (treeNoise > dense - SCRUB_BAND && terrain[i] === code.grass) terrain[i] = code.scrub;
      if (
        fractalNoise(seed + 31, tx, ty, ROCK_NOISE) > ROCK_NOISE_MIN &&
        base > ROCK_MIN_ELEVATION
      ) {
        terrain[i] = code.rock;
        tree[i] = 0;
        mineral[i] = code.stone;
      }
    }
  }
  // Shore: land beside sea or lake.
  for (let i = 0; i < total; i += 1) {
    if (!landed[i]) continue;
    const tx = i % size;
    const ty = (i - tx) / size;
    for (let d = 0; d < 8; d += 1) {
      const nx = tx + D8_DX[d]!;
      const ny = ty + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const w = water[ny * size + nx]!;
      if (w === code.sea || w === code.lake) {
        terrain[i] = code.shore;
        tree[i] = 0;
        mineral[i] = 0;
        break;
      }
    }
  }
  // Rivers: each river cell near the site draws a line to its downstream cell, with a meander.
  // Rivers of neighbouring cells are pulled partway toward the site so a river site sits on its bank.
  const toTile = (wx: number, wy: number): [number, number] => [
    (wx - cx + 1) * perCell - 0.5,
    (wy - cy + 1) * perCell - 0.5,
  ];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const cell = cellAt(cx + dx, cy + dy);
      if (cells.water[cell] !== 1) continue;
      const dir = cells.flowDir[cell]!;
      if (dir < 0) continue;
      const pull = (x: number, y: number): [number, number] => {
        const k = Math.max(Math.abs(x - cx), Math.abs(y - cy)) === 1 ? rules.riverPull : 0;
        return toTile(x + (cx - x) * k, y + (cy - y) * k);
      };
      const [ax, ay] = pull(cx + dx, cy + dy);
      const [bx, by] = pull(cx + dx + D8_DX[dir]!, cy + dy + D8_DY[dir]!);
      const flow = cells.flow[cell]!;
      const width = flow > RIVER_FLOW_WIDE ? 2 : flow > RIVER_FLOW_MEDIUM ? 1 : 0;
      const length = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
      for (let s = 0; s <= RIVER_STEPS; s += 1) {
        const t = s / RIVER_STEPS;
        const meander =
          fractalNoise(seed + 41 + cell, s, 0, { scale: 30, octaves: 2, persistence: 0.5 }) *
          RIVER_MEANDER *
          (1 - Math.abs(2 * t - 1));
        const ox = ax + (bx - ax) * t - ((by - ay) / length) * meander;
        const oy = ay + (by - ay) * t + ((bx - ax) / length) * meander;
        for (let ry = -width; ry <= width; ry += 1) {
          for (let rx = -width; rx <= width; rx += 1) {
            const X = Math.round(ox + rx);
            const Y = Math.round(oy + ry);
            if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
            const k = Y * size + X;
            if (water[k] === code.sea || water[k] === code.lake) continue;
            water[k] = code.river;
            tree[k] = 0;
            mineral[k] = 0;
          }
        }
      }
    }
  }
  // Ore and clay: the site cell's deposits show on some of the stone.
  for (const deposit of cells.resources.get(siteCell) ?? []) {
    const resource = content.resources[deposit.resource];
    if (!resource) continue;
    const kind =
      resource.category === 'metal' || resource.id === 'gems'
        ? code.ore
        : resource.id === 'clay'
          ? code.clay
          : 0;
    if (!kind) continue;
    for (let i = 0; i < total; i += 1) {
      if (
        mineral[i] === code.stone &&
        hash2(seed + 51, i, deposit.resource) % 100 < DEPOSIT_PERCENT
      ) {
        mineral[i] = kind;
      }
    }
  }
  return {
    width: size,
    height: size,
    elevation,
    terrain,
    water,
    tree,
    mineral,
    building,
    cellX: cx,
    cellY: cy,
    bridges,
  };
}
