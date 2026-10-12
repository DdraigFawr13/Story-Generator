// Migration and expansion (M2.3): crowded or starving sites send people to roomier linked
// sites of the same civ, or found a new site when there is nowhere to go.

import { culturePlaceName } from '../people/names';
import type { Civ, Id, Site, SiteFeature, SiteKind } from '../core/types';
import { emptyGoods } from './goods';
import { addSiteLinks } from './links';
import { addParty, movablePop, partySize, takeParty, totalPop, type Party } from './pop';
import {
  cellDistance,
  mineralIndexes,
  mineralsNear,
  nearestAuraSpot,
  popBands,
  siteCapacity,
  sizeKind,
} from './settle';
import { causesOf, civName, isLive, liveSites, logOf, type HistoryRun } from './state';

/** The best free cell for a new site of `source`'s civ, or -1. */
export function findNewCell(run: HistoryRun, source: Site): number {
  const { cells, rules, search, world, content } = run;
  const civ = source.civId === null ? undefined : world.civs.get(source.civId);
  const culture = content.cultures.find((c) => c.id === civ?.cultureId);
  const race = civ ? run.races.get(civ.raceId) : undefined;
  if (!civ || !culture || !race) return -1;
  const founded = run.civLastFounded.get(civ.id);
  if (founded !== undefined && run.year - founded < rules.civFoundCooldown) return -1;
  const { width, height } = cells;
  const [lo, hi] = rules.expandRange;
  const spacing = rules.newSiteSpacing;
  const sx = source.cell % width;
  const sy = (source.cell - sx) / width;
  const crowded = (cell: number): boolean => {
    const cx = cell % width;
    const cy = (cell - cx) / width;
    for (
      let y = Math.max(0, cy - spacing + 1);
      y <= Math.min(height - 1, cy + spacing - 1);
      y += 1
    ) {
      for (
        let x = Math.max(0, cx - spacing + 1);
        x <= Math.min(width - 1, cx + spacing - 1);
        x += 1
      ) {
        if (run.siteAtCell.has(y * width + x)) return true;
      }
    }
    return false;
  };
  let best = -1;
  let bestScore = -Infinity;
  for (let y = Math.max(0, sy - hi); y <= Math.min(height - 1, sy + hi); y += 1) {
    for (let x = Math.max(0, sx - hi); x <= Math.min(width - 1, sx + hi); x += 1) {
      const cell = y * width + x;
      if (!search.featuresAt[cell]) continue;
      if (cellDistance(width, cell, source.cell) < lo) continue;
      if (search.landmass[cell] !== search.landmass[source.cell]) continue;
      const owner = run.territory[cell]!;
      if (owner !== 0 && owner !== civ.id) continue;
      if (crowded(cell)) continue;
      const score = search.scoreCell(culture, cell);
      if (score <= bestScore) continue;
      // Capacity is costly, so it is only worked out for a cell that would take the lead.
      const room = siteCapacity(cells, cell, race, content, search.featuresAt[cell]!);
      if (room < rules.minNewSiteCapacity) continue;
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

/**
 * What a new site is for: a port at a harbour; a temple for an aura spot its civ has no temple at
 * yet; a mine for a mineral its civ does not yet mine nearby; otherwise a town by size.
 */
function newSiteKind(
  run: HistoryRun,
  civ: Civ,
  cell: number,
  features: readonly SiteFeature[],
  pop: number,
): SiteKind {
  const { cells, content, world } = run;
  const rules = content.settlement;
  if (features.includes('harbour')) return 'port';
  if (features.includes('aura')) {
    const spot = nearestAuraSpot(cells, cell, rules.featureRadius.aura);
    if (spot >= 0 && !run.templeSpots.has(`${civ.id}:${spot}`)) return 'temple';
  }
  if (features.includes('deposit')) {
    const mineral = mineralIndexes(content);
    const radius = rules.featureRadius.deposit;
    const here = mineralsNear(cells, cell, radius, mineral);
    const taken = [...world.sites.values()].some(
      (mine) =>
        mine.kind === 'mine' &&
        mine.civId === civ.id &&
        isLive(mine) &&
        [...mineralsNear(cells, mine.cell, radius, mineral)].some((r) => here.has(r)),
    );
    if (!taken) return 'mine';
  }
  return sizeKind(pop, rules);
}

/** Creates the new site at `cell` for a party; emits nothing (the caller owns the events). */
function foundSite(run: HistoryRun, source: Site, cell: number, party: Party[]): Site {
  const { world, content, rules, cells, search } = run;
  const civ = world.civs.get(source.civId!)!;
  const culture = content.cultures.find((c) => c.id === civ.cultureId)!;
  const race = run.races.get(civ.raceId)!;
  const features = search.featuresAt[cell]!;
  const pop = partySize(party);
  let name = '';
  for (let tries = 0; tries < 5; tries += 1) {
    name = culturePlaceName(culture.names, run.rng.names);
    if (![...world.sites.values()].some((s) => s.name === name)) break;
  }
  const kind = newSiteKind(run, civ, cell, features, pop);
  const site: Site = {
    id: world.nextId.site,
    name,
    kind,
    cell,
    civId: civ.id,
    founded: run.year,
    pop: popBands(0, race, culture, content.settlement),
    goods: emptyGoods(),
    wealth: 0,
    capacity: siteCapacity(cells, cell, race, content, features),
    features: [...features],
    peakPop: pop,
  };
  world.nextId.site += 1;
  addParty(site, party);
  site.goods.food = pop * race.foodNeed * rules.newSiteStoresYears;
  world.sites.set(site.id, site);
  run.siteAtCell.set(cell, site.id);
  run.civLastFounded.set(civ.id, run.year);
  if (kind === 'temple') {
    run.templeSpots.add(
      `${civ.id}:${nearestAuraSpot(cells, cell, content.settlement.featureRadius.aura)}`,
    );
  }
  addSiteLinks(run.links, cells, run.linkSearch, site, liveSites(run), rules);
  run.lastExpansion.set(source.id, run.year);
  run.lastExpansion.set(site.id, run.year);
  return site;
}

/** Founds a site from a party and emits `site_founded` after the given cause; returns the site. */
function settleParty(
  run: HistoryRun,
  source: Site,
  cell: number,
  party: Party[],
  cause: Id | undefined,
): Site {
  const site = foundSite(run, source, cell, party);
  const event = run.emit({
    type: 'site_founded',
    place: site.cell,
    causes: causesOf(cause),
    data: { site: site.name, civ: civName(run, site), kind: site.kind },
  });
  logOf(run, site.id).origin = event.id;
  return site;
}

/** Crowded or starving sites send migrants to a linked site with room, else to a new site. */
export function runMigration(run: HistoryRun): void {
  const { rules, world, links } = run;
  for (const site of liveSites(run)) {
    const log = logOf(run, site.id);
    const famine = log.famine?.year === run.year ? log.famine.event : undefined;
    const pop = totalPop(site);
    if (famine === undefined && pop <= site.capacity) continue;
    const movable = movablePop(site);
    if (movable <= 0) continue;
    const count = Math.min(movable, Math.max(1, Math.round(movable * rules.migrantShare)));
    let target: Site | undefined;
    let room = count;
    for (const id of links.get(site.id) ?? []) {
      const other = world.sites.get(id);
      if (!other || other.ruinedYear !== undefined || other.civId !== site.civId) continue;
      const free = other.capacity - totalPop(other);
      if (free > room) {
        room = free;
        target = other;
      }
    }
    if (target) {
      addParty(target, takeParty(site, count));
      const event = run.emit({
        type: 'migration',
        place: site.cell,
        causes: causesOf(famine ?? log.grew ?? log.origin),
        data: { from: site.name, to: target.name, count, civ: civName(run, site) },
      });
      log.migration = { year: run.year, event: event.id };
      continue;
    }
    // Nowhere to go: the migrants found a new site, if there is room for one.
    if (count < rules.abandonBelow) continue;
    const cell = findNewCell(run, site);
    if (cell < 0) continue;
    const party = takeParty(site, count);
    const founded = foundSite(run, site, cell, party);
    const migration = run.emit({
      type: 'migration',
      place: site.cell,
      causes: causesOf(famine ?? log.grew ?? log.origin),
      data: { from: site.name, to: founded.name, count, civ: civName(run, site) },
    });
    log.migration = { year: run.year, event: migration.id };
    const event = run.emit({
      type: 'site_founded',
      place: founded.cell,
      causes: [migration.id],
      data: { site: founded.name, civ: civName(run, founded), kind: founded.kind },
    });
    logOf(run, founded.id).origin = event.id;
  }
}

/** Sites well above capacity sometimes send settlers to found a new site. */
export function runExpansion(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const site of liveSites(run)) {
    if (totalPop(site) <= rules.expandAt * site.capacity) continue;
    const last = run.lastExpansion.get(site.id);
    if (last !== undefined && run.year - last < rules.expandCooldown) continue;
    if (!rng.expansion.chance(rules.expandChance)) continue;
    const count = Math.round(movablePop(site) * rules.expandShare);
    if (count < rules.abandonBelow) continue;
    const cell = findNewCell(run, site);
    if (cell < 0) continue;
    const log = logOf(run, site.id);
    // The newest of a famine or growth here; failing both, the site's own founding.
    const recent = Math.max(log.famine?.event ?? -1, log.grew ?? -1);
    const cause = recent >= 0 ? recent : log.origin;
    const party = takeParty(site, count);
    settleParty(run, site, cell, party, cause);
  }
}
