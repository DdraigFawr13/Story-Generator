// Site links (M2.3): which live sites can reach each other, for plague, migration and refuge.
// Two sites are linked when a walk between them costs at most `linkReach`, or when both are
// harbours within `seaLinkRange` cells. Links are symmetric and sorted by site id.

import type { HistoryRules } from '../core/content-types';
import type { Id, Site, WorldCells } from '../core/types';
import { CellHeap, D8_DX, D8_DY } from '../worldgen/grid';
import { cellDistance } from './settle';

/** Linked site ids per site id, ascending. */
export type SiteLinks = Map<Id, Id[]>;

type LinkRules = Pick<HistoryRules, 'linkReach' | 'seaLinkRange'>;
type LinkCells = Pick<WorldCells, 'width' | 'height' | 'water' | 'travelCost'>;

/** Reusable search buffers, so many searches share one allocation. */
export interface LinkSearch {
  dist: Float64Array;
  heap: CellHeap;
}

export function createLinkSearch(cells: Pick<WorldCells, 'width' | 'height'>): LinkSearch {
  const size = cells.width * cells.height;
  return { dist: new Float64Array(size).fill(Infinity), heap: new CellHeap(size * 8 + 1) };
}

function isLive(site: Pick<Site, 'ruinedYear' | 'civId'>): boolean {
  return site.ruinedYear === undefined;
}

/** Ids of the other sites in `others` whose cell is within walking reach of `site`, ascending. */
function walkReach(
  cells: LinkCells,
  search: LinkSearch,
  site: Pick<Site, 'id' | 'cell'>,
  siteAt: ReadonlyMap<number, Id>,
  reach: number,
): Id[] {
  const { width, height } = cells;
  const { dist, heap } = search;
  const touched: number[] = [site.cell];
  const found: Id[] = [];
  heap.clear();
  dist[site.cell] = 0;
  heap.push(site.cell, 0);
  while (heap.size > 0) {
    const cell = heap.pop();
    const here = dist[cell]!;
    const other = siteAt.get(cell);
    if (other !== undefined && other !== site.id) found.push(other);
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 8; d += 1) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const to = ny * width + nx;
      if (cells.water[to] === 3 || cells.water[to] === 2 || cells.travelCost[to]! >= 255) continue;
      const next = here + cells.travelCost[to]!;
      if (next > reach || next >= dist[to]!) continue;
      if (dist[to] === Infinity) touched.push(to);
      dist[to] = next;
      heap.push(to, next);
    }
  }
  for (const cell of touched) dist[cell] = Infinity;
  // A cell can pop more than once (stale entries); keep each site once.
  return [...new Set(found)].sort((a, b) => a - b);
}

function link(links: SiteLinks, a: Id, b: Id): void {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const list = links.get(from) ?? [];
    if (!list.includes(to)) {
      list.push(to);
      list.sort((p, q) => p - q);
    }
    links.set(from, list);
  }
}

/** Adds a site's links to the graph: walking reach to every live site, and sea lanes between harbours. */
export function addSiteLinks(
  links: SiteLinks,
  cells: LinkCells,
  search: LinkSearch,
  site: Site,
  liveSites: readonly Site[],
  rules: LinkRules,
): void {
  if (!links.has(site.id)) links.set(site.id, []);
  const siteAt = new Map<number, Id>();
  for (const other of liveSites) if (isLive(other)) siteAt.set(other.cell, other.id);
  for (const other of walkReach(cells, search, site, siteAt, rules.linkReach)) {
    link(links, site.id, other);
  }
  if (site.features.includes('harbour')) {
    for (const other of liveSites) {
      if (other.id === site.id || !isLive(other) || !other.features.includes('harbour')) continue;
      if (cellDistance(cells.width, site.cell, other.cell) <= rules.seaLinkRange) {
        link(links, site.id, other.id);
      }
    }
  }
}

/** Links between all live sites, built site by site in id order. */
export function buildLinks(
  cells: LinkCells,
  sites: readonly Site[],
  rules: LinkRules,
  search: LinkSearch = createLinkSearch(cells),
): SiteLinks {
  const links: SiteLinks = new Map();
  const live = sites.filter(isLive);
  for (const site of live) addSiteLinks(links, cells, search, site, live, rules);
  return links;
}
