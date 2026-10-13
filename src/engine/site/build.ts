// Building at the live site (M3.3): the steward starts a building, builders and haulers raise it
// (see work.ts), and finishing it moves a household in. Buildings are stamped into the map when
// begun so people can see them go up; `progress` marks one as unfinished.

import { manhattan } from '../core/math';
import type { EmitInput } from '../core/context';
import type { StewardRules } from '../core/content-types';
import type { ActiveSite, Building, Id, SimEvent } from '../core/types';
import { buildingDef, doorstep, siteCodes, type SiteContent } from './defs';
import { carvePath, findRowSpot, findSpot, stampBuilding } from './layout';
import { invalidatePaths } from './path';

type Emit = (input: EmitInput) => SimEvent;

/** Where events about the site are placed and named. */
export interface SiteLabel {
  name: string;
  cell: number;
}

/** The unfinished building with the lowest id, if any: one is raised at a time. */
export function openConstruction(active: ActiveSite): Building | undefined {
  let found: Building | undefined;
  for (const b of active.buildings.values()) {
    if (b.progress !== undefined && (!found || b.id < found.id)) found = b;
  }
  return found;
}

/** The finished building in the worst repair below `repairBelow` (fields never wear), if any. */
export function repairTarget(active: ActiveSite, steward: StewardRules): Building | undefined {
  let worst: Building | undefined;
  for (const b of active.buildings.values()) {
    if (
      b.progress !== undefined ||
      b.defId === 'field' ||
      b.burnt ||
      b.condition >= steward.repairBelow
    ) {
      continue;
    }
    if (
      !worst ||
      b.condition < worst.condition ||
      (b.condition === worst.condition && b.id < worst.id)
    ) {
      worst = b;
    }
  }
  return worst;
}

/** How many finished buildings (not fields) stand below `repairBelow`. */
export function repairsDue(active: ActiveSite, steward: StewardRules): number {
  let n = 0;
  for (const b of active.buildings.values()) {
    if (
      b.progress === undefined &&
      b.defId !== 'field' &&
      !b.burnt &&
      b.condition < steward.repairBelow
    )
      n += 1;
  }
  return n;
}

/** Finished buildings (not fields) lose 1 condition every `conditionLossDays` days. */
export function wearBuildings(active: ActiveSite, steward: StewardRules): void {
  for (const b of active.buildings.values()) {
    if (b.progress !== undefined || b.defId === 'field' || b.burnt) continue;
    b.condition = Math.max(0, b.condition - 1 / steward.conditionLossDays);
  }
}

/**
 * Stamps a new unfinished building near the origin and announces it. Returns null when the map
 * has no room. `owner` is the household head a new home is for.
 */
/** Per site: building def → the layout version at which it last found no room (derived, unsaved). */
const noRoom = new WeakMap<ActiveSite, Map<string, number>>();

export function beginBuilding(
  content: SiteContent,
  active: ActiveSite,
  defId: string,
  owner: Id | null,
  emit: Emit,
  label: SiteLabel,
): Building | null {
  const { site: rules, steward } = content;
  // A full map stays full until something is built or pulled down, so don't search it daily.
  const failed = noRoom.get(active) ?? new Map<string, number>();
  noRoom.set(active, failed);
  if (failed.get(defId) === active.layoutVersion) return null;
  // Village life: a new home joins the end of a row on a street; anything else, or a home when every
  // row is full, takes the nearest free ground.
  const row =
    defId === 'home'
      ? findRowSpot(active.map, rules, active.buildings.values(), active.origin)
      : null;
  const at =
    row ?? findSpot(active.map, rules, defId, active.origin, steward.buildRing, steward.buildPad);
  if (!at) {
    failed.set(defId, active.layoutVersion);
    return null;
  }
  let id = 1;
  for (const key of active.buildings.keys()) id = Math.max(id, key + 1);
  const x = Array.isArray(at) ? at[0] : at.x;
  const y = Array.isArray(at) ? at[1] : at.y;
  const b = stampBuilding(
    active.map,
    rules,
    id,
    defId,
    x,
    y,
    true,
    row ? [row.w, row.h] : undefined,
  );
  if (row) {
    b.door = row.door;
    const step = doorstep(b, active.map.width);
    if (active.map.water[step] === 0) active.map.terrain[step] = siteCodes(rules).path;
  }
  b.owner = owner;
  b.condition = 0;
  b.progress = 0;
  b.delivered = {};
  const event = emit({
    type: steward.events.buildBegun,
    actors: owner === null ? [] : [owner],
    place: label.cell,
    data: { site: label.name, building: buildingDef(rules, defId).name },
  });
  b.begunEvent = event.id;
  active.buildings.set(id, b);
  active.layoutVersion += 1;
  invalidatePaths(active, b.cells);
  return b;
}

/** True when the tile is free grass or scrub: no building, water or mineral. */
export function buildableTile(content: SiteContent, active: ActiveSite, tile: number): boolean {
  const map = active.map;
  const code = siteCodes(content.site);
  return (
    map.building[tile] === 0 &&
    map.water[tile] === 0 &&
    map.mineral[tile] === 0 &&
    (map.terrain[tile] === code.grass || map.terrain[tile] === code.scrub)
  );
}

/**
 * Stamps a new unfinished one-tile building at an exact tile (a wall segment, M3.8) and announces
 * it. Returns null when the tile is not free grass or scrub.
 */
export function beginBuildingAt(
  content: SiteContent,
  active: ActiveSite,
  defId: string,
  tile: number,
  emit: Emit,
  label: SiteLabel,
): Building | null {
  const { site: rules, steward } = content;
  const map = active.map;
  if (!buildableTile(content, active, tile)) return null;
  let id = 1;
  for (const key of active.buildings.keys()) id = Math.max(id, key + 1);
  const ground = map.terrain[tile]!;
  const b = stampBuilding(map, rules, id, defId, tile % map.width, Math.floor(tile / map.width));
  // The builders stand on the tile, so it blocks only once the wall is finished.
  map.terrain[tile] = ground;
  b.condition = 0;
  b.progress = 0;
  b.delivered = {};
  const event = emit({
    type: steward.events.buildBegun,
    place: label.cell,
    data: { site: label.name, building: buildingDef(rules, defId).name },
  });
  b.begunEvent = event.id;
  active.buildings.set(id, b);
  active.layoutVersion += 1;
  invalidatePaths(active, b.cells);
  return b;
}

/** The first burnt building not yet being raised again, by id: a home, workshop or other buildable. */
export function burntBuilding(active: ActiveSite, buildable: (defId: string) => boolean) {
  let found: Building | undefined;
  for (const b of active.buildings.values()) {
    if (!b.burnt || b.progress !== undefined || !buildable(b.defId)) continue;
    if (!found || b.id < found.id) found = b;
  }
  return found;
}

/** Begins raising a burnt building again where it stood (M3.4); the owner's household stays housed meanwhile. */
export function restartBuilding(
  content: SiteContent,
  active: ActiveSite,
  b: Building,
  emit: Emit,
  label: SiteLabel,
): void {
  b.condition = 0;
  b.progress = 0;
  b.delivered = {};
  const event = emit({
    type: content.steward.events.buildBegun,
    actors: b.owner === null ? [] : [b.owner],
    place: label.cell,
    data: { site: label.name, building: buildingDef(content.site, b.defId).name },
  });
  b.begunEvent = event.id;
  active.layoutVersion += 1;
}

/** Marks a building done: full condition, a path to its door, and its household moved in. */
export function finishBuilding(
  content: SiteContent,
  active: ActiveSite,
  b: Building,
  emit: Emit,
  label: SiteLabel,
): void {
  const { site: rules, steward } = content;
  delete b.progress;
  delete b.delivered;
  // A burnt building raised again: its household moves back from wherever it was taken in.
  const rebuilt = b.burnt === true;
  delete b.burnt;
  delete b.burntDay;
  b.condition = 100;
  emit({
    type: steward.events.built,
    actors: b.owner === null ? [] : [b.owner],
    place: label.cell,
    causes: b.begunEvent === undefined ? [] : [b.begunEvent],
    data: { site: label.name, building: buildingDef(rules, b.defId).name },
  });
  if (b.defId === steward.homeBuilding && b.owner !== null) {
    for (const household of active.households.values()) {
      if (household.head !== b.owner) continue;
      const old = household.home === null ? undefined : active.buildings.get(household.home);
      if (old && old !== b) old.owner = null;
      household.home = b.id;
      if (rebuilt) delete household.lodgingHome;
    }
  }
  // A wall segment has no door to reach.
  if (b.defId === 'wall') {
    for (const k of b.cells) active.map.terrain[k] = siteCodes(rules).wall;
    active.layoutVersion += 1;
    invalidatePaths(active, b.cells);
    return;
  }
  // A path from the door to the nearest path tile.
  const map = active.map;
  const code = rules.terrains.findIndex((t) => t.id === 'path');
  const dx = b.x + (b.w >> 1);
  const dy = b.y + b.h;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < map.terrain.length; k += 1) {
    if (map.terrain[k] !== code || map.water[k] !== 0) continue;
    const x = k % map.width;
    const y = (k - x) / map.width;
    const d = manhattan(x, y, dx, dy);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best >= 0) {
    const bx = best % map.width;
    carvePath(map, rules, dx, dy, bx, (best - bx) / map.width, false);
  }
  active.layoutVersion += 1;
  // The new path only makes walking cheaper, so cached routes stay good.
  invalidatePaths(active, []);
}
