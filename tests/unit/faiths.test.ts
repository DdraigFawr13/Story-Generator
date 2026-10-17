import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, type WorldState } from '../../src/engine';
import { allFaiths, andList, byFollowing, faithLine, godsText } from '../../src/app/faiths';

const day = (year: number) => year * DAYS_PER_YEAR;

// Two faiths: the old Grove (holy city Penn, kept by one realm and one town) and the Ember path,
// which split from it in year 120 and was forgotten in year 200.
const world = {
  faiths: new Map([
    [
      1,
      {
        id: 1,
        name: 'The Grove',
        gods: ['Cernun'],
        sacred: ['oak', 'rain'],
        abhors: 'iron',
        founded: 0,
        seatSiteId: 5,
        highPriestId: 8,
      },
    ],
    [
      2,
      {
        id: 2,
        name: 'The Ember Path',
        gods: ['Ash', 'Cinder'],
        sacred: ['fire'],
        abhors: 'water',
        founded: 120,
        parentId: 1,
        founderId: 7,
        forgotten: 200,
      },
    ],
  ]),
  events: [
    {
      id: 1,
      type: 'high_priest_named',
      day: day(10),
      actors: [7],
      causes: [],
      data: { name: 'Ana', rank: 'Archdruid', faith: 'The Grove', site: 'Penn' },
    },
    {
      id: 2,
      type: 'high_priest_named',
      day: day(60),
      actors: [8],
      causes: [],
      data: { name: 'Bram', rank: 'Archdruid', faith: 'The Grove', site: 'Penn' },
    },
    {
      id: 3,
      type: 'holy_war_proclaimed',
      day: day(90),
      actors: [],
      causes: [],
      data: { civ: 'Horde of Dharolug', enemy: 'Kingdom of Penn', faith: 'The Grove' },
    },
    {
      id: 4,
      type: 'faith_schism',
      day: day(120),
      actors: [7],
      causes: [],
      data: { faith: 'The Ember Path', parent: 'The Grove' },
    },
    {
      id: 5,
      type: 'faith_forgotten',
      day: day(200),
      actors: [],
      causes: [],
      data: { faith: 'The Ember Path', god: 'Cinder' },
    },
  ],
  sites: new Map([
    [5, { id: 5, civId: 1, faithId: 1, peakPop: 100, cell: 3, pop: [] }],
    [6, { id: 6, civId: 1, faithId: 1, peakPop: 50, cell: 4, pop: [] }],
    [9, { id: 9, civId: 2, faithId: 1, peakPop: 40, cell: 6, pop: [] }],
  ]),
  civs: new Map([
    [1, { id: 1, faithId: 1 }],
    [2, { id: 2, faithId: 2 }],
  ]),
  people: new Map(),
} as unknown as WorldState;

describe('faiths', () => {
  const faiths = allFaiths(world);
  const grove = faiths[0]!;
  const ember = faiths[1]!;

  it('lists high priests in order with their rank and year', () => {
    expect(grove.highPriests.map((h) => [h.name, h.rank, h.year, h.site])).toEqual([
      ['Ana', 'Archdruid', 10, 'Penn'],
      ['Bram', 'Archdruid', 60, 'Penn'],
    ]);
  });

  it('lists holy wars it proclaimed', () => {
    expect(grove.holyWars).toHaveLength(1);
    expect(grove.holyWars[0]).toMatchObject({ civ: 'Horde of Dharolug', preached: false });
  });

  it('knows its schisms and the deeds that name it', () => {
    expect(grove.children).toEqual([2]);
    expect(ember.deeds).toEqual([4, 5]);
    expect(grove.deeds).toContain(4);
    expect(grove.seatSiteId).toBe(5);
  });

  it('gives a forgotten faith no realms or towns', () => {
    expect(ember.realms).toEqual([]);
    expect(ember.towns).toBe(0);
    expect(grove.realms).toEqual([1]);
    expect(grove.towns).toBe(3);
    expect(grove.otherTowns).toEqual([9]);
    expect(ember.forgottenGod).toBe('Cinder');
  });

  it('words its list line and orders the living first', () => {
    expect(faithLine(grove)).toBe('1 realm, 3 towns · 1 holy war · 1 schism');
    expect(faithLine(ember)).toBe('forgotten Year 200');
    expect(
      [...faiths]
        .reverse()
        .sort(byFollowing)
        .map((f) => f.id),
    ).toEqual([1, 2]);
  });

  it('words gods and lists', () => {
    expect(godsText(['Cernun'])).toBe('one god, Cernun');
    expect(godsText(['Ash', 'Cinder'])).toBe('two gods: Ash and Cinder');
    expect(andList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
