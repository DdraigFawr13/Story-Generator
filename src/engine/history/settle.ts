// Settlement (M2.2): after the routes stage, founding peoples pick the best land for their
// culture, each starting with one or two sites. Also computes each site's carrying capacity,
// its starting population by age band, and the per-cell territory layer.
//
// Randomness: `history.settle` (shuffles and jitter) and `history.names` (site names) only, so
// terrain, regions and routes of a seed never change. Everything iterates in cell or id order.

import { createEmitter } from '../core/context';
import type { ContentBundle, CultureDef, RaceDef, SettlementRules } from '../core/content-types';
import { streamFor, type RngStream } from '../core/rng';
import { emptyGoods } from './goods';
import { totalPop } from './pop';
import type {
  Civ,
  Id,
  PopBand,
  Region,
  RegionKind,
  RouteGraph,
  Site,
  SiteFeature,
  SiteKind,
  WorldCells,
  WorldState,
} from '../core/types';
import { culturePlaceName } from '../people/names';
import { D8_DX, D8_DY, CellHeap } from '../worldgen/grid';
import { landmasses } from '../worldgen/regions';

/** What the settle stage reads from content. */
export type SettleContent = Pick<
  ContentBundle,
  'biomes' | 'resources' | 'races' | 'cultures' | 'eventTypes' | 'settlement'
>;

/** Per-cell flags of strategic places, built once from regions and routes. */
export interface SettlePlaces {
  harbour: Uint8Array;
  ford: Uint8Array;
  pass: Uint8Array;
  /** Route nodes (harbours, fords, passes, river mouths). */
  node: Uint8Array;
  /** Aura spot cells. */
  auraSpot: Uint8Array;
}

export function buildSettlePlaces(
  cells: Pick<WorldCells, 'width' | 'height' | 'auraSpots'>,
  regions: Iterable<Region>,
  routes: RouteGraph,
): SettlePlaces {
  const size = cells.width * cells.height;
  const places: SettlePlaces = {
    harbour: new Uint8Array(size),
    ford: new Uint8Array(size),
    pass: new Uint8Array(size),
    node: new Uint8Array(size),
    auraSpot: new Uint8Array(size),
  };
  const byKind: Partial<Record<RegionKind, Uint8Array>> = {
    harbour: places.harbour,
    ford: places.ford,
    pass: places.pass,
  };
  for (const region of regions) {
    const flags = byKind[region.kind];
    if (flags) for (const cell of region.cells) flags[cell] = 1;
  }
  for (const node of routes.nodes) places.node[node.cell] = 1;
  for (const spot of cells.auraSpots) places.auraSpot[spot.cell] = 1;
  return places;
}

/** True when `test` holds for any in-bounds cell within `radius` (Chebyshev) of `cell`. */
function anyWithin(
  cells: Pick<WorldCells, 'width' | 'height'>,
  cell: number,
  radius: number,
  test: (i: number) => boolean,
): boolean {
  const { width, height } = cells;
  const cx = cell % width;
  const cy = (cell - cx) / width;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      if (test(y * width + x)) return true;
    }
  }
  return false;
}

/** Chebyshev distance between two cells. */
export function cellDistance(width: number, a: number, b: number): number {
  return Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)),
  );
}

/** Why a cell is a good place to settle, in a fixed feature order. */
export function siteFeatures(
  cells: WorldCells,
  cell: number,
  places: SettlePlaces,
  content: Pick<SettleContent, 'biomes' | 'resources' | 'settlement'>,
): SiteFeature[] {
  const rules = content.settlement;
  const radius = rules.featureRadius;
  const out: SiteFeature[] = [];
  if (anyWithin(cells, cell, radius.river, (i) => cells.water[i] === 1)) out.push('river');
  if (cells.floodplain[cell] === 1) out.push('floodplain');
  if (anyWithin(cells, cell, radius.coast, (i) => cells.water[i] === 3)) out.push('coast');
  if (anyWithin(cells, cell, radius.harbour, (i) => places.harbour[i] === 1)) out.push('harbour');
  if (anyWithin(cells, cell, radius.ford, (i) => places.ford[i] === 1)) out.push('ford');
  if (anyWithin(cells, cell, radius.pass, (i) => places.pass[i] === 1)) out.push('pass');
  if (cells.roads[cell]! > 0) out.push('road');
  const mineral = new Set<number>();
  content.resources.forEach((r, n) => {
    if (rules.mineCategories.includes(r.category)) mineral.add(n);
  });
  const hasMineral = (i: number) =>
    (cells.resources.get(i) ?? []).some((d) => mineral.has(d.resource));
  if (anyWithin(cells, cell, radius.deposit, hasMineral)) out.push('deposit');
  if (
    cells.aura[cell]! >= rules.auraMin ||
    anyWithin(cells, cell, radius.aura, (i) => places.auraSpot[i] === 1)
  ) {
    out.push('aura');
  }
  const biome = content.biomes[cells.biome[cell]!];
  if (biome?.forest) out.push('forest');
  if (cells.elevation[cell]! >= rules.heightsMin) out.push('heights');
  if (
    biome &&
    rules.plainsBiomes.includes(biome.id) &&
    cells.travelCost[cell]! <= rules.plainsMaxTravel
  ) {
    out.push('plains');
  }
  return out;
}

/** Indexes of the content's mineral resources (the categories that make a mine). */
export function mineralIndexes(
  content: Pick<SettleContent, 'resources' | 'settlement'>,
): Set<number> {
  const mineral = new Set<number>();
  content.resources.forEach((r, n) => {
    if (content.settlement.mineCategories.includes(r.category)) mineral.add(n);
  });
  return mineral;
}

/** Mineral resources within `radius` (Chebyshev) of a cell. */
export function mineralsNear(
  cells: Pick<WorldCells, 'width' | 'height' | 'resources'>,
  cell: number,
  radius: number,
  mineral: ReadonlySet<number>,
): Set<number> {
  const found = new Set<number>();
  const { width, height } = cells;
  const cx = cell % width;
  const cy = (cell - cx) / width;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      for (const d of cells.resources.get(y * width + x) ?? []) {
        if (mineral.has(d.resource)) found.add(d.resource);
      }
    }
  }
  return found;
}

/** The nearest aura spot cell within `radius` (Chebyshev) of a cell, or -1 (ties go to the lowest cell). */
export function nearestAuraSpot(
  cells: Pick<WorldCells, 'width' | 'auraSpots'>,
  cell: number,
  radius: number,
): number {
  let best = -1;
  let bestDistance = Infinity;
  for (const spot of cells.auraSpots) {
    const distance = cellDistance(cells.width, cell, spot.cell);
    if (distance <= radius && distance < bestDistance) {
      bestDistance = distance;
      best = spot.cell;
    }
  }
  return best;
}

/** The feature a culture's `SitePreference` asks for. */
const PREFERENCE_FEATURES: Record<string, SiteFeature[]> = {
  river: ['river', 'floodplain'],
  coast: ['coast'],
  aura: ['aura'],
  plains: ['plains'],
  deposit: ['deposit'],
  forest: ['forest'],
  heights: ['heights'],
};

/** Mean fertility over the reach window (water counts as 0). */
function meanFertility(cells: WorldCells, cell: number, reach: number): number {
  const { width, height } = cells;
  const cx = cell % width;
  const cy = (cell - cx) / width;
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, cy - reach); y <= Math.min(height - 1, cy + reach); y += 1) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(width - 1, cx + reach); x += 1) {
      sum += cells.fertility[y * width + x]!;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

/** How good a cell is for a culture to settle (before jitter); `nearNode` = a route node within reach. */
export function suitability(
  cells: WorldCells,
  cell: number,
  culture: Pick<CultureDef, 'preferredBiomes' | 'sitePreferences'>,
  features: readonly SiteFeature[],
  rules: SettlementRules,
  biomeIds: readonly string[],
  nearNode = false,
): number {
  const w = rules.suitability;
  let score = w.fertility * meanFertility(cells, cell, rules.reach);
  if (culture.preferredBiomes.includes(biomeIds[cells.biome[cell]!] ?? ''))
    score += w.preferredBiome;
  for (const preference of culture.sitePreferences) {
    if (PREFERENCE_FEATURES[preference]?.some((f) => features.includes(f))) score += w.preference;
  }
  if (nearNode) score += w.routeNode;
  return score;
}

/** People the land within reach feeds: farming, fish and game, scaled for trade access, per race food need. */
export function siteCapacity(
  cells: WorldCells,
  cell: number,
  race: Pick<RaceDef, 'id' | 'foodNeed' | 'preferredBiomes'>,
  content: Pick<SettleContent, 'biomes' | 'resources' | 'settlement'>,
  features: readonly SiteFeature[],
): number {
  const rules = content.settlement;
  const weights = rules.capacity;
  const fish = content.resources.findIndex((r) => r.id === rules.fishId);
  const game = content.resources.findIndex((r) => r.id === rules.gameId);
  const { width, height } = cells;
  const cx = cell % width;
  const cy = (cell - cx) / width;
  let food = 0;
  let auraSum = 0;
  let windowCells = 0;
  for (let y = Math.max(0, cy - rules.reach); y <= Math.min(height - 1, cy + rules.reach); y += 1) {
    for (
      let x = Math.max(0, cx - rules.reach);
      x <= Math.min(width - 1, cx + rules.reach);
      x += 1
    ) {
      const i = y * width + x;
      const water = cells.water[i];
      auraSum += cells.aura[i]!;
      windowCells += 1;
      // Lakes and sea cannot be farmed; their fish still count.
      if (water === 0 || water === 1) {
        // A race farms its own biomes well and foreign land poorly.
        const home = race.preferredBiomes.includes(content.biomes[cells.biome[i]!]?.id ?? '');
        food += weights.perFertility * cells.fertility[i]! * (home ? 1 : weights.foreignBiome);
      }
      for (const deposit of cells.resources.get(i) ?? []) {
        if (deposit.resource === fish) food += weights.fishPerAmount * deposit.amount;
        else if (deposit.resource === game) food += weights.gamePerAmount * deposit.amount;
      }
    }
  }
  if (features.includes('harbour')) food *= weights.port;
  if (features.includes('ford')) food *= weights.ford;
  if (features.includes('road')) food *= weights.road;
  for (const feature of features) food *= weights.raceFeature[race.id]?.[feature] ?? 1;
  const aura = weights.raceAura[race.id];
  if (aura && windowCells > 0) {
    food *= Math.max(aura.min, Math.min(aura.max, auraSum / windowCells / aura.ref));
  }
  const without = weights.raceWithout[race.id];
  if (without) {
    for (const feature of Object.keys(without) as SiteFeature[]) {
      if (!features.includes(feature)) food *= without[feature]!;
    }
  }
  return Math.round(food / race.foodNeed);
}

/** Splits a population into child, adult and elder bands; the counts always sum to `total`. */
export function popBands(
  total: number,
  race: Pick<RaceDef, 'id' | 'lifespanYears' | 'maturityYears'>,
  culture: Pick<CultureDef, 'id'>,
  rules: SettlementRules,
): PopBand[] {
  const bands = rules.ageBands;
  const childShare = Math.max(
    bands.childMin,
    Math.min(bands.childMax, (race.maturityYears / race.lifespanYears) * bands.childFactor),
  );
  const child = Math.round(total * childShare);
  const elder = Math.round(total * bands.elderShare);
  const adult = Math.max(0, total - child - elder);
  const make = (band: PopBand['band'], count: number): PopBand => ({
    raceId: race.id,
    cultureId: culture.id,
    band,
    count,
  });
  return [make('child', child), make('adult', adult), make('elder', total - child - adult)];
}

/** Total people at a site. */
export const sitePopulation = totalPop;

export function sizeKind(pop: number, rules: SettlementRules): SiteKind {
  for (const [limit, kind] of rules.kindByPop) if (pop < limit) return kind;
  return 'city';
}

/** Territory: each cell goes to the civ of the nearest site by travel cost, within `reach`. */
export function computeTerritory(
  cells: Pick<WorldCells, 'width' | 'height' | 'water' | 'travelCost' | 'wildness'>,
  sites: readonly Pick<Site, 'id' | 'cell' | 'civId'>[],
  reach: number,
  wild: { deepWild: number; deepWildClaim: number },
): Uint16Array {
  const { width, height } = cells;
  const size = width * height;
  const dist = new Float64Array(size).fill(Infinity);
  const ownerSite = new Int32Array(size);
  const done = new Uint8Array(size);
  const heap = new CellHeap(size * 8 + sites.length);
  const civOf = new Map<Id, Id>();
  for (const site of sites) {
    if (site.civId === null) continue;
    civOf.set(site.id, site.civId);
    dist[site.cell] = 0;
    ownerSite[site.cell] = site.id;
    heap.push(site.cell, 0);
  }
  while (heap.size > 0) {
    const cell = heap.pop();
    if (done[cell]) continue;
    done[cell] = 1;
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const to = ny * width + nx;
      // Sea and lakes are impassable for territory; so is anything marked blocked.
      if (
        done[to] ||
        cells.water[to] === 3 ||
        cells.water[to] === 2 ||
        cells.travelCost[to]! >= 255
      )
        continue;
      const cost = cells.travelCost[to]!;
      const next =
        dist[cell]! + (cells.wildness[to]! >= wild.deepWild ? cost * wild.deepWildClaim : cost);
      if (next > reach) continue;
      if (next < dist[to]! || (next === dist[to]! && ownerSite[cell]! < ownerSite[to]!)) {
        dist[to] = next;
        ownerSite[to] = ownerSite[cell]!;
        heap.push(to, next);
      }
    }
  }
  const out = new Uint16Array(size);
  for (let i = 0; i < size; i += 1) if (done[i]) out[i] = civOf.get(ownerSite[i]!) ?? 0;
  return out;
}

function shuffle<T>(items: readonly T[], rng: RngStream): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Dry candidate cells and what scoring them needs; built once and shared with the history stage. */
export interface SettleSearch {
  /** Ascending dry, passable, off-edge cells. */
  candidates: number[];
  /** Features per candidate cell (undefined elsewhere). */
  featuresAt: (SiteFeature[] | undefined)[];
  places: SettlePlaces;
  landmass: Int32Array;
  /** Suitability of a candidate cell for a culture, without jitter. */
  scoreCell(culture: CultureDef, cell: number): number;
}

export function buildSettleSearch(
  cells: WorldCells,
  content: SettleContent,
  places: SettlePlaces,
): SettleSearch {
  const rules = content.settlement;
  const { width, height } = cells;
  const size = width * height;
  const biomeIds = content.biomes.map((b) => b.id);
  const candidates: number[] = [];
  const featuresAt: (SiteFeature[] | undefined)[] = new Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = i % width;
    const y = (i - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
    if (cells.water[i] !== 0 || cells.travelCost[i]! >= 255) continue;
    candidates.push(i);
    featuresAt[i] = siteFeatures(cells, i, places, content);
  }
  return {
    candidates,
    featuresAt,
    places,
    landmass: landmasses(cells),
    scoreCell: (culture, cell) =>
      suitability(
        cells,
        cell,
        culture,
        featuresAt[cell]!,
        rules,
        biomeIds,
        anyWithin(cells, cell, rules.featureRadius.routeNode, (i) => places.node[i] === 1),
      ),
  };
}

/** The settle stage: fills `world.civs`, `world.sites`, `cells.territory` and emits founding events. */
export function settleWorld(world: WorldState, content: SettleContent): void {
  const cells = world.cells;
  if (!cells) throw new Error('settleWorld needs generated cells.');
  const rules = content.settlement;
  const { width, height } = cells;
  const size = width * height;
  const rng = streamFor(world, 'history.settle');
  const nameRng = streamFor(world, 'history.names');
  const emit = createEmitter(world, content.eventTypes);
  const places = buildSettlePlaces(cells, world.regions.values(), world.routes);
  const search = buildSettleSearch(cells, content, places);
  const { candidates, featuresAt, landmass } = search;
  let landCells = 0;
  for (let i = 0; i < size; i += 1) if (cells.water[i] !== 3) landCells += 1;
  const jitter = new Float64Array(size);
  for (const i of candidates) jitter[i] = rng.int(1000) * (rules.suitability.jitter / 1000);

  // 2. Civ count and cultures.
  const civCount = Math.max(
    rules.civs.min,
    Math.min(
      rules.civs.max,
      Math.floor(landCells / rules.civs.landCellsPerCiv) +
        rng.int(2 * rules.civs.jitter + 1) -
        rules.civs.jitter,
    ),
  );
  // Every race founds a people before any race founds a second: the first culture of each race in
  // the shuffled order goes first, the rest keep their shuffled order.
  const shuffled = shuffle(content.cultures, rng);
  const leads = shuffled.filter(
    (culture, i) => shuffled.findIndex((c) => c.raceId === culture.raceId) === i,
  );
  const order = [...leads, ...shuffled.filter((culture) => !leads.includes(culture))];
  const raceOf = new Map(content.races.map((r) => [r.id, r]));
  const sites: Site[] = [];
  const capitals: number[] = [];
  const near = (a: number, b: number, dist: number) => cellDistance(width, a, b) < dist;

  const bestCell = (culture: CultureDef, allowed: (cell: number) => boolean): number => {
    let best = -1;
    let bestScore = -Infinity;
    for (const cell of candidates) {
      if (!allowed(cell)) continue;
      const score = search.scoreCell(culture, cell) + jitter[cell]!;
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    return best;
  };

  const siteName = (culture: CultureDef): string => {
    let name = '';
    for (let tries = 0; tries < 5; tries += 1) {
      name = culturePlaceName(culture.names, nameRng);
      if (!sites.some((s) => s.name === name)) break;
    }
    return name;
  };

  const makeSite = (
    culture: CultureDef,
    race: RaceDef,
    cell: number,
    civId: Id,
    popRange: [number, number],
    kind: (pop: number, features: SiteFeature[]) => SiteKind,
  ): Site => {
    const features = featuresAt[cell]!;
    const capacity = siteCapacity(cells, cell, race, content, features);
    const wanted = rng.between(popRange[0], popRange[1]);
    const total = Math.min(
      wanted,
      Math.max(rules.minPop, Math.floor(capacity * rules.popCapacityShare)),
    );
    const site: Site = {
      id: world.nextId.site,
      name: siteName(culture),
      kind: kind(total, features),
      cell,
      civId,
      founded: 0,
      pop: popBands(total, race, culture, rules),
      goods: {
        ...emptyGoods(),
        food: Math.round(total * race.foodNeed * rules.storesYears),
      },
      wealth: 0,
      capacity,
      features: [...features],
      peakPop: 0,
    };
    site.peakPop = sitePopulation(site);
    world.nextId.site += 1;
    sites.push(site);
    world.sites.set(site.id, site);
    return site;
  };

  // 3-4. Civs in order: capital, then maybe a second site.
  // Once every culture has a people, each further people goes to the race with the fewest so far.
  const peoples = new Map<string, number>();
  for (let n = 0; n < civCount; n += 1) {
    let culture = order[n % order.length]!;
    if (n >= order.length) {
      for (const other of order) {
        if ((peoples.get(other.raceId) ?? 0) < (peoples.get(culture.raceId) ?? 0)) culture = other;
      }
    }
    peoples.set(culture.raceId, (peoples.get(culture.raceId) ?? 0) + 1);
    const race = raceOf.get(culture.raceId);
    if (!race) throw new Error(`Culture ${culture.id} has unknown race ${culture.raceId}.`);
    let capitalCell: number;
    // Relax the spacing by halves, down to the minimum, if the culture finds no candidate.
    let spacing = rules.capitalSpacing;
    for (;;) {
      capitalCell = bestCell(culture, (cell) => !capitals.some((c) => near(c, cell, spacing)));
      if (capitalCell >= 0 || spacing <= rules.minCapitalSpacing) break;
      spacing = Math.max(rules.minCapitalSpacing, Math.floor(spacing / 2));
    }
    if (capitalCell < 0) continue;
    capitals.push(capitalCell);

    const civId = world.nextId.civ;
    world.nextId.civ += 1;
    const capital = makeSite(
      culture,
      race,
      capitalCell,
      civId,
      rules.capitalPop,
      (pop) => rules.capitalKind[culture.id] ?? sizeKind(pop, rules),
    );
    const civ: Civ = {
      id: civId,
      name: rules.civNames[culture.government].replace('{n}', capital.name),
      raceId: race.id,
      cultureId: culture.id,
      capital: capital.id,
      founded: 0,
      grievances: new Map(),
    };
    world.civs.set(civ.id, civ);
    const civEvent = emit({
      type: 'civ_founded',
      place: capital.cell,
      data: { civ: civ.name, culture: culture.name, site: capital.name },
    });

    if (rng.chance(rules.secondSiteChance)) {
      const [lo, hi] = rules.secondSiteRange;
      const cell = bestCell(
        culture,
        (c) =>
          cellDistance(width, c, capitalCell) >= lo &&
          cellDistance(width, c, capitalCell) <= hi &&
          landmass[c] === landmass[capitalCell] &&
          !sites.some((s) => near(s.cell, c, rules.siteSpacing)),
      );
      if (cell >= 0) {
        const second = makeSite(culture, race, cell, civId, rules.secondPop, (pop, features) =>
          features.includes('harbour')
            ? 'port'
            : features.includes('aura')
              ? 'temple'
              : features.includes('deposit')
                ? 'mine'
                : sizeKind(pop, rules),
        );
        emit({
          type: 'site_founded',
          place: second.cell,
          causes: [civEvent.id],
          data: { site: second.name, civ: civ.name, kind: second.kind },
        });
      }
    }
  }

  // 5. Territory.
  cells.territory = computeTerritory(cells, sites, rules.territoryReach, rules);
}
