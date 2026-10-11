// Harvest and famine (M2.3). Each year a site grows food from its land; bad weather cuts the
// yield, and when stores run out people starve.

import { removePeople, siteNeed, stochasticRound, totalPop } from './pop';
import { causesOf, civName, liveSites, logOf, type HistoryRun } from './state';

/** Rolls the year's weather for every live site, adds the harvest to stores and eats the year's food. */
export function runHarvest(run: HistoryRun): void {
  const { rules, cells, rng } = run;
  for (const site of liveSites(run)) {
    const pop = totalPop(site);
    if (pop <= 0) continue;
    // Always three draws per site, so one site's weather never shifts another's.
    const spread = rng.harvest.between(-1000, 1000) / 1000;
    const drought = rng.harvest.chance((cells.risk.drought[site.cell]! / 100) * rules.droughtScale);
    const winter = rng.harvest.chance((cells.risk.snow[site.cell]! / 100) * rules.winterScale);
    let yieldFactor = 1 + spread * rules.harvestVariance;
    if (drought) yieldFactor *= rules.droughtYield;
    if (winter) yieldFactor *= rules.winterYield;
    if (drought || winter) {
      // The worse of the two names the cause.
      const droughtWorse = !winter || rules.droughtYield <= rules.winterYield;
      const event = run.emit({
        type: 'bad_harvest',
        place: site.cell,
        causes: causesOf(),
        data: {
          site: site.name,
          cause: drought && droughtWorse ? 'drought' : 'harsh winter',
          civ: civName(run, site),
        },
      });
      logOf(run, site.id).badHarvest = { year: run.year, event: event.id };
    }
    const need = siteNeed(site, run.races);
    const produced = Math.min(pop * rules.workerOutput, site.capacity) * (need / pop) * yieldFactor;
    site.stores = Math.min(site.stores + produced - need, rules.storesCapYears * need);
  }
}

/** Starvation: a site whose stores ran short loses people, taking elders first, then children, then adults. */
export function runFamine(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const site of liveSites(run)) {
    if (site.stores >= 0) continue;
    const pop = totalPop(site);
    const need = siteNeed(site, run.races);
    const shortfall = need > 0 ? Math.min(1, -site.stores / need) : 0;
    site.stores = 0;
    const dead = Math.min(
      pop,
      stochasticRound(rng.demography, pop * shortfall * rules.famineDeathShare),
    );
    if (dead <= 0) continue;
    removePeople(site, dead, ['elder', 'child', 'adult']);
    const log = logOf(run, site.id);
    const harvest = log.badHarvest?.year === run.year ? log.badHarvest.event : undefined;
    const event = run.emit({
      type: 'famine',
      place: site.cell,
      causes: causesOf(harvest),
      data: { site: site.name, civ: civName(run, site), dead },
    });
    log.famine = { year: run.year, event: event.id };
  }
}
