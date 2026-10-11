// Population helpers for the history stage: counts by age band, food need, and moving people.

import type { RaceDef } from '../core/content-types';
import type { RngStream } from '../core/rng';
import type { PopBand, Site } from '../core/types';

export type Band = PopBand['band'];

/** floor(x), plus one with chance frac(x), from the given stream (one draw). */
export function stochasticRound(rng: RngStream, x: number): number {
  if (x <= 0) return 0;
  const whole = Math.floor(x);
  return whole + (rng.chance(x - whole) ? 1 : 0);
}

export function bandCount(site: Pick<Site, 'pop'>, band: Band): number {
  let n = 0;
  for (const b of site.pop) if (b.band === band) n += b.count;
  return n;
}

export function totalPop(site: Pick<Site, 'pop'>): number {
  let n = 0;
  for (const b of site.pop) n += b.count;
  return n;
}

/** Children and adults, the people who can move. */
export function movablePop(site: Pick<Site, 'pop'>): number {
  return bandCount(site, 'child') + bandCount(site, 'adult');
}

/** Food the site's people eat in a year (person-years of a human). */
export function siteNeed(site: Pick<Site, 'pop'>, races: ReadonlyMap<string, RaceDef>): number {
  let need = 0;
  for (const b of site.pop) need += b.count * (races.get(b.raceId)?.foodNeed ?? 1);
  return need;
}

/** Takes up to `n` people from the given band, group by group in order; returns how many were taken. */
export function takeFromBand(site: Pick<Site, 'pop'>, band: Band, n: number): number {
  let left = n;
  for (const b of site.pop) {
    if (b.band !== band || left <= 0) continue;
    const take = Math.min(b.count, left);
    b.count -= take;
    left -= take;
  }
  return n - left;
}

/** Removes `n` people, taking bands in the given order; returns how many were removed. */
export function removePeople(site: Pick<Site, 'pop'>, n: number, order: readonly Band[]): number {
  let removed = 0;
  for (const band of order) removed += takeFromBand(site, band, n - removed);
  return removed;
}

/** Removes `n` people spread over all bands in proportion to their size. */
export function removeProportional(site: Pick<Site, 'pop'>, n: number): number {
  const total = totalPop(site);
  const goal = Math.min(n, total);
  if (goal <= 0) return 0;
  let removed = 0;
  const share = site.pop.map((b) => Math.floor((b.count * goal) / total));
  site.pop.forEach((b, i) => {
    b.count -= share[i]!;
    removed += share[i]!;
  });
  // The remainder (fewer than one per band) comes off the largest bands first.
  while (removed < goal) {
    let best: PopBand | undefined;
    for (const b of site.pop) if (b.count > 0 && (!best || b.count > best.count)) best = b;
    if (!best) break;
    best.count -= 1;
    removed += 1;
  }
  return removed;
}

/** One moving group: people of a race and culture by band. */
export interface Party {
  raceId: string;
  cultureId: string;
  band: Band;
  count: number;
}

/** Takes `n` children and adults from a site, proportionally, group by group; returns who left. */
export function takeParty(site: Pick<Site, 'pop'>, n: number): Party[] {
  const movers = site.pop.filter((b) => b.band !== 'elder');
  const total = movers.reduce((sum, b) => sum + b.count, 0);
  const goal = Math.min(n, total);
  const party: Party[] = [];
  if (goal <= 0) return party;
  let taken = 0;
  const part = movers.map((b) => Math.floor((b.count * goal) / total));
  for (const n of part) taken += n;
  // Hand the remainder to the largest groups, one person each.
  while (taken < goal) {
    let best = -1;
    let bestLeft = 0;
    movers.forEach((b, i) => {
      if (b.count - part[i]! > bestLeft) {
        best = i;
        bestLeft = b.count - part[i]!;
      }
    });
    if (best < 0) break;
    part[best] = part[best]! + 1;
    taken += 1;
  }
  movers.forEach((b, i) => {
    if (part[i]! <= 0) return;
    b.count -= part[i]!;
    party.push({ raceId: b.raceId, cultureId: b.cultureId, band: b.band, count: part[i]! });
  });
  return party;
}

export function partySize(party: readonly Party[]): number {
  return party.reduce((n, p) => n + p.count, 0);
}

/** Adds a party to a site's bands; a group new to the site gets all three bands. */
export function addParty(site: Pick<Site, 'pop'>, party: readonly Party[]): void {
  for (const p of party) {
    if (!site.pop.some((b) => b.raceId === p.raceId && b.cultureId === p.cultureId)) {
      for (const band of ['child', 'adult', 'elder'] as const) {
        site.pop.push({ raceId: p.raceId, cultureId: p.cultureId, band, count: 0 });
      }
    }
    const band = site.pop.find(
      (b) => b.raceId === p.raceId && b.cultureId === p.cultureId && b.band === p.band,
    )!;
    band.count += p.count;
  }
}
