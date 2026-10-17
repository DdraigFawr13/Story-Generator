import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, type WorldState } from '../../src/engine';
import { allOrders, orderLine, personOrder } from '../../src/app/orders';

const day = (year: number) => year * DAYS_PER_YEAR;
const ev = (
  id: number,
  type: string,
  year: number,
  actors: number[],
  data: Record<string, string | number>,
  causes: number[] = [],
) => ({ id, type, day: day(year), importance: 5, actors, place: null, causes, data });

// A tiny world. The Order of the Ash, founded by Ana (1) in year 10 at Penn for the Iron Folk:
// Bryn (2) joined in year 12 and slew a beast that raided them in year 15, Ana died in year 20
// and Bryn led it after her, and Cai (3) joined with no record left of when. An academy of fire,
// opened by Dew (4) in year 30, lost one of its two spells when it ended in year 50.
const world = {
  params: { historyYears: 100 },
  civs: new Map([[1, { id: 1, name: 'Iron Folk' }]]),
  sites: new Map([[1, { id: 1, name: 'Penn', cell: 9 }]]),
  people: new Map([
    [1, { id: 1, name: 'Ana', civId: 1, died: 20, deeds: [10, 19] }],
    [2, { id: 2, name: 'Bryn', civId: 1, deeds: [11, 13, 21] }],
    [3, { id: 3, name: 'Cai', civId: 1, deeds: [] }],
    [4, { id: 4, name: 'Dew', civId: 1, died: 48, deeds: [30, 31] }],
  ]),
  orders: new Map([
    [
      1,
      {
        id: 1,
        kind: 'order',
        name: 'the Order of the Ash',
        founderId: 1,
        civId: 1,
        siteId: 1,
        founded: 10,
        event: 10,
        heads: [1, 2],
        members: [1, 2, 3],
        lore: [],
        lost: [],
      },
    ],
    [
      2,
      {
        id: 2,
        kind: 'academy',
        name: 'the Fire Hall',
        founderId: 4,
        civId: 1,
        siteId: 1,
        founded: 30,
        event: 30,
        heads: [4],
        members: [4],
        school: 'fire',
        lore: ['spark', 'blaze'],
        lost: ['blaze'],
        ended: 50,
        endEvent: 32,
      },
    ],
  ]),
  events: [
    ev(10, 'order_founded', 10, [1], { order: 'the Order of the Ash', site: 'Penn' }),
    ev(11, 'order_joined', 12, [2], { order: 'the Order of the Ash' }),
    ev(12, 'beast_raid', 14, [], { civ: 'Iron Folk' }),
    ev(13, 'beast_slain', 15, [2], { beast: 'Grak' }, [12]),
    { ...ev(19, 'notable_died', 20, [1], {}), importance: 9 },
    ev(21, 'order_head', 21, [2], { order: 'the Order of the Ash' }),
    ev(22, 'mage_hunted', 25, [], {
      knights: ', with the knights of the Order of the Ash under Bryn riding at their head',
    }),
    ev(30, 'academy_founded', 30, [4], { order: 'the Fire Hall', site: 'Penn' }),
    ev(31, 'academy_lore_lost', 50, [], { order: 'the Fire Hall', spells: 'Blaze' }),
    ev(32, 'order_ended', 50, [], { order: 'the Fire Hall', reason: 'its last scholar died' }),
  ],
} as unknown as WorldState;
const content = {
  abilities: [
    { id: 'spark', name: 'Spark' },
    { id: 'blaze', name: 'Blaze' },
  ],
} as never;

describe('orders and academies', () => {
  const [ash, hall] = allOrders(world, content);

  it('lists masters in turn, members with when they joined, and its own chronicle', () => {
    expect(ash!.heads).toEqual([
      { personId: 1, from: 10, to: 20, diedInOffice: true, event: 10 },
      { personId: 2, from: 21, event: 21 },
    ]);
    expect(ash!.members.map((m) => [m.personId, m.joined, m.serving])).toEqual([
      [1, 10, false],
      [2, 12, true],
      [3, undefined, true],
    ]);
    expect(ash!.members.map((m) => m.best)).toEqual([undefined, 13, undefined]);
    expect(ash!.members[2]).toMatchObject({ joinedAfter: 12 });
    expect(ash!.hunts).toEqual([13]);
    expect(ash!.witchHunts).toEqual([22]);
    expect(ash!.deeds).toEqual([10, 11, 21, 22]);
    expect(orderLine(ash!, world)).toBe('Knightly order · Iron Folk · 2 knights');
  });

  it('says which spells an academy keeps and which it lost, and when', () => {
    expect(hall!.lore).toEqual([
      { id: 'spark', name: 'Spark', learnedBy: 0 },
      { id: 'blaze', name: 'Blaze', lost: 50, lostEvent: 31, learnedBy: 0 },
    ]);
    expect(hall!.serving).toBe(0);
    expect(hall!.heads[0]).toMatchObject({ to: 48, diedInOffice: true });
    expect(orderLine(hall!, world)).toBe('Academy of fire · ended');
  });

  it('names the most senior tie a person has', () => {
    const orders = allOrders(world, content);
    expect(personOrder(orders, 1)?.title).toBe('Founder of');
    expect(personOrder(orders, 2)?.title).toBe('Master of');
    expect(personOrder(orders, 3)).toMatchObject({ title: 'Knight of', order: { id: 1 } });
    expect(personOrder(orders, 9)).toBeUndefined();
  });
});
