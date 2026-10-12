// Trade (M2.4): once a decade, linked sites swap food from surplus to shortage and learn of each
// other's goods. Salt keeps stores, iron arms a civ, gems and gold make wealth (and envy).

import type { Id, Site } from '../core/types';
import { siteNeed } from './pop';
import {
  atWar,
  causesOf,
  civName,
  isLive,
  logOf,
  liveSites,
  pairKey,
  type HistoryRun,
} from './state';

/** Resource ids with a deposit within `tradeGoodsRange` cells of the site (cached per site). */
export function goodsOf(run: HistoryRun, site: Site): string[] {
  const cached = run.goods.get(site.id);
  if (cached) return cached;
  const { cells, rules, content } = run;
  const { width, height } = cells;
  const range = rules.tradeGoodsRange;
  const cx = site.cell % width;
  const cy = (site.cell - cx) / width;
  const found = new Set<number>();
  for (let y = Math.max(0, cy - range); y <= Math.min(height - 1, cy + range); y += 1) {
    for (let x = Math.max(0, cx - range); x <= Math.min(width - 1, cx + range); x += 1) {
      for (const deposit of cells.resources.get(y * width + x) ?? []) found.add(deposit.resource);
    }
  }
  const goods = [...found]
    .sort((a, b) => a - b)
    .map((n) => content.resources[n]?.id)
    .filter((id): id is string => id !== undefined);
  run.goods.set(site.id, goods);
  return goods;
}

/** Goods `from` has that `to` lacks. */
function missingFor(run: HistoryRun, from: Site, to: Site): string[] {
  const have = goodsOf(run, to);
  return goodsOf(run, from).filter((id) => !have.includes(id));
}

function moveFood(run: HistoryRun, from: Site, to: Site): number {
  const { rules, races } = run;
  const surplus = from.stores - siteNeed(from, races) * rules.tradeKeepYears;
  const shortage = siteNeed(to, races) * rules.tradeKeepYears - to.stores;
  const amount = Math.min(surplus, shortage);
  if (amount < 1) return 0;
  from.stores -= amount;
  to.stores += amount;
  return amount;
}

/** One trade round for a linked pair; returns true if anything changed hands. */
function tradePair(
  run: HistoryRun,
  a: Site,
  b: Site,
  relieved: Set<Id>,
  gained: Map<Id, string[]>,
) {
  const { rules } = run;
  let traded = false;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    const amount = moveFood(run, from, to);
    if (amount > 0) {
      traded = true;
      const famine = logOf(run, to.id).famine;
      if (famine && run.year - famine.year <= 10 && !relieved.has(to.id)) {
        relieved.add(to.id);
        run.emit({
          type: 'grain_relief',
          place: to.cell,
          causes: causesOf(famine.event),
          data: {
            site: to.name,
            from: from.name,
            amount: Math.round(amount),
            civ: civName(run, to),
          },
        });
      }
    }
    const goods = missingFor(run, from, to);
    if (goods.length > 0) {
      traded = true;
      for (const id of goods) to.wealth += rules.goodValue[id] ?? 1;
      gained.set(to.id, [...(gained.get(to.id) ?? []), ...goods]);
    }
  }
  return traded;
}

/** Every tenth year: wealth fades, then each linked pair of live sites at peace trades. */
export function runTrade(run: HistoryRun): void {
  const { rules, links, world } = run;
  const sites = liveSites(run);
  for (const site of sites) site.wealth *= 1 - rules.wealthDecay;
  const gained = new Map<Id, string[]>();
  const relieved = new Set<Id>();
  for (const a of sites) {
    for (const id of links.get(a.id) ?? []) {
      const b = world.sites.get(id);
      if (!b || id < a.id || !isLive(b)) continue;
      if (atWar(run, a.civId, b.civId)) continue;
      if (!tradePair(run, a, b, relieved, gained)) continue;
      if (a.civId === null || b.civId === null || a.civId === b.civId) continue;
      const key = pairKey(a.civId, b.civId);
      if (run.tradeOpened.has(key)) continue;
      const event = run.emit({
        type: 'trade_opened',
        place: a.cell,
        causes: causesOf(logOf(run, a.id).origin, logOf(run, b.id).origin),
        data: { civ: civName(run, a), other: civName(run, b), site: a.name, partner: b.name },
      });
      run.tradeOpened.set(key, event.id);
    }
  }
  // Salt and iron last until the next round.
  run.ironCivs = new Set();
  for (const site of sites) {
    const own = goodsOf(run, site);
    const all = [...own, ...(gained.get(site.id) ?? [])];
    logOf(run, site.id).salt = all.includes(rules.saltId);
    if (site.civId !== null && all.includes(rules.ironId)) run.ironCivs.add(site.civId);
  }
}
