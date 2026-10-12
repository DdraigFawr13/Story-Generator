// Legends browser helpers (M2.7): linking names inside rendered event lines, the world as it stood
// in a past year for the map's year slider, and where on the map an entity can be found.

import { decodeTerritory } from '../history/snapshots';
import { sitePopulation } from '../history/settle';
import type { Id, WorldState } from '../core/types';
import type { LegendRef } from './biography';

export interface LinkSegment {
  text: string;
  ref?: LegendRef;
}

/**
 * Splits a rendered line so each linked name is its own segment. Longest names go first and each
 * ref marks its first occurrence that does not overlap an earlier mark; absent names are skipped.
 * The segment texts always join back to `text`.
 */
export function linkSegments(
  text: string,
  links: readonly { ref: LegendRef; name: string }[],
): LinkSegment[] {
  const marks: { at: number; end: number; ref: LegendRef }[] = [];
  const longestFirst = links
    .map((link, order) => ({ ...link, order }))
    .filter((link) => link.name !== '')
    .sort((a, b) => b.name.length - a.name.length || a.order - b.order);
  for (const { ref, name } of longestFirst) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(name, from);
      if (at < 0) break;
      const end = at + name.length;
      if (!marks.some((m) => at < m.end && end > m.at)) {
        marks.push({ at, end, ref });
        break;
      }
      from = at + 1;
    }
  }
  marks.sort((a, b) => a.at - b.at);
  const out: LinkSegment[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.at > pos) out.push({ text: text.slice(pos, m.at) });
    out.push({ text: text.slice(m.at, m.end), ref: m.ref });
    pos = m.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

export interface HistoryAt {
  year: number;
  /** The decade snapshot the borders come from (at or before `year`). */
  snapshotYear: number;
  territory: Uint16Array;
  sites: Map<Id, { civId: Id | null; pop: number; ruined: boolean }>;
}

/** Borders, and the sites that existed with their owner, size and ruin state, as of `year`. */
export function historyAt(world: WorldState, year: number): HistoryAt {
  const sites: HistoryAt['sites'] = new Map();
  const snapshots = world.snapshots;
  let snap = snapshots[0];
  for (const candidate of snapshots) if (candidate.year <= year) snap = candidate;
  const rows = new Map<Id, { civId: Id | null; pop: number }>();
  if (snap) {
    for (let k = 0; k + 3 < snap.sites.length; k += 4) {
      const civ = snap.sites[k + 1]!;
      rows.set(snap.sites[k]!, { civId: civ === 0 ? null : civ, pop: snap.sites[k + 2]! });
    }
  }
  for (const site of world.sites.values()) {
    if (site.founded > year) continue;
    const ruined = site.ruinedYear !== undefined && site.ruinedYear <= year;
    const row = rows.get(site.id);
    sites.set(site.id, {
      civId: row ? row.civId : site.civId,
      pop: ruined ? 0 : row ? row.pop : sitePopulation(site),
      ruined,
    });
  }
  const { width, height } = world.params;
  return {
    year,
    snapshotYear: snap ? snap.year : year,
    territory: snap
      ? decodeTerritory(snap.territory, width * height)
      : (world.cells?.territory ?? new Uint16Array(width * height)),
    sites,
  };
}

/** The cell to centre the map on for an entity, or null when it has no place. */
export function locate(world: WorldState, ref: LegendRef): number | null {
  switch (ref.kind) {
    case 'site':
      return world.sites.get(ref.id)?.cell ?? null;
    case 'civ': {
      const civ = world.civs.get(ref.id);
      return civ ? (world.sites.get(civ.capital)?.cell ?? null) : null;
    }
    case 'person': {
      const person = world.people.get(ref.id);
      if (!person) return null;
      const home = person.siteId == null ? undefined : world.sites.get(person.siteId);
      return home ? home.cell : person.birthplaceCell;
    }
    case 'beast':
      return world.creatures.get(ref.id)?.lair ?? null;
    case 'dynasty': {
      const dynasty = world.dynasties.get(ref.id);
      return dynasty ? locate(world, { kind: 'person', id: dynasty.founderId }) : null;
    }
    case 'item': {
      const item = world.items.get(ref.id);
      return item?.holder == null ? null : locate(world, { kind: 'person', id: item.holder });
    }
  }
}
