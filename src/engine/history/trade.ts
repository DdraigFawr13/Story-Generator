// Trade (M2.4): once a decade, linked sites of civs at peace swap each good from surplus to
// shortage. Both sides gain wealth for every unit that moves.

import { GOODS, type GoodId, type Id, type Site } from '../core/types';
import { goodNeed } from './goods';
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

/** Smallest amount worth carrying. */
const MIN_TRADE = 1;

/** What a site uses of a good in a year (food is the whole population's food). */
function yearlyNeed(run: HistoryRun, site: Site, good: GoodId): number {
  return good === 'food' ? siteNeed(site, run.races) : goodNeed(run, site, good);
}

/** Units of `good` moved from `from` to `to` (0 if none). */
function moveGood(run: HistoryRun, from: Site, to: Site, good: GoodId): number {
  const { rules } = run;
  let amount: number;
  if (good === 'luxury') {
    // Luxury has no need: the richer sends a share, at most half the gap so it never flips.
    if (from.goods.luxury <= to.goods.luxury) return 0;
    amount = Math.min(
      from.goods.luxury * rules.luxuryTradeShare,
      (from.goods.luxury - to.goods.luxury) / 2,
    );
  } else {
    const surplus = from.goods[good] - yearlyNeed(run, from, good) * rules.tradeKeepYears;
    const shortage = yearlyNeed(run, to, good) * rules.tradeKeepYears - to.goods[good];
    amount = Math.min(surplus, shortage);
  }
  if (amount < MIN_TRADE) return 0;
  from.goods[good] -= amount;
  to.goods[good] += amount;
  return amount;
}

/** One trade round for a linked pair; returns true if anything changed hands. */
function tradePair(run: HistoryRun, a: Site, b: Site, relieved: Set<Id>): boolean {
  const { rules } = run;
  let traded = false;
  let total = 0;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const good of GOODS) {
      const amount = moveGood(run, from, to, good);
      if (amount <= 0) continue;
      traded = true;
      const value = amount * rules.goodValue[good];
      total += value;
      from.wealth += value;
      to.wealth += value;
      if (good !== 'food') continue;
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
  }
  // Display only: the playback draws each decade's trades as threads.
  if (traded) run.tradeRows.push(run.year, a.id, b.id, Math.max(1, Math.round(total)));
  return traded;
}

/** Every tenth year: wealth fades, then each linked pair of live sites at peace trades. */
export function runTrade(run: HistoryRun): void {
  const { rules, links, world } = run;
  const sites = liveSites(run);
  for (const site of sites) site.wealth *= 1 - rules.wealthDecay;
  const relieved = new Set<Id>();
  for (const a of sites) {
    for (const id of links.get(a.id) ?? []) {
      const b = world.sites.get(id);
      if (!b || id < a.id || !isLive(b)) continue;
      if (atWar(run, a.civId, b.civId)) continue;
      if (!tradePair(run, a, b, relieved)) continue;
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
}
