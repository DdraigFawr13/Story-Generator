// Demotion (M3.1): leaving the watched site turns it back into counts. Promoted people vanish,
// notables return to their world-tier records, and goods carry the stock's net change.

import { GOODS, type WorldState } from '../core/types';
import type { SiteContent } from './defs';

export function leaveSite(world: WorldState, _content: SiteContent): void {
  const active = world.activeSite;
  if (!active) return;
  const site = world.sites.get(active.siteId);
  const gone = new Set(active.promoted);
  for (const id of active.residents) {
    if (gone.has(id)) continue;
    const notable = world.people.get(id);
    if (!notable) continue;
    const { family } = notable;
    family.parents = family.parents.filter((x) => !gone.has(x));
    family.spouses = family.spouses.filter((x) => !gone.has(x));
    family.children = family.children.filter((x) => !gone.has(x));
    delete family.householdId;
    delete notable.detail;
  }
  for (const id of active.promoted) world.people.delete(id);
  if (site) {
    // Site.pop stays as it was: M3.1 has no births or deaths yet. When the site sim adds them,
    // apply the followed-share deltas to the pop bands here.
    for (const good of GOODS) {
      const change = (active.stock.get(good) ?? 0) - (active.stockAtEntry[good] ?? 0);
      site.goods[good] = active.goodsAtEntry[good] + change;
    }
  }
  world.activeSite = null;
}
