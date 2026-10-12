// Diseases (M2.4b): outbreaks start in large sites and spread only along links, one step a year.
// A site that has been sick is immune for a while. Each disease is a content entry.

import type { DiseaseDef } from '../core/content-types';
import type { Id, Site } from '../core/types';
import { bandCount, stochasticRound, takeFromBand, totalPop, type Band } from './pop';
import { causesOf, civName, isLive, logOf, type DiseaseState, type HistoryRun } from './state';

const BANDS: readonly Band[] = ['child', 'adult', 'elder'];

function stateOf(run: HistoryRun, def: DiseaseDef): DiseaseState {
  let state = run.diseases.get(def.id);
  if (!state) {
    state = { immuneUntil: new Map(), infected: new Map() };
    run.diseases.set(def.id, state);
  }
  return state;
}

/** Infects a site now: people die by age band, an event is emitted, and it may spread next year. */
function infect(
  run: HistoryRun,
  def: DiseaseDef,
  state: DiseaseState,
  next: Map<Id, Id>,
  site: Site,
  from: Site | undefined,
  cause: Id | undefined,
): void {
  const rng = run.rng.disease;
  const [lo, hi] = def.severity;
  const share = rng.between(Math.round(lo * 1000), Math.round(hi * 1000)) / 1000;
  let dead = 0;
  for (const band of BANDS) {
    const count = bandCount(site, band);
    const killed = Math.min(count, stochasticRound(rng, count * share * def.ageRisk[band]));
    dead += takeFromBand(site, band, killed);
  }
  state.immuneUntil.set(site.id, run.year + def.immunityYears);
  const event = run.emit({
    type: def.event,
    place: site.cell,
    causes: causesOf(cause),
    data: {
      site: site.name,
      civ: civName(run, site),
      dead,
      from: from?.name ?? '',
      disease: def.name,
    },
  });
  logOf(run, site.id).disease = { year: run.year, event: event.id };
  next.set(site.id, event.id);
}

function canCatch(state: DiseaseState, run: HistoryRun, site: Site): boolean {
  return isLive(site) && run.year > (state.immuneUntil.get(site.id) ?? 0);
}

/** For each disease: spreads last year's cases along links, then rolls for new outbreaks. */
export function runDiseases(run: HistoryRun): void {
  const { rules, world } = run;
  const rng = run.rng.disease;
  for (const def of run.content.diseases) {
    const state = stateOf(run, def);
    const sources = [...state.infected.entries()].sort((a, b) => a[0] - b[0]);
    const next = new Map<Id, Id>();
    for (const [sourceId, cause] of sources) {
      const source = world.sites.get(sourceId);
      if (!source) continue;
      for (const targetId of run.links.get(sourceId) ?? []) {
        const target = world.sites.get(targetId);
        if (!target || !canCatch(state, run, target)) continue;
        if (rng.chance(def.infectivity)) infect(run, def, state, next, target, source, cause);
      }
    }
    for (const site of world.sites.values()) {
      const pop = totalPop(site);
      if (!isLive(site) || pop < def.minPop) continue;
      const chance = def.outbreak * Math.min(rules.outbreakSizeCap, pop / def.minPop);
      if (rng.chance(chance) && canCatch(state, run, site)) {
        infect(run, def, state, next, site, undefined, undefined);
      }
    }
    state.infected = next;
  }
}
