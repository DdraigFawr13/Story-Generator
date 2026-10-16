// Pure helpers for the Tales explore state: zoom and pan of the map, and the event marks. No DOM.

import { PAUSE_KINDS, pauseKindOf, type PauseKind } from './pauses';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
/** Every living town is named from this zoom up. */
export const TOWN_NAMES_ZOOM = 2;
/** Event marks drawn at once at the most (the most important win). */
export const MAX_MARKS = 320;
/** Events a card lists for one place at the most. */
export const CARD_ROWS = 5;

export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

/** The map's box on the stage: top-left corner and the side of the (square) atlas, in pixels. */
export interface View {
  z: number;
  left: number;
  top: number;
}
/** The land's box as fractions of the atlas side. */
export interface Land {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Keeps the land box on the stage; a box smaller than the free stage is centred in it. */
export function clampView(
  v: View,
  base: number,
  stage: { w: number; h: number },
  land: Land,
  /** Stage rows kept clear above and below (phones). */
  reserve = { top: 0, bottom: 0 },
): View {
  const size = base * v.z;
  const axis = (pos: number, f0: number, f1: number, lo: number, hi: number, full: number) => {
    const boxW = (f1 - f0) * size;
    if (boxW <= hi - lo) return lo + (hi - lo - boxW) / 2 - f0 * size;
    const min = full - boxW - f0 * size;
    const max = -f0 * size;
    return Math.max(min, Math.min(max, pos));
  };
  return {
    z: v.z,
    left: axis(v.left, land.x0, land.x1, 0, stage.w, stage.w),
    top: axis(v.top, land.y0, land.y1, reserve.top, stage.h - reserve.bottom, stage.h),
  };
}

/** Zooms to `nz` keeping the map point under `p` (stage pixels) where it is. */
export function zoomAt(v: View, base: number, nz: number, p: { x: number; y: number }): View {
  const z = clampZoom(nz);
  const fx = (p.x - v.left) / (base * v.z);
  const fy = (p.y - v.top) / (base * v.z);
  return { z, left: p.x - fx * base * z, top: p.y - fy * base * z };
}

/** A view at `z` with the atlas point (fractions) in the middle of the stage. */
export function centreOn(
  fx: number,
  fy: number,
  z: number,
  base: number,
  stage: { w: number; h: number },
): View {
  const zz = clampZoom(z);
  return { z: zz, left: stage.w / 2 - fx * base * zz, top: stage.h / 2 - fy * base * zz };
}

export interface MarkEvent {
  id: number;
  y: number;
  type: string;
  importance: number;
  place: number | null;
}
/** The events at one cell, newest first, and the kind that stands for them. */
export interface MarkGroup<E extends MarkEvent = MarkEvent> {
  cell: number;
  kind: PauseKind;
  events: E[];
  /** The importance of the group's most important event. */
  top: number;
}

const KIND_RANK = new Map(PAUSE_KINDS.map((k, i) => [k.id, i]));

/**
 * The marks for the events up to `year` whose kind is shown, one group a cell. A group's kind is
 * that of its most important event (the newest wins a tie). At most `cap` groups, the most
 * important first; the list is in cell order so it does not shuffle while scrubbing.
 */
export function groupMarks<E extends MarkEvent>(
  events: readonly E[],
  year: number,
  shown: ReadonlySet<PauseKind>,
  cap = MAX_MARKS,
): MarkGroup<E>[] {
  const byCell = new Map<number, { events: E[]; kinds: PauseKind[] }>();
  for (const e of events) {
    if (e.place === null || e.y > year) continue;
    const kind = pauseKindOf(e.type, e.importance);
    if (!kind || !shown.has(kind)) continue;
    const g = byCell.get(e.place) ?? { events: [], kinds: [] };
    g.events.push(e);
    g.kinds.push(kind);
    byCell.set(e.place, g);
  }
  const out: (MarkGroup<E> & { top: number })[] = [];
  for (const [cell, g] of byCell) {
    // Newest first; the sort is stable on the id for events of one year.
    const order = g.events
      .map((e, i) => ({ e, kind: g.kinds[i]! }))
      .sort((a, b) => b.e.y - a.e.y || b.e.id - a.e.id);
    let best = order[0]!;
    for (const o of order) if (o.e.importance > best.e.importance) best = o;
    out.push({ cell, kind: best.kind, events: order.map((o) => o.e), top: best.e.importance });
  }
  let kept = out;
  if (kept.length > cap) {
    kept = [...out]
      .sort(
        (a, b) =>
          b.top - a.top ||
          (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0) ||
          a.cell - b.cell,
      )
      .slice(0, cap);
  }
  return kept
    .sort((a, b) => a.cell - b.cell)
    .map(({ cell, kind, events: list, top }) => ({ cell, kind, events: list, top }));
}

/** Hover words for a group: "Year 12 · title" a line, newest first, at most five lines. */
export function groupTitle(events: readonly { y: number; title: string }[]): string {
  const lines = events.slice(0, CARD_ROWS).map((e) => `Year ${e.y} · ${e.title}`);
  if (events.length > CARD_ROWS) lines.push(`and ${events.length - CARD_ROWS} more`);
  return lines.join('\n');
}

/** Marks closer than this on screen (pixels) merge into one. */
export const CLUSTER_PX = 18;
/** Zoom from which marks are full glyphs; below it they are small dots. */
export const GLYPH_ZOOM = 2;
/** Marks drawn at once on the whole map, where they are dots. */
export const MAX_DOTS = 120;

/** One mark on screen: one or more places, the kind of the most important, all their events. */
export interface MarkCluster<E extends MarkEvent = MarkEvent> {
  /** The place of the most important group; the mark stands here. */
  cell: number;
  kind: PauseKind;
  cells: number[];
  /** Newest first. */
  events: E[];
}

/**
 * Merges groups whose marks lie within `minPx` of each other on screen. `size` is the atlas side
 * in pixels at the zoom shown; `width` the cells across. The most important group of a bunch
 * keeps the place and the kind.
 */
export function clusterMarks<E extends MarkEvent>(
  groups: readonly MarkGroup<E>[],
  width: number,
  size: number,
  minPx = CLUSTER_PX,
): MarkCluster<E>[] {
  const order = [...groups].sort((a, b) => b.top - a.top || a.cell - b.cell);
  const out: (MarkCluster<E> & { x: number; y: number })[] = [];
  for (const g of order) {
    const x = (((g.cell % width) + 0.5) / width) * size;
    const y = ((Math.floor(g.cell / width) + 0.5) / width) * size;
    const near = out.find((c) => Math.hypot(c.x - x, c.y - y) < minPx);
    if (near) {
      near.cells.push(g.cell);
      near.events.push(...g.events);
    } else out.push({ cell: g.cell, kind: g.kind, cells: [g.cell], events: [...g.events], x, y });
  }
  return out
    .map(({ cell, kind, cells, events }) => ({
      cell,
      kind,
      cells,
      events: events.sort((a, b) => b.y - a.y || b.id - a.id),
    }))
    .sort((a, b) => a.cell - b.cell);
}

/** The events of the shown kinds at these cells up to `year`, newest first. */
export function eventsAt<E extends MarkEvent>(
  events: readonly E[],
  cells: ReadonlySet<number>,
  year: number,
  shown: ReadonlySet<PauseKind>,
): E[] {
  return events
    .filter((e) => {
      if (e.place === null || !cells.has(e.place) || e.y > year) return false;
      const kind = pauseKindOf(e.type, e.importance);
      return kind !== null && shown.has(kind);
    })
    .sort((a, b) => b.y - a.y || b.id - a.id);
}

/** Events by kind, in the order of the filter: "3 wars · 2 legends". */
/** A kind's words for a single event, where they differ from the plural label. */
const ONE: Partial<Record<string, string>> = {
  legend: 'legend',
  war: 'war',
  realm: 'new realm',
  battle: 'battle',
  ruler: 'new ruler',
  town: 'town taken',
};

export function kindMix(events: readonly MarkEvent[]): string {
  const count = new Map<PauseKind, number>();
  for (const e of events) {
    const kind = pauseKindOf(e.type, e.importance);
    if (kind) count.set(kind, (count.get(kind) ?? 0) + 1);
  }
  return PAUSE_KINDS.filter((k) => count.has(k.id))
    .map((k) => `${count.get(k.id)} ${count.get(k.id) === 1 ? (ONE[k.id] ?? k.label) : k.label}`)
    .join(' · ');
}
