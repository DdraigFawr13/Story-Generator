// Grievance (M2.4): famine raids, border clashes and insults between civs. Grievance is what
// war is made of; each wrong is remembered as an event so a war can name its causes.

import type { Civ, Id, Site } from '../core/types';
import { removePeople, siteNeed, stochasticRound, totalPop } from './pop';
import {
  addGrievance,
  atWar,
  causesOf,
  cultureOf,
  isLive,
  liveSites,
  logOf,
  pairKey,
  type HistoryRun,
} from './state';

/** Grievance below this is forgotten. */
const GRIEVANCE_FLOOR = 0.5;

function liveCiv(run: HistoryRun, id: Id | null): Civ | undefined {
  const civ = id === null ? undefined : run.world.civs.get(id);
  return civ && civ.fell === undefined ? civ : undefined;
}

/** Grievances fade a little each year. */
function decayGrievances(run: HistoryRun): void {
  for (const civ of run.world.civs.values()) {
    for (const [other, value] of [...civ.grievances.entries()]) {
      const next = value * run.rules.grievanceDecay;
      if (next < GRIEVANCE_FLOOR) {
        civ.grievances.delete(other);
        run.grievanceEvents.delete(`${civ.id}>${other}`);
      } else civ.grievances.set(other, next);
    }
  }
}

/** The richest (food plus wealth) linked foreign live site of a civ not at war with `site`'s civ. */
function richestTarget(run: HistoryRun, site: Site): Site | undefined {
  let best: Site | undefined;
  let bestWealth = -Infinity;
  for (const id of run.links.get(site.id) ?? []) {
    const other = run.world.sites.get(id);
    if (!other || !isLive(other) || other.civId === site.civId || !liveCiv(run, other.civId))
      continue;
    if (atWar(run, site.civId, other.civId)) continue;
    const wealth = other.goods.food + other.wealth;
    if (wealth > bestWealth) {
      best = other;
      bestWealth = wealth;
    }
  }
  return best;
}

/** Famished sites of warlike cultures may raid a rich neighbour for grain. */
function runFamineRaids(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const site of liveSites(run)) {
    const famine = logOf(run, site.id).famine;
    if (famine?.year !== run.year) continue;
    const civ = liveCiv(run, site.civId);
    const culture = civ ? cultureOf(run, civ) : undefined;
    if (!civ || !culture || culture.values.war < rules.raidWarValue) continue;
    if (!rng.war.chance((rules.civRaidChance * culture.values.war) / 10)) continue;
    const target = richestTarget(run, site);
    const victim = target ? liveCiv(run, target.civId) : undefined;
    if (!target || !victim) continue;
    // A year of the raider's food is the most it can carry home.
    const need = siteNeed(site, run.races);
    const loot = Math.min(target.goods.food * rules.raidLootShare, need);
    target.goods.food -= loot;
    site.goods.food += loot;
    // If the grain does not fill the need, they carry off luxuries too.
    if (loot < need) {
      const spoils = target.goods.luxury * rules.raidLootShare;
      target.goods.luxury -= spoils;
      site.goods.luxury += spoils;
    }
    const [lo, hi] = rules.civRaidDeaths;
    const share = rng.war.between(Math.round(lo * 1000), Math.round(hi * 1000)) / 1000;
    const dead = removePeople(target, stochasticRound(rng.war, totalPop(target) * share), [
      'adult',
      'child',
      'elder',
    ]);
    const event = run.emit({
      type: 'civ_raid',
      place: target.cell,
      causes: causesOf(famine.event),
      data: {
        site: site.name,
        target: target.name,
        civ: civ.name,
        victim: victim.name,
        dead,
        loot: Math.round(loot),
      },
    });
    addGrievance(run, victim.id, civ.id, rules.grievance.raid, event.id);
  }
}

/** Yearly: grievances fade, then famine raids. */
export function runCivRaids(run: HistoryRun): void {
  decayGrievances(run);
  runFamineRaids(run);
}

/** Total wealth of a civ's live sites. */
export function civWealth(run: HistoryRun, civ: Civ): number {
  let wealth = 0;
  for (const site of liveSites(run)) if (site.civId === civ.id) wealth += site.wealth;
  return wealth;
}

/** The newest founding event of either civ's sites (the cause of a border clash). */
function latestFounding(run: HistoryRun, a: Id, b: Id): Id | undefined {
  let latest: Id | undefined;
  for (const site of run.world.sites.values()) {
    if (site.civId !== a && site.civId !== b) continue;
    const origin = logOf(run, site.id).origin;
    if (origin !== undefined && (latest === undefined || origin > latest)) latest = origin;
  }
  return latest;
}

/** Civ pairs sharing border cells: pair key to [cell count, lowest shared cell]. */
function borders(run: HistoryRun): Map<string, { a: Id; b: Id; cells: number; first: number }> {
  const { width, height } = run.cells;
  const out = new Map<string, { a: Id; b: Id; cells: number; first: number }>();
  const note = (cell: number, x: Id, y: Id) => {
    if (x === 0 || y === 0 || x === y) return;
    const key = pairKey(x, y);
    const entry = out.get(key);
    if (entry) entry.cells += 1;
    else out.set(key, { a: Math.min(x, y), b: Math.max(x, y), cells: 1, first: cell });
  };
  const owner = run.territory;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      if (x + 1 < width) note(cell, owner[cell]!, owner[cell + 1]!);
      if (y + 1 < height) note(cell, owner[cell]!, owner[cell + width]!);
    }
  }
  return out;
}

function runBorderClashes(run: HistoryRun): void {
  const { rules, rng } = run;
  const pairs = [...borders(run).values()].sort((p, q) => p.a - q.a || p.b - q.b);
  for (const pair of pairs) {
    const civA = liveCiv(run, pair.a);
    const civB = liveCiv(run, pair.b);
    if (!civA || !civB || pair.cells < rules.borderCells || atWar(run, pair.a, pair.b)) continue;
    const warA = cultureOf(run, civA)?.values.war ?? 0;
    const warB = cultureOf(run, civB)?.values.war ?? 0;
    if (!rng.war.chance((rules.borderClashChance * (warA + warB)) / 20)) continue;
    const event = run.emit({
      type: 'border_clash',
      place: pair.first,
      causes: causesOf(latestFounding(run, pair.a, pair.b)),
      data: { civ: civA.name, other: civB.name },
    });
    addGrievance(run, civA.id, civB.id, rules.grievance.border, event.id);
    addGrievance(run, civB.id, civA.id, rules.grievance.border, event.id);
  }
}

/** Linked civ pairs, as `[low, high, lowest linked site of low, lowest linked site of high]`. */
function linkedCivs(run: HistoryRun): { a: Id; b: Id; siteA: Site; siteB: Site }[] {
  const out = new Map<string, { a: Id; b: Id; siteA: Site; siteB: Site }>();
  for (const site of liveSites(run)) {
    for (const id of run.links.get(site.id) ?? []) {
      const other = run.world.sites.get(id);
      if (!other || !isLive(other) || id < site.id) continue;
      if (site.civId === null || other.civId === null || site.civId === other.civId) continue;
      const [lo, hi] = site.civId < other.civId ? [site, other] : [other, site];
      const key = pairKey(site.civId, other.civId);
      if (!out.has(key)) out.set(key, { a: lo.civId!, b: hi.civId!, siteA: lo, siteB: hi });
    }
  }
  return [...out.values()].sort((p, q) => p.a - q.a || p.b - q.b);
}

function runInsults(run: HistoryRun): void {
  const { rules, rng } = run;
  for (const link of linkedCivs(run)) {
    const civA = liveCiv(run, link.a);
    const civB = liveCiv(run, link.b);
    if (!civA || !civB || atWar(run, link.a, link.b)) continue;
    if (!rng.war.chance(rules.insultChance)) continue;
    const honourA = cultureOf(run, civA)?.values.honour ?? 0;
    const honourB = cultureOf(run, civB)?.values.honour ?? 0;
    // The prouder people takes the offence; ties go to the lower id.
    const [victim, offender, place, honour] =
      honourB > honourA ? [civB, civA, link.siteB, honourB] : [civA, civB, link.siteA, honourA];
    const opened = run.tradeOpened.get(pairKey(civA.id, civB.id));
    const event = run.emit({
      type: 'insult',
      place: place.cell,
      causes: causesOf(opened),
      data: { civ: offender.name, victim: victim.name },
    });
    addGrievance(run, victim.id, offender.id, (rules.grievance.insult * honour) / 10, event.id);
    // The poorer people envies the richer one.
    const [wealthV, wealthO] = [civWealth(run, victim), civWealth(run, offender)];
    const [poor, rich, richWealth, poorWealth] =
      wealthO > wealthV
        ? [victim, offender, wealthO, wealthV]
        : [offender, victim, wealthV, wealthO];
    if (richWealth >= rules.envyMinWealth && richWealth > rules.envyRatio * poorWealth) {
      addGrievance(run, poor.id, rich.id, rules.grievance.envy, event.id);
    }
  }
}

/** Every tenth year, after territory is recomputed: border clashes and insults. */
export function runDiplomacy(run: HistoryRun): void {
  runBorderClashes(run);
  runInsults(run);
}
