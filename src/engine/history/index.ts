// Yearly history (M2.3, M2.4, M2.4b): after settlement, each year runs climate, harvest, goods, trade (each decade),
// demographics, famine, civ raids, beasts, disease, migration, expansion, war and site upkeep in a
// fixed order. Per-run state (links, immunity, cooldowns, wars) lives in `HistoryRun`; only sites,
// civs, creatures, events and territory change in the world. Trivial events roll up into a yearly
// summary and uncited ones are pruned after the last year (importance.ts).

import { DAYS_PER_YEAR } from '../core/clock';
import type { WorldState } from '../core/types';
import { runAbandonment } from './abandon';
import { runBeasts } from './beasts';
import { runClimate } from './climate';
import { runDiseases } from './disease';
import { pruneEvents, runYearSummary } from './importance';
import { runDemography, runKinds } from './demography';
import { runGoods } from './goods';
import { runFamine, runHarvest } from './harvest';
import { buildLinks, createLinkSearch } from './links';
import { runExpansion, runMigration } from './migration';
import { runCivRaids, runDiplomacy } from './raids';
import { buildSettlePlaces, buildSettleSearch, computeTerritory } from './settle';
import { createRun, isLive, liveSites, type HistoryContent, type HistoryRun } from './state';
import { totalPop } from './pop';
import { runTrade } from './trade';
import { runWar } from './war';

export type { HistoryContent } from './state';
export * from './links';
export { emptyGoods } from './goods';

/** Years between territory recomputes and progress reports. */
const DECADE = 10;

function recomputeTerritory(run: HistoryRun): void {
  const { cells, world, content } = run;
  const live = liveSites(run).filter((site) => {
    const civ = site.civId === null ? undefined : world.civs.get(site.civId);
    return civ !== undefined && civ.fell === undefined;
  });
  cells.territory = computeTerritory(cells, live, content.settlement.territoryReach);
  run.territory = cells.territory;
}

/** Runs `world.params.historyYears` yearly steps; `onYear(year, years)` is called each decade and at the end. */
export function runHistory(
  world: WorldState,
  content: HistoryContent,
  onYear?: (year: number, years: number) => void,
): void {
  const cells = world.cells;
  if (!cells) throw new Error('runHistory needs generated cells.');
  const years = world.params.historyYears;
  if (years <= 0) return;
  const places = buildSettlePlaces(cells, world.regions.values(), world.routes);
  const search = buildSettleSearch(cells, content, places);
  const linkSearch = createLinkSearch(cells);
  const links = buildLinks(cells, [...world.sites.values()], content.history, linkSearch);
  const run = createRun(world, content, search, linkSearch, links);

  for (let year = 1; year <= years; year += 1) {
    run.year = year;
    world.day = year * DAYS_PER_YEAR;
    runClimate(run);
    runHarvest(run);
    runGoods(run);
    if (year % DECADE === 0) runTrade(run);
    runDemography(run);
    runFamine(run);
    runCivRaids(run);
    runBeasts(run);
    runDiseases(run);
    runMigration(run);
    runExpansion(run);
    runWar(run);
    runKinds(run);
    runAbandonment(run);
    for (const site of world.sites.values()) {
      if (isLive(site)) site.peakPop = Math.max(site.peakPop, totalPop(site));
    }
    const decade = year % DECADE === 0;
    if (decade || year === years || run.territoryDirty) {
      recomputeTerritory(run);
      run.territoryDirty = false;
    }
    if (decade) runDiplomacy(run);
    runYearSummary(run);
    if (decade || year === years) {
      onYear?.(year, years);
    }
  }
  world.day = years * DAYS_PER_YEAR;
  pruneEvents(run);
}
