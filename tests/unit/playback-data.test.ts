import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { buildPlayback, census } from '../../src/app/playback/data';
import { DAYS_PER_YEAR, eventTitle, generateWorld, type SimEvent } from '../../src/engine';

const YEARS = 60;
const world = generateWorld(
  'PLAYBACK',
  { width: 64, height: 64, historyYears: YEARS },
  DEFAULT_CONTENT,
);
const titleOf = (event: SimEvent) =>
  eventTitle(
    event,
    DEFAULT_CONTENT.eventTypes.find((def) => def.id === event.type),
  );
const data = buildPlayback(world, titleOf)!;

describe('history playback data', () => {
  it('ends at the last history year and reuses borders in years they did not move', () => {
    expect(data.last).toBe(YEARS);
    const log = world.playback!;
    const moved = log.years.filter((entry) => entry.territory).map((entry) => entry.year);
    expect(moved[0]).toBe(0);
    for (let y = 1; y <= data.last; y += 1) {
      const from = [...moved].reverse().find((year) => year <= y)!;
      expect(data.borderYear(y)).toBe(from);
      if (!log.years[y]!.territory) expect(data.bordersAt(y)).toBe(data.bordersAt(y - 1));
    }
    expect(data.bordersAt(data.last)).toHaveLength(64 * 64);
  });

  it('names the seat of every standing realm and counts what stands', () => {
    const seats = data.seatsAt(data.last);
    expect(seats.size).toBeGreaterThan(0);
    for (const [civ, site] of seats) {
      expect(data.civById.has(civ)).toBe(true);
      expect(data.sites.has(site)).toBe(true);
    }
    const now = census(data, data.last);
    expect(now.realms).toBeGreaterThan(0);
    expect(now.settlements).toBeGreaterThan(0);
    expect(now.people).toBeGreaterThan(0);
  });

  it('groups trade by decade round', () => {
    expect(data.trade.size).toBeGreaterThan(0);
    for (const [year, rows] of data.trade) {
      expect(year % 10).toBe(0);
      for (const row of rows) {
        expect(row.w).toBeGreaterThan(0);
        expect(row.w).toBeLessThanOrEqual(1);
        expect(data.sites.has(row.a) && data.sites.has(row.b)).toBe(true);
      }
    }
  });

  it('groups events by the year they happened, with titles', () => {
    expect(data.events.length).toBeGreaterThan(0);
    for (const [year, rows] of data.eventsByYear) {
      for (const row of rows) {
        expect(row.y).toBe(year);
        expect(Math.floor(world.events.find((e) => e.id === row.id)!.day / DAYS_PER_YEAR)).toBe(
          year,
        );
        expect(row.title).not.toBe('');
      }
    }
  });
});
