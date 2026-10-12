// Outposts (M3.1): found a hamlet on an empty, farmable cell with settlers from the nearest site
// of a living civ on the same landmass.

import { createEmitter } from '../core/context';
import { streamFor } from '../core/rng';
import type { Id, Site, WorldCells, WorldState } from '../core/types';
import { emptyGoods } from '../history/goods';
import { addParty, movablePop, partySize, takeParty } from '../history/pop';
import { buildSettlePlaces, popBands, siteCapacity, siteFeatures } from '../history/settle';
import { culturePlaceName } from '../people/names';
import { landmasses } from '../worldgen/regions';
import type { SiteContent } from './defs';

export type OutpostCheck =
  | { ok: true; fromSiteId: Id; settlers: number; travelDays: number }
  | { ok: false; reason: string };

/** An origin needs this many times the smallest party in children and adults, so it is not emptied. */
const ORIGIN_MIN_PARTIES = 2;
/** Tries to find a place name no other site has. */
const NAME_TRIES = 8;

// Landmass numbers only depend on the cells, so they are worked out once per world.
const landmassCache = new WeakMap<WorldCells, Int32Array>();
function landmassesOf(cells: WorldCells): Int32Array {
  let found = landmassCache.get(cells);
  if (!found) {
    found = landmasses(cells);
    landmassCache.set(cells, found);
  }
  return found;
}

/** Summed travel cost along the straight (Bresenham) line from `from` to `to`, start excluded. */
function lineCost(cells: WorldCells, from: number, to: number): number {
  const w = cells.width;
  let x = from % w;
  let y = (from - x) / w;
  const x1 = to % w;
  const y1 = (to - x1) / w;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let err = dx + dy;
  let cost = 0;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    cost += cells.travelCost[y * w + x]!;
  }
  return cost;
}

export function outpostCheck(world: WorldState, content: SiteContent, cell: number): OutpostCheck {
  const cells = world.cells;
  if (!cells) return { ok: false, reason: 'The world has no map yet' };
  const rules = content.site.outpost;
  if (cells.water[cell] !== 0) return { ok: false, reason: 'Water' };
  for (const site of world.sites.values()) {
    if (site.cell === cell && site.ruinedYear === undefined) {
      return { ok: false, reason: 'A site is already here' };
    }
  }
  const fertility = cells.fertility[cell]!;
  if (fertility < rules.minFertility) {
    return { ok: false, reason: `Too poor to farm (fertility ${fertility})` };
  }
  const landmass = landmassesOf(cells);
  const w = cells.width;
  const tx = cell % w;
  const ty = (cell - tx) / w;
  let best: Site | undefined;
  let bestD = Infinity;
  for (const site of world.sites.values()) {
    if (site.ruinedYear !== undefined || site.civId === null) continue;
    const civ = world.civs.get(site.civId);
    if (!civ || civ.fell !== undefined) continue;
    if (landmass[site.cell] !== landmass[cell]) continue;
    if (movablePop(site) < rules.settlers[0] * ORIGIN_MIN_PARTIES) continue;
    const sx = site.cell % w;
    const sy = (site.cell - sx) / w;
    const d = (sx - tx) * (sx - tx) + (sy - ty) * (sy - ty);
    // Sites iterate in id order, so a tie keeps the lower id.
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  if (!best) return { ok: false, reason: 'No people can reach this cell' };
  const [lo, hi] = rules.settlers;
  const settlers = Math.min(hi, Math.max(lo, Math.floor(movablePop(best) * rules.settlerShare)));
  const travelDays = Math.max(
    1,
    Math.ceil(lineCost(cells, best.cell, cell) / content.site.travelCostPerDay),
  );
  return { ok: true, fromSiteId: best.id, settlers, travelDays };
}

/** Founds a hamlet at `cell` with settlers from the origin and returns its id. The caller embarks on it. */
export function foundOutpost(
  world: WorldState,
  content: SiteContent,
  cell: number,
  name: string | null,
): Id {
  const cells = world.cells;
  const check = outpostCheck(world, content, cell);
  if (!cells || !check.ok) throw new Error(check.ok ? 'No map.' : check.reason);
  const origin = world.sites.get(check.fromSiteId)!;
  const civ = world.civs.get(origin.civId!)!;
  const race = content.races.find((r) => r.id === civ.raceId)!;
  const culture = content.cultures.find((c) => c.id === civ.cultureId)!;
  const rules = content.site.outpost;
  let siteName = name;
  if (siteName === null) {
    const rng = streamFor(world, 'site.outpost');
    for (let t = 0; t < NAME_TRIES; t += 1) {
      siteName = culturePlaceName(culture.names, rng);
      if (![...world.sites.values()].some((s) => s.name === siteName)) break;
    }
  }
  const features = siteFeatures(
    cells,
    cell,
    buildSettlePlaces(cells, world.regions.values(), world.routes),
    content,
  );
  const party = takeParty(origin, check.settlers);
  const settlers = partySize(party);
  const site: Site = {
    id: world.nextId.site,
    name: siteName!,
    kind: 'hamlet',
    cell,
    civId: civ.id,
    founded: world.params.historyYears,
    pop: popBands(0, race, culture, content.settlement),
    goods: emptyGoods(),
    wealth: 0,
    capacity: siteCapacity(cells, cell, race, content, features),
    features: [...features],
    peakPop: settlers,
  };
  world.nextId.site += 1;
  addParty(site, party);
  // The party carries food from the origin's stores, as much as it has.
  const food = Math.min(origin.goods.food, Math.round(settlers * rules.foodPerSettler));
  origin.goods.food -= food;
  site.goods.food = food;
  world.sites.set(site.id, site);
  createEmitter(
    world,
    content.eventTypes,
  )({
    type: 'outpost_founded',
    place: cell,
    causes: [],
    data: { site: site.name, civ: civ.name, from: origin.name, settlers },
  });
  return site.id;
}
