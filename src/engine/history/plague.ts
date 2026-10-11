// Plague (M2.3): outbreaks start in large sites and spread only along links, one step a year.
// A site that has been sick is immune for a while.

import { removeProportional, stochasticRound, totalPop } from './pop';
import { causesOf, civName, isLive, logOf, type HistoryRun } from './state';
import type { Id, Site } from '../core/types';

/** Infects a site now: people die, an event is emitted, and the sickness may spread next year. */
function infect(run: HistoryRun, site: Site, from: Site | undefined, cause: Id | undefined): void {
  const { rules, rng } = run;
  const [lo, hi] = rules.plagueDeath;
  const share = rng.plague.between(Math.round(lo * 1000), Math.round(hi * 1000)) / 1000;
  const pop = totalPop(site);
  const dead = removeProportional(site, stochasticRound(rng.plague, pop * share));
  run.immuneUntil.set(site.id, run.year + rules.plagueImmunityYears);
  const event = run.emit({
    type: 'plague',
    place: site.cell,
    causes: causesOf(cause),
    data: { site: site.name, civ: civName(run, site), dead, from: from?.name ?? '' },
  });
  logOf(run, site.id).plague = { year: run.year, event: event.id };
  run.nextInfected.set(site.id, event.id);
}

function canCatch(run: HistoryRun, site: Site): boolean {
  return isLive(site) && run.year > (run.immuneUntil.get(site.id) ?? 0);
}

/** Spreads last year's plague along links, then rolls for new outbreaks. */
export function runPlague(run: HistoryRun): void {
  const { rules, rng, world } = run;
  const sources = [...run.infected.entries()].sort((a, b) => a[0] - b[0]);
  run.nextInfected = new Map();
  for (const [sourceId, cause] of sources) {
    const source = world.sites.get(sourceId);
    if (!source) continue;
    for (const targetId of run.links.get(sourceId) ?? []) {
      const target = world.sites.get(targetId);
      if (!target || !canCatch(run, target)) continue;
      if (rng.plague.chance(rules.plagueSpread)) infect(run, target, source, cause);
    }
  }
  for (const site of world.sites.values()) {
    if (!isLive(site) || totalPop(site) < rules.plagueMinPop) continue;
    if (rng.plague.chance(rules.plagueChance) && canCatch(run, site)) {
      infect(run, site, undefined, undefined);
    }
  }
  run.infected = run.nextInfected;
}
