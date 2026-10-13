// Demotion (M3.1): leaving the watched site turns it back into counts. Promoted people vanish,
// notables return to their world-tier records, items held by the vanished go back to where they
// were (or are lost at the site), and goods carry the stock's net change.

import { GOODS, type WorldState } from '../core/types';
import type { SiteContent } from './defs';
import { goodAmount } from './stock';

export function leaveSite(world: WorldState, content: SiteContent): void {
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
  // An item a promoted person holds goes back to its holder at embark if they are alive, else it is lost here.
  const heldAtEntry = new Map(active.itemsAtEntry);
  for (const item of world.items.values()) {
    if (item.holder === null || !gone.has(item.holder)) continue;
    const back = world.people.get(heldAtEntry.get(item.id) ?? -1);
    if (back && back.died === undefined && !gone.has(back.id)) item.holder = back.id;
    else if (site) {
      item.holder = null;
      item.lostAt = site.cell;
    }
  }
  for (const id of active.promoted) world.people.delete(id);
  if (site) {
    // Site.pop stays as it was: M3.1 has no births or deaths yet. When the site sim adds them,
    // apply the followed-share deltas to the pop bands here.
    for (const good of GOODS) {
      const change = goodAmount(active, content, good) - (active.stockAtEntry[good] ?? 0);
      site.goods[good] = Math.max(0, active.goodsAtEntry[good] + change);
    }
  }
  world.activeSite = null;
}
