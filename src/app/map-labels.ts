// Which region names the map shows, and when (M1.5). Pure planning; WorldMap draws.

import type { Region, RegionKind } from '../engine';

/** Islands with at least this many cells are labelled from the start. */
const LARGE_ISLAND_CELLS = 40;
/** Cell scale (px per cell) from which a label shows: whole map, close, or detailed. */
const SCALE_FAR = 0;
const SCALE_NEAR = 3;
const SCALE_CLOSE = 5;

export interface Label {
  region: Region;
  /** Label priority; lower wins when two labels overlap. */
  rank: number;
  /** Smallest cell scale at which the label shows. */
  minScale: number;
  /** Text size in px. */
  size: number;
  /** Water names are italic. */
  italic: boolean;
  /** Passes, fords and harbours get a small marker at the anchor. */
  marker: 'pass' | 'ford' | 'harbour' | null;
}

const FONT_SIZE: Record<RegionKind, number> = {
  sea: 16,
  range: 14,
  desert: 13,
  forest: 13,
  island: 12,
  lake: 11,
  river: 11,
  bay: 11,
  volcano: 11,
  pass: 11,
  ford: 10,
  harbour: 11,
  strait: 11,
};
const ITALIC: ReadonlySet<RegionKind> = new Set(['sea', 'lake', 'river', 'bay', 'strait']);

function plan(region: Region): Pick<Label, 'rank' | 'minScale'> {
  switch (region.kind) {
    case 'sea':
      return { rank: 0, minScale: SCALE_FAR };
    case 'range':
      return { rank: 1, minScale: SCALE_FAR };
    case 'desert':
      return { rank: 2, minScale: SCALE_FAR };
    case 'forest':
      return { rank: 3, minScale: SCALE_FAR };
    case 'island':
      return region.cells.length >= LARGE_ISLAND_CELLS
        ? { rank: 4, minScale: SCALE_FAR }
        : { rank: 7, minScale: SCALE_NEAR };
    case 'lake':
      return { rank: 5, minScale: SCALE_NEAR };
    case 'river':
      return { rank: 6, minScale: SCALE_NEAR };
    case 'bay':
      return { rank: 8, minScale: SCALE_NEAR };
    case 'volcano':
      return { rank: 9, minScale: SCALE_NEAR };
    case 'pass':
      return { rank: 10, minScale: SCALE_CLOSE };
    case 'ford':
      return { rank: 11, minScale: SCALE_CLOSE };
    case 'harbour':
      return { rank: 12, minScale: SCALE_CLOSE };
    case 'strait':
      return { rank: 13, minScale: SCALE_CLOSE };
  }
}

/** All labels in drawing priority order: rank, then larger regions first, then id. */
export function planLabels(regions: Iterable<Region>): Label[] {
  const labels: Label[] = [];
  for (const region of regions) {
    labels.push({
      region,
      ...plan(region),
      size: FONT_SIZE[region.kind],
      italic: ITALIC.has(region.kind),
      marker:
        region.kind === 'pass' || region.kind === 'ford' || region.kind === 'harbour'
          ? region.kind
          : null,
    });
  }
  return labels.sort(
    (a, b) =>
      a.rank - b.rank || b.region.cells.length - a.region.cells.length || a.region.id - b.region.id,
  );
}

/** Cell index to the regions that contain it, in region id order. */
export function regionLookup(regions: Iterable<Region>): Map<number, Region[]> {
  const out = new Map<number, Region[]>();
  for (const region of regions) {
    for (const cell of region.cells) {
      const list = out.get(cell);
      if (list) list.push(region);
      else out.set(cell, [region]);
    }
  }
  return out;
}

/** True when two label boxes (x, y, width, height) overlap. */
export function boxesOverlap(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}
