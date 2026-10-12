// Abandonment (M2.3): a site whose people dwindle is left to ruin; a people with no site left falls.

import type { Civ, Id, SimEvent, Site } from '../core/types';
import { addParty, totalPop, type Party } from './pop';
import { cellDistance } from './settle';
import { causesOf, civName, isLive, logOf, type HistoryRun } from './state';

/** The civ's largest live site (ties by lowest id), or undefined. */
function largestLive(run: HistoryRun, civ: Civ): Site | undefined {
  let best: Site | undefined;
  for (const site of run.world.sites.values()) {
    if (site.civId !== civ.id || !isLive(site)) continue;
    if (!best || totalPop(site) > totalPop(best)) best = site;
  }
  return best;
}

/** The nearest linked live site of the same civ, or undefined. */
function findRefuge(run: HistoryRun, site: Site): Site | undefined {
  let refuge: Site | undefined;
  let nearest = Infinity;
  for (const id of run.links.get(site.id) ?? []) {
    const other = run.world.sites.get(id);
    if (!other || !isLive(other) || other.civId !== site.civId) continue;
    const distance = cellDistance(run.cells.width, site.cell, other.cell);
    if (distance < nearest) {
      nearest = distance;
      refuge = other;
    }
  }
  return refuge;
}

/** Empties a site: survivors walk to the nearest linked live site of the same civ, else they are lost. */
export function evacuate(run: HistoryRun, site: Site): void {
  const survivors: Party[] = site.pop
    .filter((b) => b.count > 0)
    .map((b) => ({ raceId: b.raceId, cultureId: b.cultureId, band: b.band, count: b.count }));
  const refuge = findRefuge(run, site);
  if (refuge) addParty(refuge, survivors);
  for (const band of site.pop) band.count = 0;
  site.stores = 0;
}

/**
 * A civ has lost a site (abandoned, conquered or razed): the capital moves to its largest live site,
 * and with none left the civ falls. Returns the civ_fell event, if any.
 */
export function civLosesSite(
  run: HistoryRun,
  civ: Civ,
  site: Site,
  cause: Id,
): SimEvent | undefined {
  if (civ.fell !== undefined) return undefined;
  const next = largestLive(run, civ);
  if (next) {
    if (civ.capital === site.id) civ.capital = next.id;
    return undefined;
  }
  civ.fell = run.year;
  run.territoryDirty = true;
  return run.emit({
    type: 'civ_fell',
    place: site.cell,
    causes: [cause],
    data: { civ: civ.name },
  });
}

/** Abandons every live site under `abandonBelow` people, in id order. */
export function runAbandonment(run: HistoryRun): void {
  const { world, rules } = run;
  for (const site of [...world.sites.values()]) {
    if (!isLive(site) || totalPop(site) >= rules.abandonBelow) continue;
    evacuate(run, site);
    site.ruinedYear = run.year;
    const log = logOf(run, site.id);
    const latest = Math.max(log.famine?.event ?? -1, log.plague?.event ?? -1);
    const event = run.emit({
      type: 'site_abandoned',
      place: site.cell,
      causes: causesOf(latest >= 0 ? latest : log.origin),
      data: { site: site.name, civ: civName(run, site) },
    });
    const civ = site.civId === null ? undefined : world.civs.get(site.civId);
    if (civ) civLosesSite(run, civ, site, event.id);
  }
}
