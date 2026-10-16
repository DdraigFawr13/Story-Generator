import { describe, expect, it } from 'vitest';
import {
  CARD_ROWS,
  ZOOM_MAX,
  centreOn,
  clampView,
  clampZoom,
  clusterMarks,
  eventsAt,
  groupMarks,
  groupTitle,
  kindMix,
  zoomAt,
} from '../../src/app/tales/explore';
import type { PauseKind } from '../../src/app/tales/pauses';

const land = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 };
const stage = { w: 1000, h: 700 };

describe('explore zoom', () => {
  it('keeps the zoom between 1x and 4x', () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('keeps the point under the pointer fixed while zooming', () => {
    const v = { z: 1, left: 100, top: 20 };
    const p = { x: 400, y: 300 };
    const next = zoomAt(v, 600, 2, p);
    const before = { x: (p.x - v.left) / 600, y: (p.y - v.top) / 600 };
    const after = { x: (p.x - next.left) / 1200, y: (p.y - next.top) / 1200 };
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAt(v, 600, 10, p).z).toBe(ZOOM_MAX);
  });

  it('keeps the land box on the stage when zoomed in', () => {
    const base = 600;
    const far = clampView({ z: 3, left: 5000, top: 5000 }, base, stage, land);
    expect(far.left + land.x0 * base * 3).toBeLessThanOrEqual(0);
    expect(far.top + land.y0 * base * 3).toBeLessThanOrEqual(0);
    const other = clampView({ z: 3, left: -9000, top: -9000 }, base, stage, land);
    expect(other.left + land.x1 * base * 3).toBeGreaterThanOrEqual(stage.w);
    expect(other.top + land.y1 * base * 3).toBeGreaterThanOrEqual(stage.h);
  });

  it('centres a land box that is smaller than the stage', () => {
    const v = clampView({ z: 1, left: 900, top: -400 }, 400, stage, land);
    const boxW = (land.x1 - land.x0) * 400;
    expect(v.left + land.x0 * 400 + boxW / 2).toBeCloseTo(stage.w / 2, 6);
  });

  it('centres a place for the first view of a ringed cell', () => {
    const v = centreOn(0.5, 0.25, 2, 600, stage);
    expect(v.left + 0.5 * 1200).toBeCloseTo(stage.w / 2, 6);
    expect(v.top + 0.25 * 1200).toBeCloseTo(stage.h / 2, 6);
  });
});

describe('event marks', () => {
  const all = new Set<PauseKind>(['war', 'legend', 'battle']);
  const ev = (id: number, y: number, type: string, importance: number, place: number | null) => ({
    id,
    y,
    type,
    importance,
    place,
    title: `T${id}`,
  });
  const events = [
    ev(1, 10, 'war_declared', 5, 7),
    ev(2, 30, 'legend_risen', 9, 7),
    ev(3, 20, 'battle', 4, 7),
    ev(4, 40, 'war_declared', 5, 8),
    ev(5, 15, 'war_declared', 5, null),
    ev(6, 25, 'unknown_thing', 9, 9),
  ];

  it('groups by cell, newest first, the most important kind standing for the cell', () => {
    const groups = groupMarks(events, 100, all);
    expect(groups.map((g) => g.cell)).toEqual([7, 8]);
    expect(groups[0]!.kind).toBe('legend');
    expect(groups[0]!.events.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it('keeps to the year shown and the kinds shown', () => {
    const g = groupMarks(events, 25, new Set<PauseKind>(['war', 'battle']));
    expect(g).toHaveLength(1);
    expect(g[0]!.kind).toBe('war');
    expect(g[0]!.events.map((e) => e.id)).toEqual([3, 1]);
    expect(groupMarks(events, 100, new Set())).toEqual([]);
  });

  it('caps the marks, keeping the most important', () => {
    const many = Array.from({ length: 10 }, (_, i) => ev(100 + i, 5, 'war_declared', i, i));
    const g = groupMarks(many, 50, all, 3);
    expect(g.map((x) => x.cell)).toEqual([7, 8, 9]);
  });

  it('writes a hover line a year and folds a long list', () => {
    const rows = Array.from({ length: CARD_ROWS + 2 }, (_, i) => ({ y: i, title: `E${i}` }));
    const lines = groupTitle(rows).split('\n');
    expect(lines[0]).toBe('Year 0 · E0');
    expect(lines).toHaveLength(CARD_ROWS + 1);
    expect(lines.at(-1)).toBe('and 2 more');
  });
});

describe('mark clusters and the place card', () => {
  const ev = (id: number, y: number, type: string, importance: number, place: number) => ({
    id,
    y,
    type,
    importance,
    place,
  });
  const events = [
    ev(1, 10, 'war_declared', 5, 0),
    ev(2, 20, 'legend_risen', 9, 1),
    ev(3, 30, 'battle', 4, 0),
    ev(4, 40, 'war_declared', 5, 50),
  ];
  const shown = new Set<PauseKind>(['war', 'legend', 'battle']);

  it('merges marks closer than 18 px on screen, the most important keeps the place', () => {
    const groups = groupMarks(events, 100, shown);
    // 100 cells across on a 1000 px map: cells 0 and 1 are 10 px apart, cell 50 far away.
    const near = clusterMarks(groups, 100, 1000);
    expect(near).toHaveLength(2);
    expect(near[0]!.cells.sort()).toEqual([0, 1]);
    expect(near[0]!.cell).toBe(1);
    expect(near[0]!.kind).toBe('legend');
    expect(near[0]!.events.map((e) => e.id)).toEqual([3, 2, 1]);
    // Zoomed in 4x the same two places are 40 px apart: no merge.
    expect(clusterMarks(groups, 100, 4000)).toHaveLength(3);
  });

  it('lists every shown event at some cells, newest first, and counts them by kind', () => {
    const list = eventsAt(events, new Set([0, 1]), 100, shown);
    expect(list.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(eventsAt(events, new Set([0, 1]), 15, shown).map((e) => e.id)).toEqual([1]);
    expect(kindMix(list)).toBe('1 legend · 1 war · 1 battle');
  });
});
