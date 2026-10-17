import { describe, expect, it } from 'vitest';
import { roadPath, pointAlong } from '../../src/app/tales/march';
import {
  DEFAULT_PAUSES,
  DEFAULT_SHOWN,
  pauseAllowed,
  pauseKindOf,
  pausesLabel,
  pickPause,
  shouldPause,
  type PauseKind,
} from '../../src/app/tales/pauses';

const ev = (type: string, importance = 8, actors: number[] = []) => ({ type, importance, actors });

describe('pause filter', () => {
  it('pauses on legends, wars and new realms by default', () => {
    expect([...DEFAULT_PAUSES].sort()).toEqual(['legend', 'realm', 'war']);
    expect(pausesLabel(DEFAULT_PAUSES)).toBe('legends, wars, new realms');
    expect(shouldPause(ev('legend_risen'), DEFAULT_PAUSES, null)).toBe(true);
    expect(shouldPause(ev('war_declared'), DEFAULT_PAUSES, null)).toBe(true);
    expect(shouldPause(ev('civ_founded'), DEFAULT_PAUSES, null)).toBe(true);
    expect(shouldPause(ev('battle'), DEFAULT_PAUSES, null)).toBe(false);
    expect(shouldPause(ev('throne_seized'), DEFAULT_PAUSES, null)).toBe(false);
    expect(shouldPause(ev('famine'), DEFAULT_PAUSES, null)).toBe(false);
  });

  it('classifies the optional kinds and honours least importance', () => {
    expect(pauseKindOf('battle', 3)).toBe('battle');
    expect(pauseKindOf('throne_seized', 9)).toBe('ruler');
    expect(pauseKindOf('item_stolen', 9)).toBe('treasure');
    expect(pauseKindOf('item_stolen', 5)).toBeNull();
    expect(pauseKindOf('prophet_rose', 6)).toBe('faith');
    expect(pauseKindOf('faith_schism', 6)).toBe('faith');
    expect(pauseKindOf('beast_slain', 7)).toBeNull();
    expect(pauseKindOf('beast_slain', 9)).toBe('legend');
    const withBattles = new Set<PauseKind>([...DEFAULT_PAUSES, 'battle']);
    expect(shouldPause(ev('battle'), withBattles, null)).toBe(true);
  });

  it('files the map-tag events under a kind, so the event filter covers them', () => {
    expect(pauseKindOf('peace_made', 6)).toBe('war');
    expect(pauseKindOf('site_razed', 6)).toBe('town');
    expect(pauseKindOf('site_conquered', 6)).toBe('town');
    expect(pauseKindOf('famine', 7)).toBe('hardship');
    expect(pauseKindOf('plague', 6)).toBeNull();
    // Shown by default: the paused kinds and the settlers' quiet walk; the busy kinds stay off.
    expect([...DEFAULT_SHOWN].sort()).toEqual(['legend', 'realm', 'settlers', 'war']);
    // Settlers only walk the map: shown, but never pausing.
    expect(pauseKindOf('site_founded', 3)).toBe('settlers');
    expect(shouldPause(ev('site_founded', 9), new Set<PauseKind>(['settlers']), null)).toBe(false);
    // A peace is shown with the wars but never stops the playback.
    expect(shouldPause(ev('peace_made', 9), DEFAULT_PAUSES, null)).toBe(false);
    for (const kind of DEFAULT_PAUSES) expect(DEFAULT_SHOWN.has(kind)).toBe(true);
  });

  it('follows one person: only their events pause, whatever the kind', () => {
    expect(shouldPause(ev('legend_risen', 9, [7]), DEFAULT_PAUSES, 7)).toBe(true);
    expect(shouldPause(ev('marriage', 6, [7, 8]), DEFAULT_PAUSES, 7)).toBe(true);
    expect(shouldPause(ev('legend_risen', 9, [8]), DEFAULT_PAUSES, 7)).toBe(false);
    expect(shouldPause(ev('war_declared', 9, []), DEFAULT_PAUSES, 7)).toBe(false);
    expect(shouldPause(ev('marriage', 2, [7]), DEFAULT_PAUSES, 7)).toBe(false);
  });

  it('picks the most important pausing event of a year', () => {
    const list = [ev('battle', 9), ev('civ_founded', 6), ev('war_declared', 8)];
    expect(pickPause(list, DEFAULT_PAUSES, null)).toBe(list[2]);
    expect(pickPause([ev('famine')], DEFAULT_PAUSES, null)).toBeNull();
  });
});

describe('armies on the road', () => {
  // A 7x3 grid with a road along the middle row.
  const width = 7;
  const roads = new Uint8Array(width * 3);
  for (let x = 1; x < 6; x += 1) roads[width + x] = 1;

  it('walks the road from one end to the other', () => {
    const path = roadPath({ width, height: 3, roads }, 0, 20, 1);
    expect(path[0]).toBe(0);
    expect(path[path.length - 1]).toBe(20);
    expect(path.slice(1, -1).every((c) => roads[c]! > 0)).toBe(true);
  });

  it('falls back to a straight line when roads do not connect', () => {
    expect(roadPath({ width, height: 3, roads: new Uint8Array(21) }, 0, 20)).toEqual([0, 20]);
  });

  it('finds a point along a path', () => {
    const mid = pointAlong([7, 8, 9], width, 0.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.y).toBeCloseTo(1.5);
    expect(pointAlong([7, 8, 9], width, 1).upTo.length).toBe(3);
  });
});

describe('calmer pauses', () => {
  it('waits 20 history years and 4 seconds between cards', () => {
    expect(pauseAllowed(100, 85, 10_000, null, false)).toBe(false);
    expect(pauseAllowed(105, 85, 10_000, null, false)).toBe(true);
    expect(pauseAllowed(105, 85, 10_000, 8_000, false)).toBe(false);
    expect(pauseAllowed(105, 85, 12_000, 8_000, false)).toBe(true);
  });

  it('keeps the 4 seconds for a followed person but not the 20 years', () => {
    expect(pauseAllowed(90, 85, 20_000, 10_000, true)).toBe(true);
    expect(pauseAllowed(90, 85, 11_000, 10_000, true)).toBe(false);
  });
});
