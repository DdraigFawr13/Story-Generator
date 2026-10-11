// Demographics and site kinds (M2.3): births, deaths and ageing by band, and towns growing
// or shrinking with their population.

import type { HistoryRules, RaceDef } from '../core/content-types';
import type { Site, SiteKind } from '../core/types';
import { stochasticRound, totalPop } from './pop';
import { causesOf, civName, liveSites, logOf, type HistoryRun } from './state';
import { sizeKind } from './settle';

/** Yearly rates for one race at a given crowding (0-1). */
export function lifeRates(race: RaceDef, rules: HistoryRules, crowding: number) {
  const adultYears = Math.max(
    rules.minAdultYears,
    race.lifespanYears * (1 - rules.elderLifeShare) - race.maturityYears,
  );
  const elderYears = Math.max(rules.minElderYears, race.lifespanYears * rules.elderLifeShare);
  const pressure = Math.max(0, (crowding - rules.crowdingFrom) / (1 - rules.crowdingFrom));
  const hardiness = rules.referenceLifespan / race.lifespanYears;
  return {
    birth: rules.birthRate * race.fertility * (1 - pressure * rules.crowdingBirthCut),
    childDeath: rules.childDeath * hardiness * (1 + crowding * rules.crowdingDeathRise),
    adultDeath: rules.adultDeath * hardiness * (1 + crowding * rules.crowdingDeathRise),
    elderDeath: 1 / elderYears,
    grow: 1 / race.maturityYears,
    age: 1 / adultYears,
  };
}

/** One year of deaths, ageing and births for every live site. */
export function runDemography(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const site of run.world.sites.values()) {
    if (site.ruinedYear !== undefined) continue;
    const pop = totalPop(site);
    if (pop <= 0) continue;
    const crowding = site.capacity > 0 ? Math.min(1, pop / site.capacity) : 1;
    // One group per race and culture; the bands of a group are adjacent child, adult, elder.
    const groups = new Map<string, Site['pop']>();
    for (const band of site.pop) {
      const key = `${band.raceId}/${band.cultureId}`;
      groups.set(key, [...(groups.get(key) ?? []), band]);
    }
    for (const bands of groups.values()) {
      const race = run.races.get(bands[0]!.raceId);
      if (!race) continue;
      const rates = lifeRates(race, rules, crowding);
      const get = (kind: 'child' | 'adult' | 'elder') => bands.find((b) => b.band === kind);
      const child = get('child');
      const adult = get('adult');
      const elder = get('elder');
      if (!child || !adult || !elder) continue;
      const r = rng.demography;
      const dies = (band: typeof child, rate: number) => {
        band.count -= Math.min(band.count, stochasticRound(r, band.count * rate));
      };
      // Order: deaths, ageing, births (newborns are children).
      dies(child, rates.childDeath);
      dies(adult, rates.adultDeath);
      dies(elder, rates.elderDeath);
      const grown = Math.min(child.count, stochasticRound(r, child.count * rates.grow));
      const aged = Math.min(adult.count, stochasticRound(r, adult.count * rates.age));
      child.count -= grown;
      adult.count += grown - aged;
      elder.count += aged;
      child.count += stochasticRound(r, adult.count * rates.birth);
    }
  }
}

/** Kinds that move with population, smallest first, and the population each starts at. */
function sizeLadder(run: HistoryRun): { kind: SiteKind; from: number }[] {
  const ladder: { kind: SiteKind; from: number }[] = [];
  let from = 0;
  for (const [limit, kind] of run.content.settlement.kindByPop) {
    ladder.push({ kind, from });
    from = limit;
  }
  ladder.push({ kind: 'city', from });
  return ladder;
}

/** Towns grow a kind when they pass its limit and shrink only well under it; fixed-purpose sites never change. */
export function runKinds(run: HistoryRun): void {
  const ladder = sizeLadder(run);
  const rank = (kind: SiteKind) => ladder.findIndex((step) => step.kind === kind);
  for (const site of liveSites(run)) {
    const now = rank(site.kind);
    if (now < 0) continue;
    const pop = totalPop(site);
    const target = rank(sizeKind(pop, run.content.settlement));
    if (target > now) {
      site.kind = ladder[target]!.kind;
      const log = logOf(run, site.id);
      const event = run.emit({
        type: 'site_grew',
        place: site.cell,
        causes: causesOf(log.grew ?? log.origin),
        data: { site: site.name, kind: site.kind, civ: civName(run, site) },
      });
      log.grew = event.id;
    } else if (target < now && pop < ladder[now]!.from * (1 - run.rules.kindHysteresis)) {
      site.kind = ladder[now - 1]!.kind;
    }
  }
}
