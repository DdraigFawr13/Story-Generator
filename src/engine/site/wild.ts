// Wild land at the watched site (M3.4): game, berries and fish are pools that hunting, foraging and
// fishing draw down and the months refill; trees are felled tile by tile and grow back in years;
// deer, hares, boar and fowl wander the map's edge for hunters to walk to. Numbers: content/weather.ts.

import type { EmitInput } from '../core/context';
import { DAYS_PER_MONTH, DAYS_PER_YEAR } from '../core/clock';
import { streamFor } from '../core/rng';
import type { ActiveSite, Animal, SimEvent, SiteWoods, WorldState } from '../core/types';
import type { SiteLabel } from './build';
import { siteCodes, type SiteContent } from './defs';

type Emit = (input: EmitInput) => SimEvent;
type Pool = 'game' | 'berries' | 'fish';

/** Days between the layout catching up with felled and regrown trees. */
const WOODS_REFRESH_DAYS = 7;

const within = (month: number, [from, to]: readonly [number, number]) =>
  month >= from && month <= to;

/** Trees within `reach` tiles (Chebyshev) of the stockpile's centre, or the origin when there is none. */
function countWoods(active: ActiveSite, reach: number): number {
  const { map } = active;
  let cx = active.origin[0];
  let cy = active.origin[1];
  for (const b of active.buildings.values()) {
    if (b.defId !== 'stockpile') continue;
    cx = b.x + (b.w >> 1);
    cy = b.y + (b.h >> 1);
    break;
  }
  let n = 0;
  for (let y = Math.max(0, cy - reach); y <= Math.min(map.height - 1, cy + reach); y += 1) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(map.width - 1, cx + reach); x += 1) {
      if (map.tree[y * map.width + x] !== 0) n += 1;
    }
  }
  return n;
}

/** The woods before the first day. */
export function initWoods(active: ActiveSite, content: SiteContent): SiteWoods {
  const n = countWoods(active, content.environment.wild.woodsReach);
  return { atEmbark: n, now: n, thinEvent: null, dirty: false, wood: new Map(), felled: [] };
}

/** Tiles where an animal may stand: open ground away from the village. */
function openGround(content: SiteContent, active: ActiveSite): number[] {
  const { map, origin } = active;
  const code = siteCodes(content.site);
  const from = content.steward.wildFrom;
  const out: number[] = [];
  for (let k = 0; k < map.terrain.length; k += 1) {
    if (map.building[k] !== 0 || map.water[k] !== 0) continue;
    if (map.terrain[k] !== code.grass && map.terrain[k] !== code.scrub) continue;
    const x = k % map.width;
    const y = (k - x) / map.width;
    if (Math.max(Math.abs(x - origin[0]), Math.abs(y - origin[1])) < from) continue;
    out.push(k);
  }
  return out;
}

function animalKinds(world: WorldState, content: SiteContent, active: ActiveSite): string[] {
  const cells = world.cells;
  const rules = content.environment.wild.animals;
  const biome = cells
    ? content.biomes[cells.biome[active.map.cellY * cells.width + active.map.cellX]!]?.id
    : undefined;
  return (biome !== undefined ? rules.byBiome[biome] : undefined) ?? rules.fallback;
}

/** Animals wanted on the map: a base and a share of the game pool. */
function animalTarget(content: SiteContent, active: ActiveSite): number {
  const rules = content.environment.wild.animals;
  return Math.round(rules.base + rules.perPool * active.wild.game);
}

function spawn(world: WorldState, active: ActiveSite, ground: number[], kinds: string[]): void {
  if (ground.length === 0 || kinds.length === 0) return;
  const rng = streamFor(world, 'site.wild');
  const k = ground[rng.int(ground.length)]!;
  const id = active.animals.reduce((n, a) => Math.max(n, a.id), 0) + 1;
  const width = active.map.width;
  active.animals.push({
    id,
    kind: kinds[rng.int(kinds.length)]!,
    x: k % width,
    y: Math.floor(k / width),
  });
}

/** Full pools and the first animals. */
export function initWild(world: WorldState, content: SiteContent, active: ActiveSite): void {
  active.wild = { game: 1, berries: 1, fish: 1 };
  active.animals = [];
  const ground = openGround(content, active);
  const kinds = animalKinds(world, content, active);
  for (let i = animalTarget(content, active); i > 0; i -= 1) spawn(world, active, ground, kinds);
}

/** The share of a pool's full output a block yields now: the pool times the season. */
export function wildYield(
  content: SiteContent,
  active: ActiveSite,
  pool: Pool,
  month: number,
): number {
  const rules = content.environment.wild;
  const level = active.wild[pool];
  if (pool === 'berries') return within(month, rules.berryMonths) ? level : 0;
  if (pool === 'fish') return within(month, rules.winterMonths) ? level * rules.fishWinter : level;
  return level;
}

/** Work blocks of hunting, foraging or fishing take from the pool. */
export function drawWild(
  content: SiteContent,
  active: ActiveSite,
  pool: Pool,
  blocks: number,
): void {
  const draw = content.environment.wild.drawPerBlock[pool];
  active.wild[pool] = Math.max(0, active.wild[pool] - draw * blocks);
}

/** Rings of tiles a woodcutter looks over for a tree, nearest first. */
const TREE_REACH = 4;

/** True when a tree stands at or within a few tiles of the tile (a woodcutter's spot is still good). */
export function treeNear(active: ActiveSite, tile: number): boolean {
  return treeBeside(active, tile) >= 0;
}

/** The tree tile nearest `tile` within a few tiles (the lowest tile index on a tie), or -1. */
function treeBeside(active: ActiveSite, tile: number): number {
  const { map } = active;
  if (map.tree[tile] !== 0) return tile;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  for (let r = 1; r <= TREE_REACH; r += 1) {
    let found = -1;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const k = ny * map.width + nx;
        if (map.tree[k] !== 0 && (found < 0 || k < found)) found = k;
      }
    }
    if (found >= 0) return found;
  }
  return -1;
}

/**
 * Fells `logs` of wood from the tree at or beside a woodcutter's tile. A tree with no wood left is
 * removed and remembered to grow back in 8 to 15 years. The layout moves on the next day (batched).
 */
export function fellAt(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tile: number,
  logs: number,
): void {
  const t = treeBeside(active, tile);
  if (t < 0) return;
  const rules = content.environment.wild;
  const woods = active.woods;
  const left = (woods.wood.get(t) ?? rules.woodPerTree) - logs;
  if (left > 0) {
    woods.wood.set(t, left);
    return;
  }
  woods.wood.delete(t);
  const rng = streamFor(world, 'site.wild');
  woods.felled.push({
    tile: t,
    tree: active.map.tree[t]!,
    regrow: world.day + rng.between(rules.regrowYears[0], rules.regrowYears[1]) * DAYS_PER_YEAR,
  });
  active.map.tree[t] = 0;
  woods.dirty = true;
}

/** Removes the trees on burnt tiles the same way (they do not grow back as quickly: same rule). */
export function burnTree(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tile: number,
): void {
  if (active.map.tree[tile] === 0) return;
  const rules = content.environment.wild;
  const rng = streamFor(world, 'site.wild');
  active.woods.wood.delete(tile);
  active.woods.felled.push({
    tile,
    tree: active.map.tree[tile]!,
    regrow: world.day + rng.between(rules.regrowYears[0], rules.regrowYears[1]) * DAYS_PER_YEAR,
  });
  active.map.tree[tile] = 0;
  active.woods.dirty = true;
}

/** The animal nearest a tile (Chebyshev), ties to the lowest id; undefined with none. */
export function nearestAnimal(active: ActiveSite, tile: number, skip = 0): Animal | undefined {
  const width = active.map.width;
  const x = tile % width;
  const y = (tile - x) / width;
  const ranked = [...active.animals].sort(
    (a, b) =>
      Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) -
        Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) || a.id - b.id,
  );
  return ranked[Math.min(skip, ranked.length - 1)];
}

/** Each block the animals wander a few tiles over open ground away from the village. */
export function stepAnimals(world: WorldState, content: SiteContent, active: ActiveSite): void {
  if (active.animals.length === 0) return;
  const { map, origin } = active;
  const code = siteCodes(content.site);
  const rules = content.environment.wild.animals;
  const from = content.steward.wildFrom;
  const rng = streamFor(world, 'site.wild');
  for (const a of active.animals) {
    for (let s = rng.int(rules.step + 1); s > 0; s -= 1) {
      const dir = rng.int(4);
      const x = a.x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
      const y = a.y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const k = y * map.width + x;
      if (map.building[k] !== 0 || map.water[k] !== 0) continue;
      if (map.terrain[k] !== code.grass && map.terrain[k] !== code.scrub) continue;
      if (Math.max(Math.abs(x - origin[0]), Math.abs(y - origin[1])) < from) continue;
      a.x = x;
      a.y = y;
    }
  }
}

/**
 * The day's changes to the wild land: on the first of a month the pools grow back and the animals
 * follow the game; felled ground grows back when its time comes; a changed woods moves the layout
 * version once, and says so the first time it thins.
 */
export function dailyWild(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.environment.wild;
  const day = world.day;
  if (day % DAYS_PER_MONTH === 0 && day !== active.enteredDay) {
    for (const pool of ['game', 'berries', 'fish'] as const) {
      const p = active.wild[pool];
      active.wild[pool] = Math.min(
        1,
        p + rules.regrow[pool] * Math.max(p, rules.regrowFloor) * (1 - p),
      );
    }
    const want = animalTarget(content, active);
    if (active.animals.length > want) active.animals.length = want;
    else if (active.animals.length < want) {
      const ground = openGround(content, active);
      const kinds = animalKinds(world, content, active);
      while (active.animals.length < want) {
        const before = active.animals.length;
        spawn(world, active, ground, kinds);
        if (active.animals.length === before) break;
      }
    }
  }
  const woods = active.woods;
  const code = siteCodes(content.site);
  const still: typeof woods.felled = [];
  for (const f of woods.felled) {
    if (f.regrow > day) {
      still.push(f);
      continue;
    }
    const { map } = active;
    const free =
      map.tree[f.tile] === 0 &&
      map.building[f.tile] === 0 &&
      map.water[f.tile] === 0 &&
      (map.terrain[f.tile] === code.grass || map.terrain[f.tile] === code.scrub);
    if (free) {
      map.tree[f.tile] = f.tree;
      woods.dirty = true;
    }
  }
  woods.felled = still;
  // Changed woods move the layout once a week: rebuilding the work lists and profiles is not free.
  if (!woods.dirty || day % WOODS_REFRESH_DAYS !== 0) return;
  woods.dirty = false;
  active.layoutVersion += 1;
  woods.now = countWoods(active, rules.woodsReach);
  if (
    woods.thinEvent === null &&
    woods.atEmbark > 0 &&
    woods.now < woods.atEmbark * rules.woodsThinBelow
  ) {
    woods.thinEvent = emit({
      type: content.environment.events.woodsThin,
      place: label.cell,
      data: { site: label.name, tiles: nearestTreeWalk(active) },
    }).id;
  }
}

/** The walk from the stockpile to the nearest dozen trees, in tiles (the median). */
function nearestTreeWalk(active: ActiveSite): number {
  const { map, origin } = active;
  const dists: number[] = [];
  for (let k = 0; k < map.tree.length; k += 1) {
    if (map.tree[k] === 0) continue;
    const x = k % map.width;
    dists.push(Math.abs(x - origin[0]) + Math.abs(Math.floor(k / map.width) - origin[1]));
  }
  dists.sort((a, b) => a - b);
  const take = dists.slice(0, 12);
  return take.length === 0 ? 0 : take[take.length >> 1]!;
}
