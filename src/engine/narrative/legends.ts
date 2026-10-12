// Legends browser helpers (M2.7): linking names inside rendered event lines, the world as it stood
// in a past year for the map's year slider, and where on the map an entity can be found.

import { decodeTerritory } from '../history/snapshots';
import { sitePopulation } from '../history/settle';
import type { EventTypeDef } from '../core/content-types';
import { DAYS_PER_YEAR } from '../core/clock';
import type { Id, SimEvent, WorldState } from '../core/types';
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

/** An event type id as a label: "site_razed" becomes "Site razed". */
export function typeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** A year for display, with a real minus sign (U+2212) for years before the start. */
export function yearText(year: number): string {
  return year < 0 ? `\u2212${-year}` : `${year}`;
}

/** The history year (0-based) an event happened in. */
export function eventYear(event: SimEvent): number {
  return Math.floor(event.day / DAYS_PER_YEAR);
}

/**
 * The short heading for an event from its type's `title` template. A placeholder whose data value
 * is missing or empty is dropped together with the word before it ("Migration from X to {to}"
 * becomes "Migration from X"); an empty result falls back to the type's label.
 */
export function eventTitle(event: SimEvent, def?: Pick<EventTypeDef, 'title'>): string {
  const template = def?.title;
  if (template === undefined) return typeLabel(event.type);
  const value = (key: string): string => {
    if (key === 'year') return `${eventYear(event)}`;
    const raw = event.data[key];
    return raw === undefined ? '' : String(raw).trim();
  };
  const words = template.split(/\s+/).filter((word) => word !== '');
  const gone = new Set<number>();
  words.forEach((word, k) => {
    const empty = [...word.matchAll(/\{(\w+)\}/g)].some((m) => value(m[1]!) === '');
    if (!empty) return;
    gone.add(k);
    if (k > 0) gone.add(k - 1);
  });
  const text = words
    .filter((_word, k) => !gone.has(k))
    .join(' ')
    .replace(/\{(\w+)\}/g, (_m, key: string) => value(key))
    .replace(/[\s,:;]+$/, '')
    .trim();
  if (text === '') return typeLabel(event.type);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Importance as stars: none below 3, then one per band (3-5, 6-8, 9+). */
export function importanceStars(importance: number): string {
  return importance >= 9
    ? '\u2605\u2605\u2605'
    : importance >= 6
      ? '\u2605\u2605'
      : importance >= 3
        ? '\u2605'
        : '';
}

export interface HistoryAt {
  year: number;
  /** The decade snapshot the borders come from (at or before `year`). */
  snapshotYear: number;
  territory: Uint16Array;
  sites: Map<Id, { civId: Id | null; pop: number; ruined: boolean }>;
}

/** Every site as it stands now, in the same shape `historyAt` gives for a past year. */
export function liveSites(world: WorldState): HistoryAt['sites'] {
  const sites: HistoryAt['sites'] = new Map();
  for (const site of world.sites.values()) {
    const ruined = site.ruinedYear !== undefined;
    sites.set(site.id, { civId: site.civId, pop: ruined ? 0 : sitePopulation(site), ruined });
  }
  return sites;
}

/** Borders, and the sites that existed with their owner, size and ruin state, as of `year`. */
export function historyAt(
  world: WorldState,
  year: number,
  /** Decoded territory by snapshot year; pass one Map to keep scrubbing cheap. */
  territoryCache?: Map<number, Uint16Array>,
): HistoryAt {
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
  let territory: Uint16Array;
  if (snap) {
    let cached = territoryCache?.get(snap.year);
    if (!cached) {
      cached = decodeTerritory(snap.territory, width * height);
      territoryCache?.set(snap.year, cached);
    }
    territory = cached;
  } else {
    territory = world.cells?.territory ?? new Uint16Array(width * height);
  }
  return { year, snapshotYear: snap ? snap.year : year, territory, sites };
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
