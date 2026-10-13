// Fire at the watched site (M3.4): a hearth on a cold day or lightning in a storm starts one; a
// burning tile lights burnable neighbours each block, stronger in dry spells and weaker in rain and
// snow; adults nearest the fire fight it from the well or river. Fire stops at stone, water, paths
// and bare ground. Tiles burn 2-4 blocks, then trees go, crops are ruined and a building with half
// its tiles burnt is burnt down: its household is taken in by kin (or the hall) until the build job
// raises the home again. Nobody is hurt (health comes in M3.5). Numbers: content/weather.ts.

import { ORTHO, manhattan, sortByManhattan, sortedById } from '../core/math';
import type { EmitInput } from '../core/context';
import { dateOf } from '../core/clock';
import { streamFor } from '../core/rng';
import type { ActiveSite, Building, Household, Id, SimEvent, WorldState } from '../core/types';
import type { SiteLabel } from './build';
import { siteCodes, type SiteContent } from './defs';
import { residentNames } from './names';
import { invalidatePaths } from './path';
import { burnTree } from './wild';

type Emit = (input: EmitInput) => SimEvent;

/** A fire that just began: the event and the tile, for witnesses to remember. */
export interface FireStart {
  event: SimEvent;
  tile: number;
}

const within = (month: number, [from, to]: readonly [number, number]) =>
  month >= from && month <= to;

/** "Ulf and Tora" or "Ulf": the household's head and their spouse here. */
function ownersOf(world: WorldState, active: ActiveSite, household: Household): string {
  const names = residentNames(world, active.residents);
  const nameOf = (id: Id) => names.get(id) ?? world.people.get(id)?.name ?? `#${id}`;
  const head = world.people.get(household.head);
  const spouse = household.members.find(
    (id) => id !== household.head && head?.family.spouses.includes(id),
  );
  return spouse === undefined
    ? nameOf(household.head)
    : `${nameOf(household.head)} and ${nameOf(spouse)}`;
}

/** The household living in a home building (its own, or lodging there), lowest id first. */
function householdOf(active: ActiveSite, building: Building): Household | undefined {
  return [...active.households.values()]
    .sort((a, b) => a.id - b.id)
    .find((h) => h.members.length > 0 && h.home === building.id);
}

/** How well the tile burns now (0 does not burn): fuel by what stands on it, times the season for grass. */
function fuelAt(content: SiteContent, active: ActiveSite, month: number, tile: number): number {
  const { map } = active;
  const rules = content.environment.fire;
  if (map.water[tile] !== 0) return 0;
  const id = map.building[tile]!;
  if (id !== 0) {
    const b = active.buildings.get(id);
    if (!b || b.burnt || b.progress !== undefined) return 0;
    if (b.defId === 'field') {
      const stage = b.crop?.stage;
      return stage === 'ripe'
        ? rules.ripeFuel
        : stage === 'sown' || stage === 'growing'
          ? rules.growingFuel
          : 0;
    }
    return rules.buildingFuel[b.defId] ?? 0;
  }
  const code = siteCodes(content.site);
  if (map.tree[tile] !== 0) return rules.treeFuel;
  const terrain = map.terrain[tile];
  if (terrain === code.scrub) return rules.scrubFuel;
  if (terrain === code.grass) {
    return within(month, rules.grassMonths) ? rules.grassFuel : rules.grassWinterFuel;
  }
  return 0;
}

/** Multiplier on spread from the day's weather: snow lying, rain today, a dry spell, or none. */
function dryness(content: SiteContent, active: ActiveSite): number {
  const rules = content.environment.fire;
  const w = active.weather;
  if (w.snowCover > 0) return rules.snowMul;
  if (w.sky === 'rain' || w.sky === 'storm') return rules.rainMul;
  if (w.dryDays >= rules.dry.days || w.year.drought) return rules.dry.mul;
  return 1;
}

function nearWater(content: SiteContent, active: ActiveSite, tile: number): boolean {
  const { map } = active;
  const reach = content.environment.fire.waterReach;
  const x = tile % map.width;
  const y = (tile - x) / map.width;
  for (const b of active.buildings.values()) {
    if (b.defId !== 'well' || b.progress !== undefined || b.burnt) continue;
    if (Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= reach) return true;
  }
  for (let yy = Math.max(0, y - reach); yy <= Math.min(map.height - 1, y + reach); yy += 1) {
    for (let xx = Math.max(0, x - reach); xx <= Math.min(map.width - 1, x + reach); xx += 1) {
      if (map.water[yy * map.width + xx] !== 0) return true;
    }
  }
  return false;
}

/** Sets the tiles alight, each for 2-4 blocks. */
function light(
  content: SiteContent,
  world: WorldState,
  tiles: Map<number, number>,
  list: number[],
) {
  const rng = streamFor(world, 'site.fire');
  const [lo, hi] = content.environment.fire.burnBlocks;
  for (const t of list) tiles.set(t, rng.between(lo, hi));
}

/**
 * The day's chances of a fire (block 0, after the weather and the firewood): each home with a lit
 * hearth on a cold day, and lightning on a stormy one. Only one fire burns at a time. Returns the
 * fire that began, if any.
 */
export function igniteDaily(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): FireStart | null {
  if (active.fire) return null;
  const rules = content.environment.fire;
  const w = active.weather;
  const rng = streamFor(world, 'site.fire');
  let building: Building | undefined;
  let tile = -1;
  let cause = '';
  let causeEvent: Id | null = null;
  if (w.tempC < rules.hearthBelowC) {
    for (const id of active.firewood.lit) {
      if (!rng.chance(rules.hearthFireChance)) continue;
      building = active.buildings.get(id);
      if (building?.defId !== 'home') building = undefined;
      if (building) {
        cause = 'a hearth banked high on a cold night';
        break;
      }
    }
  }
  if (!building && w.sky === 'storm' && rng.chance(rules.lightningChance)) {
    const month = dateOf(world.day).month;
    const { map } = active;
    const candidates: number[] = [];
    for (let k = 0; k < map.tree.length; k += 1) {
      if (fuelAt(content, active, month, k) > 0 && (map.tree[k] !== 0 || map.building[k] !== 0)) {
        const b = map.building[k] === 0 ? undefined : active.buildings.get(map.building[k]!);
        if (!b || b.defId === 'home') candidates.push(k);
      }
    }
    if (candidates.length > 0) {
      tile = candidates[rng.int(candidates.length)]!;
      const id = map.building[tile]!;
      building = id === 0 ? undefined : active.buildings.get(id);
      cause = 'a lightning strike';
      causeEvent = w.stormEvent;
    }
  }
  if (!building && tile < 0) return null;
  return startFire(world, content, active, building, tile, cause, causeEvent, emit, label);
}

/** A fire set deliberately (a dragon's breath, M3.8): the building at the tile, else the tile itself. */
export function igniteTile(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  tile: number,
  cause: string,
  causeEvent: Id | null,
  emit: Emit,
  label: SiteLabel,
): FireStart | null {
  if (active.fire) return null;
  const id = active.map.building[tile]!;
  const building = id === 0 ? undefined : active.buildings.get(id);
  return startFire(
    world,
    content,
    active,
    building,
    building ? -1 : tile,
    cause,
    causeEvent,
    emit,
    label,
  );
}

function startFire(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  building: Building | undefined,
  tile: number,
  cause: string,
  causeEvent: Id | null,
  emit: Emit,
  label: SiteLabel,
): FireStart {
  // A hearth fire takes the whole thatch at once; lightning starts at one tile.
  const burning = building && tile < 0 ? [...building.cells] : [tile];
  const start = building && tile < 0 ? building.cells[0]! : tile;
  const household = building ? householdOf(active, building) : undefined;
  const tiles = new Map<number, number>();
  light(content, world, tiles, burning);
  const event = emit({
    type:
      household && building?.defId === 'home'
        ? content.environment.events.fire
        : content.environment.events.fireWild,
    actors: household ? [household.head] : [],
    place: label.cell,
    causes: causeEvent === null ? [] : [causeEvent],
    data: {
      site: label.name,
      household: household ? ownersOf(world, active, household) : '',
      cause,
    },
  });
  active.fire = {
    tiles,
    startedEvent: event.id,
    cause,
    home: building && building.defId === 'home' ? building.id : null,
    hits: new Map(),
    trees: 0,
    crops: 0,
    start,
    done: [],
    water: nearWater(content, active, start),
    homes: [],
  };
  return { event, tile: start };
}

/** What the fire left: a burnt building goes dark, its household is taken in, the out-line is written. */
function endFire(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const fire = active.fire!;
  const rules = content.environment.fire;
  const burntHomes: Building[] = [];
  let buildings = 0;
  for (const [id, hits] of [...fire.hits].sort((a, b) => a[0] - b[0])) {
    const b = active.buildings.get(id);
    if (!b || b.defId === 'field') continue;
    const share = hits / b.cells.length;
    if (share >= rules.burntShare) {
      b.burnt = true;
      b.burntDay = world.day;
      b.condition = 0;
      buildings += 1;
      if (b.defId === 'home') burntHomes.push(b);
    } else b.condition = Math.max(0, b.condition - 100 * share);
  }
  const parts: string[] = [];
  if (burntHomes.length > 0)
    parts.push(burntHomes.length === 1 ? 'a home' : `${burntHomes.length} homes`);
  if (buildings > burntHomes.length) parts.push('a workshop');
  if (fire.trees > 0) parts.push(fire.trees === 1 ? 'a tree' : `${fire.trees} trees`);
  if (fire.crops > 0)
    parts.push(fire.crops === 1 ? 'the crop of a field' : `the crops of ${fire.crops} fields`);
  const lost = parts.length === 0 ? 'Little' : parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
  const out = emit({
    type: content.environment.events.fireOut,
    place: label.cell,
    causes: [fire.startedEvent],
    data: { site: label.name, lost: lost.charAt(0).toUpperCase() + lost.slice(1) },
  });
  active.fire = null;
  active.layoutVersion += 1;
  invalidatePaths(active, []);
  for (const home of burntHomes) takeIn(world, content, active, home, out, emit, label);
}

/** The home a burnt-out household sleeps in: kin's, else the hall, else the nearest standing home. */
function lodgingFor(world: WorldState, active: ActiveSite, burnt: Building, household: Household) {
  const standing = (b: Building | undefined) =>
    b !== undefined && !b.burnt && b.progress === undefined && b.id !== burnt.id;
  const related = (a: Id, b: Id) => {
    const p = world.people.get(a);
    const q = world.people.get(b);
    if (!p || !q) return false;
    return (
      p.family.parents.includes(b) ||
      p.family.children.includes(b) ||
      p.family.spouses.includes(b) ||
      p.family.parents.some((x) => q.family.parents.includes(x))
    );
  };
  for (const other of sortedById(active.households.values())) {
    if (other.id === household.id || other.members.length === 0) continue;
    const home = other.home === null ? undefined : active.buildings.get(other.home);
    if (!standing(home)) continue;
    if (household.members.some((m) => other.members.some((n) => related(m, n)))) return home;
  }
  const hall = [...active.buildings.values()].find((b) => b.defId === 'hall' && standing(b));
  if (hall) return hall;
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of [...active.buildings.values()].sort((a, c) => a.id - c.id)) {
    if (b.defId !== 'home' || !standing(b)) continue;
    const d = manhattan(b.x, b.y, burnt.x, burnt.y);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function takeIn(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  burnt: Building,
  cause: SimEvent,
  emit: Emit,
  label: SiteLabel,
): void {
  // The owners, and anyone already lodging there after an earlier fire, find a new roof.
  const homeless = [...active.households.values()]
    .sort((a, b) => a.id - b.id)
    .filter(
      (h) =>
        h.members.length > 0 &&
        (h.lodgingHome === burnt.id || (h.home === burnt.id && h.lodgingHome === undefined)),
    );
  for (const household of homeless) {
    const host = lodgingFor(world, active, burnt, household);
    if (!host) {
      delete household.lodgingHome;
      continue;
    }
    household.lodgingHome = host.id;
    lodged(world, content, active, household, host, cause, emit, label);
  }
}

function lodged(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  household: Household,
  host: Building,
  cause: SimEvent,
  emit: Emit,
  label: SiteLabel,
): void {
  const hostHold = householdOf(active, host);
  emit({
    type: content.environment.events.takenIn,
    actors: [household.head],
    place: label.cell,
    causes: [cause.id],
    data: {
      site: label.name,
      household: ownersOf(world, active, household),
      host: hostHold ? ownersOf(world, active, hostHold) : `the ${host.defId}`,
    },
  });
}

/**
 * One block of fire, before anyone moves: every burning tile may light its burnable neighbours
 * (halved beside a fighter), then each burns a block down; a tile at 0 burns out. The fire ends
 * when no tile burns. `fighterTiles` are where the fighters stood last block.
 */
export function spreadFire(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
  fighterTiles: readonly number[],
): void {
  const fire = active.fire;
  if (!fire) return;
  const rules = content.environment.fire;
  const { map } = active;
  const rng = streamFor(world, 'site.fire');
  const month = dateOf(world.day).month;
  const wet = dryness(content, active);
  const burning = [...fire.tiles.keys()].sort((a, b) => a - b);
  const done = new Set(fire.done);
  const fresh: number[] = [];
  const guarded = new Set<number>();
  for (const f of fighterTiles) {
    const x = f % map.width;
    const y = (f - x) / map.width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < map.width && ny < map.height)
          guarded.add(ny * map.width + nx);
      }
    }
  }
  for (const t of burning) {
    const x = t % map.width;
    const y = (t - x) / map.width;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const n = ny * map.width + nx;
      if (fire.tiles.has(n) || done.has(n) || fresh.includes(n)) continue;
      const fuel = fuelAt(content, active, month, n);
      if (fuel <= 0) continue;
      const p = rules.spreadBase * wet * fuel * (guarded.has(n) ? rules.nearFighterMul : 1);
      if (rng.chance(Math.min(1, p))) fresh.push(n);
    }
  }
  for (const t of burning) {
    const left = fire.tiles.get(t)! - 1;
    if (left > 0) {
      fire.tiles.set(t, left);
      continue;
    }
    fire.tiles.delete(t);
    fire.done.push(t);
    burnOut(world, content, active, t);
  }
  light(content, world, fire.tiles, fresh);
  if (fire.tiles.size === 0) endFire(world, content, active, emit, label);
}

/** A tile that burned its blocks: the tree is gone, the crop ruined, the building hit. */
function burnOut(world: WorldState, content: SiteContent, active: ActiveSite, tile: number): void {
  const fire = active.fire!;
  const { map } = active;
  const id = map.building[tile]!;
  if (id !== 0) {
    const b = active.buildings.get(id);
    if (!b) return;
    if (b.defId === 'field') {
      if (
        b.crop &&
        b.crop.stage !== 'ruined' &&
        b.crop.stage !== 'bare' &&
        b.crop.stage !== 'cut'
      ) {
        b.crop.stage = 'ruined';
        b.crop.left = 0;
        fire.crops += 1;
      }
      return;
    }
    fire.hits.set(id, (fire.hits.get(id) ?? 0) + 1);
    return;
  }
  if (map.tree[tile] !== 0) {
    burnTree(world, content, active, tile);
    fire.trees += 1;
  }
  active.burnt.push({ tile, day: world.day });
}

/** Tiles fighters walk to: open, walkable ground beside the fire, nearest the fire's start first. */
export function fightingSpots(active: ActiveSite, walkable: (tile: number) => boolean): number[] {
  const fire = active.fire;
  if (!fire) return [];
  const { map } = active;
  const spots = new Set<number>();
  for (const t of fire.tiles.keys()) {
    const x = t % map.width;
    const y = (t - x) / map.width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const n = ny * map.width + nx;
        if (!fire.tiles.has(n) && walkable(n)) spots.add(n);
      }
    }
  }
  const sx = fire.start % map.width;
  const sy = Math.floor(fire.start / map.width);
  return sortByManhattan([...spots], map.width, sx, sy);
}

/**
 * Fighters beside a burning tile put it out with a chance each block (less with no water in
 * reach). `fighterTiles` are where they stand now, after walking. Returns tiles put out.
 */
export function fightFire(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  fighterTiles: readonly number[],
): number {
  const fire = active.fire;
  if (!fire) return 0;
  const rules = content.environment.fire;
  const { map } = active;
  const rng = streamFor(world, 'site.fire');
  let out = 0;
  for (const f of fighterTiles) {
    const x = f % map.width;
    const y = (f - x) / map.width;
    let target = -1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const n = ny * map.width + nx;
        if (fire.tiles.has(n) && (target < 0 || n < target)) target = n;
      }
    }
    if (target < 0) continue;
    if (rng.chance(fire.water ? rules.putOutChance : rules.noWaterChance)) {
      fire.tiles.delete(target);
      fire.done.push(target);
      out += 1;
    }
  }
  return out;
}

/**
 * After the fighters' turn: if their work put the last tile out, the fire is over. (A fire that
 * burns out on its own ends in `spreadFire`.)
 */
export function settleFire(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  if (active.fire && active.fire.tiles.size === 0) endFire(world, content, active, emit, label);
}

/** Open ground stops showing as burnt after a while. */
export function fadeBurnt(content: SiteContent, active: ActiveSite, day: number): void {
  const keep = content.environment.fire.burntDays;
  if (active.burnt.length === 0) return;
  active.burnt = active.burnt.filter((b) => day - b.day < keep);
}
