// Goods (M2.4): food plus ore, timber, salt and luxury. Non-food goods are made each year from
// the deposits near a site, eaten by need, and moved by trade. No randomness.

import type { Goods, GoodId, Site } from '../core/types';
import { GOODS } from '../core/types';
import { bandCount, totalPop } from './pop';
import { liveSites, type HistoryRun } from './state';

/** A site's empty stocks. */
export function emptyGoods(): Goods {
  return { food: 0, ore: 0, timber: 0, salt: 0, luxury: 0 };
}

/** Deposit cells of each good within `tradeGoodsRange` cells of the site (cached per site). */
export function depositsNear(run: HistoryRun, site: Site): Goods {
  const cached = run.deposits.get(site.id);
  if (cached) return cached;
  const { cells, rules, content } = run;
  const { width, height } = cells;
  const range = rules.tradeGoodsRange;
  const cx = site.cell % width;
  const cy = (site.cell - cx) / width;
  const counts = emptyGoods();
  for (let y = Math.max(0, cy - range); y <= Math.min(height - 1, cy + range); y += 1) {
    for (let x = Math.max(0, cx - range); x <= Math.min(width - 1, cx + range); x += 1) {
      for (const deposit of cells.resources.get(y * width + x) ?? []) {
        const good = content.resources[deposit.resource]?.good;
        if (good) counts[good] += 1;
      }
    }
  }
  run.deposits.set(site.id, counts);
  return counts;
}

/** What a site's people use of a non-food good in a year (food is `siteNeed`). */
export function goodNeed(run: HistoryRun, site: Site, good: GoodId): number {
  const per = run.rules.need[good];
  if (good === 'salt') return totalPop(site) * per;
  return bandCount(site, 'adult') * per;
}

/** True when the site has less than a year's timber. */
export function timberShort(run: HistoryRun, site: Site): boolean {
  return site.goods.timber < goodNeed(run, site, 'timber');
}

/** Yearly: sites make non-food goods from nearby deposits and use what they need; luxury adds wealth. */
export function runGoods(run: HistoryRun): void {
  const { rules } = run;
  for (const site of liveSites(run)) {
    const adults = bandCount(site, 'adult');
    const deposits = depositsNear(run, site);
    for (const good of GOODS) {
      if (good === 'food') continue;
      const share = Math.min(1, deposits[good] / rules.depositsForFull);
      const made = adults * rules.goodsPerWorker[good] * share;
      const cap = rules.goodsCapYears * adults * rules.goodsPerWorker[good];
      site.goods[good] = Math.max(
        0,
        Math.min(site.goods[good] + made - goodNeed(run, site, good), cap),
      );
    }
    site.wealth += site.goods.luxury * rules.goodValue.luxury * rules.luxuryWealthShare;
  }
}
