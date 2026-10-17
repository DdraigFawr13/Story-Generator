import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { CARD_W, houseTree, layoutTree } from '../../src/app/people/tree';
import { DAYS_PER_YEAR, type Person, type WorldState } from '../../src/engine';

const person = (id: number, parents: number[], over: Partial<Person> = {}): Person =>
  ({
    id,
    name: `P${id}`,
    raceId: 'human',
    cultureId: null,
    sex: 'f',
    born: 10 * id,
    birthplaceCell: 5,
    family: { parents, spouses: [], children: [] },
    magic: { power: 0, affinities: {} },
    fame: 1,
    deeds: [],
    civId: 1,
    siteId: 1,
    dynastyId: 1,
    title: 'kin',
    ...over,
  }) as Person;

// House 1: founder 1; children 2 and 3; 3 has the ruler 4 and the kin 5, 6, 7; nine heroes 20-28
// bring the shown people past the minimum so the kin stay hidden.
const heroes = Array.from({ length: 9 }, (_, i) => person(20 + i, [1], { title: 'hero', fame: 5 }));
const people = [
  person(1, [], { title: 'founder', fame: 9, died: 90, causeOfDeath: 'battle' }),
  person(2, [1]),
  person(3, [1], { family: { parents: [1], spouses: [30], children: [] } }),
  person(4, [3], { title: 'ruler', fame: 8 }),
  person(5, [3]),
  person(6, [3]),
  person(7, [3]),
  person(30, [], { dynastyId: 2 }),
  ...heroes,
];
const world = {
  people: new Map(people.map((p) => [p.id, p])),
  civs: new Map([[1, { id: 1, name: 'Council of Perthlys', rulerId: 4 }]]),
  sites: new Map(),
  dynasties: new Map([
    [1, { id: 1, name: 'Aldren', founderId: 1, civId: 1, founded: 0 }],
    [2, { id: 2, name: 'Brask', founderId: 30, civId: 1, founded: 0 }],
  ]),
  faiths: new Map(),
  events: [
    {
      id: 1,
      day: 40 * DAYS_PER_YEAR,
      type: 'ruler_succeeded',
      importance: 5,
      actors: [4, 3],
      place: null,
      causes: [],
      data: { civ: 'Council of Perthlys' },
    },
    {
      id: 2,
      day: 41 * DAYS_PER_YEAR,
      type: 'peace_by_marriage',
      importance: 5,
      actors: [3, 30, 4, 4],
      place: null,
      causes: [],
      data: { enemy: 'Realm of Brask' },
    },
  ],
} as unknown as WorldState;

describe('house tree', () => {
  const tree = houseTree(world, 1, DEFAULT_CONTENT)!;
  const row = (id: number) => tree.rows.find((r) => r.id === id)!;

  it('shows the ruler path, hides the kin with a count and marks the line', () => {
    expect(tree.header).toMatchObject({ name: 'Aldren', members: 16, seats: 1 });
    expect(tree.header.role).toBe('Ruling house of the Council of Perthlys');
    expect(tree.header.realms).toEqual(['Council of Perthlys']);
    expect(row(4)).toMatchObject({ shown: true, generation: 2, ruled: { year: 40 } });
    expect(row(3).shown).toBe(true);
    expect(row(5).shown).toBe(false);
    expect(row(3).hidden).toBe(3);
    expect(row(1).death).toBe('fell in battle');
    expect(row(3).spouses[0]).toMatchObject({ house: 'Brask', peace: 'Realm of Brask' });
    expect(row(4).edgeOnLine).toBe(true);
    expect(row(3).edgeOnLine).toBe(true);
    expect(row(21).edgeOnLine).toBe(false);

    const laid = layoutTree(tree.rows, new Set());
    const ids = laid.cards.map((c) => c.row.id);
    expect(ids).toContain(4);
    expect(ids).not.toContain(5);
    for (const a of laid.cards) {
      for (const b of laid.cards) {
        if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(CARD_W);
      }
    }
    const x = (id: number) => laid.cards.find((c) => c.row.id === id)!.x;
    const kids = [...tree.rows.filter((r) => r.parentId === 1 && r.shown).map((r) => x(r.id))];
    expect(x(1)).toBeCloseTo((Math.min(...kids) + Math.max(...kids)) / 2);
    expect(laid.edges.some((e) => e.from === 3 && e.to === 4 && e.line)).toBe(true);
  });

  it('shows the hidden children when a person is expanded', () => {
    const laid = layoutTree(tree.rows, new Set([3]));
    expect(laid.cards.map((c) => c.row.id)).toEqual(expect.arrayContaining([4, 5, 6, 7]));
    const three = laid.cards.find((c) => c.row.id === 3)!;
    expect(three).toMatchObject({ hidden: 0, expanded: true, pill: true });
  });

  it('lists the register for a phone in descent order, indented by generation, within the width', () => {
    const laid = layoutTree(tree.rows, new Set(), { width: 360 });
    const cards = laid.cards;
    expect(cards[0]!.row.id).toBe(1);
    for (let i = 1; i < cards.length; i++) expect(cards[i]!.y).toBeGreaterThan(cards[i - 1]!.y);
    for (const c of cards) expect(c.x + c.w).toBeLessThanOrEqual(360);
    const parentAt = new Map(cards.map((c, i) => [c.row.id, i]));
    for (const [i, c] of cards.entries()) {
      if (c.row.parentId !== null) expect(parentAt.get(c.row.parentId)!).toBeLessThan(i);
    }
    expect(laid.width).toBe(360);
  });
});
