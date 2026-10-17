// The great works on the Tales explore map: every tower, wall, bridge and warded grove a site
// raised, and the home of every great item (the site it was made at). Pure: no DOM.

import type { Id, WorldState } from '../../engine';

export type WorkKind = 'wall' | 'bridge' | 'tower' | 'grove' | 'item';

export const WORK_KINDS: readonly { id: WorkKind; label: string }[] = [
  { id: 'tower', label: 'tower' },
  { id: 'wall', label: 'wall' },
  { id: 'bridge', label: 'bridge' },
  { id: 'grove', label: 'warded grove' },
  { id: 'item', label: 'great item made' },
];

export interface WorkMark {
  key: string;
  kind: WorkKind;
  name: string;
  siteId: Id;
  cell: number;
  /** History year it was raised or made. */
  raised: number;
  /** History year it fell, once it has. */
  fell?: number;
  /** Who raised or made it. */
  by: string | null;
  /** The maker's home when it is not the site the work stands at ("of Ponteezza"). */
  home?: string;
  /** Its place among the works at the same site, oldest first (0, 1, ...). */
  slot: number;
}

const isKind = (k: string): k is WorkKind => WORK_KINDS.some((w) => w.id === k);

/** Every great work and great item home in the world, oldest first. */
export function allWorks(world: WorldState): WorkMark[] {
  const out: Omit<WorkMark, 'slot'>[] = [];
  const nameOf = (id: Id | null) => (id == null ? null : (world.people.get(id)?.name ?? null));
  const homeOf = (id: Id | null, siteId: Id) => {
    const home = id == null ? null : world.people.get(id)?.siteId;
    const name = home == null || home === siteId ? undefined : world.sites.get(home)?.name;
    return name ? { home: name } : {};
  };
  for (const site of world.sites.values()) {
    for (const w of site.works ?? []) {
      if (!isKind(w.kind)) continue;
      out.push({
        key: `work:${w.eventId}`,
        kind: w.kind,
        name: w.name,
        siteId: site.id,
        cell: site.cell,
        raised: w.raised,
        ...(w.fell !== undefined ? { fell: w.fell } : {}),
        by: nameOf(w.builderId),
        ...homeOf(w.builderId, site.id),
      });
    }
  }
  const siteAt = new Map<number, Id>();
  for (const site of world.sites.values())
    if (!siteAt.has(site.cell)) siteAt.set(site.cell, site.id);
  const madeAt = new Map<Id, number>();
  for (const e of world.events) {
    if (e.type === 'great_item_made' && e.place !== null) madeAt.set(e.id, e.place);
  }
  for (const item of world.items.values()) {
    if (!item.great) continue;
    const made = item.deeds.find((id) => madeAt.has(id));
    const cell = made === undefined ? undefined : madeAt.get(made);
    const siteId = cell === undefined ? undefined : siteAt.get(cell);
    if (made === undefined || cell === undefined || siteId === undefined) continue;
    out.push({
      key: `item:${item.id}`,
      kind: 'item',
      name: item.name,
      siteId,
      cell,
      raised: item.made,
      by: nameOf(item.makerId),
      ...homeOf(item.makerId, siteId),
    });
  }
  out.sort((a, b) => a.raised - b.raised || a.key.localeCompare(b.key));
  const seen = new Map<number, number>();
  return out.map((w) => {
    const slot = seen.get(w.cell) ?? 0;
    seen.set(w.cell, slot + 1);
    return { ...w, slot };
  });
}

/** The works raised by `year`; a fallen one stays, marked as fallen from its year on. */
export const worksAt = (works: readonly WorkMark[], year: number): WorkMark[] =>
  works.filter((w) => w.raised <= year);

/** One line for a work's tooltip and the town card: "The Grey Tower, a tower raised in year 132 by Ana". */
export function workLine(w: WorkMark, year: number): string {
  const label = WORK_KINDS.find((k) => k.id === w.kind)!.label;
  const what = w.kind === 'item' ? 'a great item made' : `a ${label} raised`;
  const by = w.by ? ` by ${w.by}${w.home ? ` of ${w.home}` : ''}` : '';
  const fell = w.fell !== undefined && w.fell <= year ? `; fell in year ${w.fell}` : '';
  const name = w.name.charAt(0).toUpperCase() + w.name.slice(1);
  return `${name}, ${what} in year ${w.raised}${by}${fell}`;
}
