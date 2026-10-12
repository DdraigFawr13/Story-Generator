// Harvest and famine (M2.3). Each year a site grows food from its land; bad weather cuts the
// yield, and when stores run out people starve.

import { epochAt } from './climate';
import { goodNeed } from './goods';
import { removePeople, siteNeed, stochasticRound, totalPop } from './pop';
import { causesOf, civName, liveSites, logOf, type Epoch, type HistoryRun } from './state';

/** Weather chance inside an epoch: scaled up, but never under the epoch's floor. */
function inEpoch(chance: number, epoch: Epoch | undefined, effect: { mul: number; floor: number }) {
  return epoch ? Math.max(chance * effect.mul, effect.floor) : chance;
}

/** Rolls the year's weather for every live site, adds the harvest to stores and eats the year's food. */
export function runHarvest(run: HistoryRun): void {
  const { rules, cells, rng } = run;
  for (const site of liveSites(run)) {
    const pop = totalPop(site);
    if (pop <= 0) continue;
    const dry = epochAt(run, site.cell, 'dry');
    const cold = epochAt(run, site.cell, 'cold');
    // Always three draws per site, so one site's weather never shifts another's.
    const spread = rng.harvest.between(-1000, 1000) / 1000;
    const drought = rng.harvest.chance(
      inEpoch((cells.risk.drought[site.cell]! / 100) * rules.droughtScale, dry, rules.climate.dry),
    );
    const winter = rng.harvest.chance(
      inEpoch((cells.risk.snow[site.cell]! / 100) * rules.winterScale, cold, rules.climate.cold),
    );
    let yieldFactor = 1 + spread * rules.harvestVariance;
    if (dry) yieldFactor *= rules.climate.dry.yield;
    if (cold) yieldFactor *= rules.climate.cold.yield;
    if (drought) yieldFactor *= rules.droughtYield;
    if (winter) yieldFactor *= rules.winterYield;
    const need = siteNeed(site, run.races);
    const produced = Math.min(pop * rules.workerOutput, site.capacity) * (need / pop) * yieldFactor;
    // Food spoils without salt, so a site short of salt stores less.
    const salted = site.goods.salt >= goodNeed(run, site, 'salt');
    const cap = rules.storesCapYears * (salted ? 1 : rules.saltShortStoresCap);
    site.goods.food = Math.min(site.goods.food + produced - need, cap * need);
    if (!drought && !winter) continue;
    const log = logOf(run, site.id);
    // The worse of the two names the cause.
    const droughtWorse = !winter || rules.droughtYield <= rules.winterYield;
    const named = drought && droughtWorse ? 'drought' : 'harsh winter';
    // The epoch behind the bad year: the one matching the weather that hit (the worse, if both).
    const spell =
      drought && winter ? (droughtWorse ? (dry ?? cold) : (cold ?? dry)) : drought ? dry : cold;
    if (spell) log.epoch = { year: run.year, event: spell.began };
    // Only a bad year that leaves the stores short is worth an event; others are counted.
    if (site.goods.food >= rules.shortStoresYears * need) {
      log.badYears = (log.badYears ?? 0) + 1;
      continue;
    }
    const event = run.emit({
      type: 'bad_harvest',
      place: site.cell,
      causes: causesOf(spell?.began),
      data: { site: site.name, cause: named, civ: civName(run, site) },
    });
    log.badHarvest = { year: run.year, event: event.id };
  }
}

/** Starvation: a site whose stores ran short loses people, taking elders first, then children, then adults. */
export function runFamine(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const site of liveSites(run)) {
    if (site.goods.food >= 0) continue;
    const pop = totalPop(site);
    const need = siteNeed(site, run.races);
    const shortfall = need > 0 ? Math.min(1, -site.goods.food / need) : 0;
    site.goods.food = 0;
    const dead = Math.min(
      pop,
      stochasticRound(rng.demography, pop * shortfall * rules.famineDeathShare),
    );
    if (dead <= 0) continue;
    removePeople(site, dead, ['elder', 'child', 'adult']);
    const log = logOf(run, site.id);
    const harvest = log.badHarvest?.year === run.year ? log.badHarvest.event : undefined;
    const spell = log.epoch?.year === run.year ? log.epoch.event : undefined;
    const event = run.emit({
      type: 'famine',
      place: site.cell,
      causes: causesOf(harvest, spell),
      data: { site: site.name, civ: civName(run, site), dead },
    });
    log.famine = { year: run.year, event: event.id };
  }
}
