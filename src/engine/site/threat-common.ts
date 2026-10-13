// Shared parts of the site threats (M3.8): ground (where attackers are seen and what they make
// for), the people who can fight, and the walls planned after an attack.

import { DAYS_PER_YEAR } from '../core/clock';
import type { EmitInput } from '../core/context';
import type { CreatureTier, MemoryDef, ThreatRules } from '../core/content-types';
import { clamp, sortedById } from '../core/math';
import type {
  ActiveSite,
  Id,
  Person,
  RegionKind,
  SimEvent,
  SiteThreat,
  WorldState,
} from '../core/types';
import { soldierEquivalent } from '../people/combat-scale';
import { beginBuildingAt, buildableTile, type SiteLabel } from './build';
import { bandOfAge, type Band, type SiteContent } from './defs';
import { addMemoryTo } from './memory';
import { tileCost } from './path';
import { itemCount } from './stock';
import { residentItems } from './work';

export type Emit = (input: EmitInput) => SimEvent;

export const histYear = (world: WorldState, active: ActiveSite) =>
  world.params.historyYears + Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR);

export const alive = (p: Person | undefined): p is Person =>
  p !== undefined && p.died === undefined && p.detail !== undefined;

export const tierOf = (t: Pick<SiteThreat, 'kind' | 'tier'>): CreatureTier | 'raid' =>
  t.kind === 'raid' ? 'raid' : t.tier!;

export function setLast(list: [Id, number][], id: Id, day: number): void {
  const found = list.find(([key]) => key === id);
  if (found) found[1] = day;
  else list.push([id, day]);
}
export const lastOf = (list: readonly [Id, number][], id: Id): number =>
  list.find(([key]) => key === id)?.[1] ?? -Infinity;

// ---- Geometry ----

/** The compass word for the direction of (dx, dy), y growing southward. */
export function compassWord(rules: ThreatRules, dx: number, dy: number): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let at: number;
  if (ay * 2 <= ax) at = dx > 0 ? 2 : 6;
  else if (ax * 2 <= ay) at = dy > 0 ? 4 : 0;
  else if (dx > 0) at = dy < 0 ? 1 : 3;
  else at = dy > 0 ? 5 : 7;
  return rules.compass[at]!;
}

/** Region kinds a lair can be named by (rivers and seas are not places to den in). */
const LAIR_REGIONS: readonly RegionKind[] = [
  'range',
  'forest',
  'desert',
  'lake',
  'island',
  'volcano',
  'pass',
];

/** ", out of its lair in the Ironteeth", or in the wild to the {dir} when no named region holds it. */
export function lairClause(
  world: WorldState,
  rules: ThreatRules,
  lair: number,
  dir: string,
): string {
  let place = rules.beasts.wild.replace('{dir}', dir);
  for (const region of sortedById(world.regions.values())) {
    if (!LAIR_REGIONS.includes(region.kind)) continue;
    // Region cells are ascending: a binary search finds the lair.
    let lo = 0;
    let hi = region.cells.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = region.cells[mid]!;
      if (c === lair) break;
      if (c < lair) lo = mid + 1;
      else hi = mid - 1;
    }
    if (lo <= hi) {
      place = region.name;
      break;
    }
  }
  return rules.beasts.lair.replace('{place}', place);
}

/** Tiles kept between where attackers are first seen and the map's edge, so they show with ground around them. */
const EDGE_MARGIN = 8;

/** The farthest home (Chebyshev tiles from the origin, up to `walls.maxRing`) on the side of (ex, ey). */
function homeReach(content: SiteContent, active: ActiveSite, ex: number, ey: number): number {
  const w = active.map.width;
  const [ox, oy] = active.origin;
  let reach = 0;
  for (const b of active.buildings.values()) {
    if (b.defId !== content.steward.homeBuilding) continue;
    for (const k of b.cells) {
      const x = (k % w) - ox;
      const y = Math.floor(k / w) - oy;
      const far = Math.max(Math.abs(x), Math.abs(y));
      if (x * ex + y * ey > 0 && far <= content.threats.walls.maxRing) reach = Math.max(reach, far);
    }
  }
  return reach;
}

/**
 * Where attackers coming along (dx, dy) are first seen: `approach` tiles beyond the outermost home
 * on that side, on walkable ground, clear of the map's edge. The camp of a flight uses it too.
 */
export function approachToward(
  content: SiteContent,
  active: ActiveSite,
  dx: number,
  dy: number,
): number {
  const { map, origin } = active;
  const size = map.width;
  // A lair in the site's own cell is taken to lie to the north.
  const [ux, uy] = dx === 0 && dy === 0 ? [0, -1] : [dx, dy];
  const um = Math.max(Math.abs(ux), Math.abs(uy));
  const r = homeReach(content, active, ux, uy) + content.threats.approach;
  const margin = Math.min(EDGE_MARGIN, Math.floor(size / 4));
  const x0 = clamp(origin[0] + Math.round((ux * r) / um), margin, size - 1 - margin);
  const y0 = clamp(origin[1] + Math.round((uy * r) / um), margin, map.height - 1 - margin);
  for (let k = 0; k <= margin; k += 1) {
    for (let y = y0 - k; y <= y0 + k; y += 1) {
      for (let x = x0 - k; x <= x0 + k; x += 1) {
        if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) !== k) continue;
        const tile = y * size + x;
        if (tileCost(active, content.site, content.life, tile) > 0) return tile;
      }
    }
  }
  return origin[1] * size + origin[0];
}

/** What attackers make for: the stockpile, else the green. */
export function targetOf(active: ActiveSite): number {
  let best: { id: number; tile: number } | undefined;
  for (const b of active.buildings.values()) {
    if (b.defId === 'stockpile' && (!best || b.id < best.id))
      best = { id: b.id, tile: b.cells[0]! };
  }
  return best ? best.tile : active.origin[1] * active.map.width + active.origin[0];
}

export const dist = (width: number, a: number, b: number) =>
  Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)),
  );

export const tileOfPos = (p: Person, width: number): number => {
  const [x, y] = p.detail!.pos!;
  return y * width + x;
};

// ---- People ----

export function bandOf(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  p: Person,
): Band {
  const race = content.races.find((r) => r.id === p.raceId)!;
  return bandOfAge(race, histYear(world, active) - p.born);
}

/** Adults on their feet who could take up arms: not in bed, not in despair or wandering. */
export function ableAdults(world: WorldState, content: SiteContent, active: ActiveSite): Person[] {
  const out: Person[] = [];
  for (const id of active.residents) {
    const p = world.people.get(id);
    if (!alive(p) || p.detail!.abed) continue;
    const kind = p.detail!.breakdown?.kind;
    if (kind === 'despair' || kind === 'wandering') continue;
    if (bandOf(world, content, active, p) === 'adult') out.push(p);
  }
  return out;
}

/** Combat value of what each resident holds. */
export function weaponsOf(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const held of residentItems(world, content, active)) {
    for (const e of held.def.effects ?? []) {
      if (e.kind === 'combat') out.set(held.holder, (out.get(held.holder) ?? 0) + e.value);
    }
  }
  return out;
}

/** Wall segments stand on the side the attackers come from. */
export function wallsFacing(content: SiteContent, active: ActiveSite, edge: number): boolean {
  const w = active.map.width;
  const ex = (edge % w) - active.origin[0];
  const ey = Math.floor(edge / w) - active.origin[1];
  for (const b of active.buildings.values()) {
    if (b.defId !== content.threats.walls.building || b.progress !== undefined) continue;
    const wx = (b.cells[0]! % w) - active.origin[0];
    const wy = Math.floor(b.cells[0]! / w) - active.origin[1];
    if (wx * ex + wy * ey > 0) return true;
  }
  return false;
}

/** One person's worth in soldier equivalents against the threat now: weapon, tiredness, wall. */
export function strengthOf(
  content: SiteContent,
  p: Person,
  weapon: number,
  walls: boolean,
): number {
  const c = content.threats.combat;
  const rest = p.detail?.needs['rest'] ?? 100;
  const tired = c.fatigueBase + ((1 - c.fatigueBase) * rest) / 100;
  return (soldierEquivalent(p) + c.weaponMul * weapon) * tired * (walls ? c.wallBonus : 1);
}

const memoryDefs = new WeakMap<object, Map<string, MemoryDef>>();
export function remember(
  content: SiteContent,
  world: WorldState,
  p: Person,
  type: string,
  eventId?: Id,
): void {
  if (!p.detail) return;
  let defs = memoryDefs.get(content.memories);
  if (!defs)
    memoryDefs.set(content.memories, (defs = new Map(content.memories.map((m) => [m.id, m]))));
  addMemoryTo(defs, content.life.memoryCap, p.detail, type, world.day, undefined, eventId);
}

/** The attackers' strength in soldier equivalents now. */
export function attackOf(content: SiteContent, t: SiteThreat): number {
  if (t.kind === 'raid') return t.count * content.threats.raids.perHead;
  const def = content.creatures.find((d) => d.id === t.defId);
  return (def?.danger ?? 1) * t.vigour;
}

/** The standing homes: finished and not burnt. */
export const homesStanding = (content: SiteContent, active: ActiveSite): number =>
  [...active.buildings.values()].filter(
    (b) => b.defId === content.steward.homeBuilding && b.progress === undefined && !b.burnt,
  ).length;

/** Plans wall tiles in an arc on the side the attack came from, outside the outermost home there. */
export function planWalls(content: SiteContent, active: ActiveSite, edge: number): void {
  const rules = content.threats.walls;
  const w = active.map.width;
  const [ox, oy] = active.origin;
  const ex = (edge % w) - ox;
  const ey = Math.floor(edge / w) - oy;
  const reach = homeReach(content, active, ex, ey);
  // Walls already waiting are raised first.
  if (active.threats.wallPlan.length >= rules.segments) return;
  const radius = reach + rules.ringPad;
  const planned = new Set(active.threats.wallPlan);
  const ring: { tile: number; off: number }[] = [];
  for (let y = oy - radius; y <= oy + radius; y += 1) {
    for (let x = ox - radius; x <= ox + radius; x += 1) {
      if (Math.max(Math.abs(x - ox), Math.abs(y - oy)) !== radius) continue;
      if (x < 1 || y < 1 || x >= w - 1 || y >= active.map.height - 1) continue;
      const dx = x - ox;
      const dy = y - oy;
      if (dx * ex + dy * ey <= 0) continue;
      const tile = y * w + x;
      if (planned.has(tile) || !buildableTile(content, active, tile)) continue;
      ring.push({ tile, off: Math.abs(dx * ey - dy * ex) });
    }
  }
  ring.sort((a, b) => a.off - b.off || a.tile - b.tile);
  for (const r of ring.slice(0, rules.segments)) active.threats.wallPlan.push(r.tile);
}

/**
 * The steward raises the next planned wall segment through the normal building queue, once the
 * stone for it stands in the stores. Returns true if one was begun.
 */
export function beginWall(
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): boolean {
  const def = content.site.buildings.find((b) => b.id === content.threats.walls.building);
  const plan = active.threats.wallPlan;
  if (!def || plan.length === 0) return false;
  for (const [item, n] of Object.entries(def.cost ?? {}))
    if (itemCount(active, item) < n) return false;
  while (plan.length > 0) {
    const tile = plan.shift()!;
    if (beginBuildingAt(content, active, def.id, tile, emit, label)) {
      active.threats.stats.walls += 1;
      return true;
    }
  }
  return false;
}
