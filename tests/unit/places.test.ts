import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, type WorldState } from '../../src/engine';
import { allPlaces, placeLine, placesAt } from '../../src/app/places';

const day = (year: number) => year * DAYS_PER_YEAR;

// A tiny world: an old mine at cell 500 where one company set out in year 40 and was lost (a
// companion died, and so did its leader), a second came back with an item in year 60; a stone lies there.
const world = {
  places: new Map([
    [
      1,
      {
        id: 1,
        kind: 'old-mine',
        name: 'the Deep Delving',
        cell: 500,
        since: 0,
        danger: 6,
        finds: 0,
        deeds: [10, 11, 12, 20, 21],
      },
    ],
    [
      2,
      {
        id: 2,
        kind: 'lair',
        name: 'an empty den',
        cell: 800,
        since: 90,
        danger: 2,
        finds: 1,
        deeds: [],
      },
    ],
  ]),
  events: [
    {
      id: 10,
      type: 'expedition_set_out',
      day: day(40),
      actors: [7],
      causes: [],
      data: { who: 'Ana', site: 'Penn', party: 5 },
    },
    {
      id: 11,
      type: 'expedition_failed',
      day: day(41),
      actors: [7],
      causes: [10],
      data: { dead: 3 },
    },
    { id: 12, type: 'notable_died', day: day(41), actors: [7], causes: [11], data: {} },
    {
      id: 20,
      type: 'expedition_set_out',
      day: day(60),
      actors: [],
      causes: [],
      data: { who: 'miners', site: 'Penn', party: 4 },
    },
    {
      id: 21,
      type: 'expedition_treasure',
      day: day(62),
      actors: [],
      causes: [20],
      data: { dead: 0, item: 'the Grey Harp' },
    },
  ],
  items: new Map([
    [3, { id: 3, name: 'a stone', holder: null, lostAt: 500 }],
    [4, { id: 4, name: 'a held blade', holder: 7, lostAt: 500 }],
  ]),
  creatures: new Map(),
  people: new Map(),
  sites: new Map(),
} as unknown as WorldState;

describe('perilous places', () => {
  const places = allPlaces(world);
  const mine = places[0]!;

  it('pairs each setting-out with its outcome through causes', () => {
    expect(mine.expeditions.map((x) => [x.year, x.outcome, x.endId])).toEqual([
      [40, 'lost', 11],
      [60, 'treasure', 21],
    ]);
    expect(mine.expeditions[1]!.found).toBe('the Grey Harp');
  });

  it('counts companions and named figures among its dead', () => {
    expect(mine.fallen).toEqual([7]);
    expect(mine.deaths).toBe(4);
  });

  it('lists only unheld items lying at its cell', () => {
    expect(mine.lying).toEqual([3]);
    expect(places[1]!.lying).toEqual([]);
  });

  it('tells the story by year and the places there were', () => {
    expect(placesAt(places, 50).map((p) => p.id)).toEqual([1]);
    expect(placeLine(mine, 50)).toBe(
      'The Deep Delving, a mine of the elder days; 1 expedition, 4 dead',
    );
  });
});
