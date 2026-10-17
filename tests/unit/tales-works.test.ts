import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/engine';
import { allWorks, workLine, worksAt } from '../../src/app/tales/works';

// A tiny world: one town with a tower and a wall that fell, and a great item made there.
const world = {
  sites: new Map([
    [
      1,
      {
        id: 1,
        cell: 300,
        works: [
          { kind: 'tower', name: 'the Grey Tower', builderId: 7, raised: 40, eventId: 10 },
          {
            kind: 'wall',
            name: 'the Wall of Dun',
            builderId: null,
            raised: 90,
            eventId: 11,
            fell: 150,
          },
        ],
      },
    ],
    [2, { id: 2, cell: 900, name: 'Penn' }],
  ]),
  people: new Map([[7, { id: 7, name: 'Ana', siteId: 2 }]]),
  items: new Map([
    [3, { id: 3, name: 'the Star of Dun', great: true, made: 60, makerId: 7, deeds: [12] }],
    [4, { id: 4, name: 'a plain blade', made: 20, makerId: 7, deeds: [13] }],
  ]),
  events: [
    { id: 12, type: 'great_item_made', place: 300 },
    { id: 13, type: 'artifact_made', place: 300 },
  ],
} as unknown as WorldState;

describe('great works on the Tales map', () => {
  it('lists works and great items oldest first, side by side at one town', () => {
    const works = allWorks(world);
    expect(works.map((w) => [w.kind, w.raised, w.slot])).toEqual([
      ['tower', 40, 0],
      ['item', 60, 1],
      ['wall', 90, 2],
    ]);
    expect(worksAt(works, 70).map((w) => w.kind)).toEqual(['tower', 'item']);
  });

  it('says who raised a work and when it fell', () => {
    const [tower, , wall] = allWorks(world);
    expect(workLine(tower!, 200)).toBe('The Grey Tower, a tower raised in year 40 by Ana of Penn');
    expect(workLine(wall!, 120)).toBe('The Wall of Dun, a wall raised in year 90');
    expect(workLine(wall!, 200)).toBe(
      'The Wall of Dun, a wall raised in year 90; fell in year 150',
    );
  });
});
