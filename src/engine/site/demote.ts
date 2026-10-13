// Demotion (M3.1): leaving the watched site turns it back into counts. Promoted people vanish,
// notables return to their world-tier records, items held by the vanished go back to where they
// were (or are lost at the site), and goods carry the stock's net change.

import { GOODS, type WorldState } from '../core/types';
import { bandOfAge, type SiteContent } from './defs';
import { goodAmount } from './stock';

export function leaveSite(world: WorldState, content: SiteContent): void {
  const active = world.activeSite;
  if (!active) return;
  const site = world.sites.get(active.siteId);
  const gone = new Set(active.promoted);
  // Dead notables are tidied like living ones: they keep their records, including how they died.
  for (const id of [...active.residents, ...active.dead]) {
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
    // Each death among the followed stands for 1 / share people of their band (M3.5).
    const deaths = new Map<string, number>();
    for (const id of active.dead) {
      const p = world.people.get(id);
      const race = content.races.find((r) => r.id === p?.raceId);
      if (!p || !race || p.died === undefined) continue;
      const band = bandOfAge(race, p.died - p.born);
      const key = `${p.raceId}|${p.cultureId}|${band}`;
      deaths.set(key, (deaths.get(key) ?? 0) + 1);
    }
    for (const [key, n] of deaths) {
      const [raceId, cultureId, band] = key.split('|');
      const pop =
        site.pop.find((b) => b.raceId === raceId && b.cultureId === cultureId && b.band === band) ??
        site.pop.find((b) => b.raceId === raceId && b.band === band && b.count > 0);
      if (pop) pop.count = Math.max(0, pop.count - Math.round(n / active.share));
    }
    for (const good of GOODS) {
      const change = goodAmount(active, content, good) - (active.stockAtEntry[good] ?? 0);
      site.goods[good] = Math.max(0, active.goodsAtEntry[good] + change);
    }
  }
  world.activeSite = null;
}
