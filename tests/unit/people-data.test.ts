import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  chipsOf,
  deedsOf,
  familyOf,
  filterRows,
  indexRows,
  lifeRows,
  rivalsOf,
  rolesOf,
  watchOf,
  type PersonFilter,
} from '../../src/app/people/data';
import { DAYS_PER_YEAR, type Person, type SimEvent, type WorldState } from '../../src/engine';

const person = (id: number, over: Partial<Person> = {}): Person =>
  ({
    id,
    name: `P${id}`,
    raceId: 'human',
    cultureId: null,
    sex: 'f',
    born: 10,
    birthplaceCell: 5,
    family: { parents: [], spouses: [], children: [] },
    magic: { power: 0, affinities: {} },
    fame: id,
    deeds: [],
    civId: 1,
    siteId: 1,
    ...over,
  }) as Person;
const event = (id: number, type: string, year: number, importance: number): SimEvent => ({
  id,
  day: year * DAYS_PER_YEAR,
  type,
  importance,
  actors: [1],
  place: null,
  causes: [],
  data: {},
});

const hero = person(1, {
  title: 'hero',
  family: { parents: [2], spouses: [3], children: [4, 99] },
  rivals: [5],
  enemies: [5, 6],
  killerId: 6,
});
const mage = person(2, {
  title: 'mage',
  born: 100,
  died: 160,
  magic: { power: 17, affinities: { air: 14, mind: 7 } },
});
const priest = person(3, { title: 'priest' });
const prophet = person(4, { title: 'prophet', died: 200 });
const ruler = person(5, { title: 'ruler' });
const killer = person(6, { title: 'raider', died: 120 });
const people = [hero, mage, priest, prophet, ruler, killer];
const world = {
  people: new Map(people.map((p) => [p.id, p])),
  civs: new Map([[1, { id: 1, name: 'Council of Perthlys', rulerId: 5 }]]),
  sites: new Map([
    [1, { id: 1, name: 'Perthlys', cell: 5, kind: 'town', pop: [] }],
    [2, { id: 2, name: 'Gwernael', cell: 9, kind: 'village', pop: [], ruinedYear: 120 }],
  ]),
  dynasties: new Map(),
  faiths: new Map([[1, { id: 1, name: 'The Old Way', highPriestId: 3, founderId: 4 }]]),
  events: [event(50, 'legend_risen', 70, 9)].map((e) => ({ ...e, actors: [2] })),
} as unknown as WorldState;

describe('people data', () => {
  it('works out roles, including high priest, prophet and ruler', () => {
    expect(rolesOf(world, mage, DEFAULT_CONTENT).line).toBe(
      'Legendary mage of air · Council of Perthlys',
    );
    expect(rolesOf(world, priest, DEFAULT_CONTENT)).toMatchObject({ priest: true });
    expect(rolesOf(world, priest, DEFAULT_CONTENT).line).toContain('High priest of The Old Way');
    expect(rolesOf(world, prophet, DEFAULT_CONTENT).line).toContain('Prophet of The Old Way');
    const r = rolesOf(world, ruler, DEFAULT_CONTENT);
    expect(r.ruler).toBe(true);
    expect(r.line).toBe('Ruler of the Council of Perthlys');
    expect(rolesOf(world, hero, DEFAULT_CONTENT).hero).toBe(true);
  });

  it('lists notable figures by fame and filters them', () => {
    const rows = indexRows(world, DEFAULT_CONTENT);
    expect(rows.map((r) => r.id)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(rows.find((r) => r.id === 2)!.legend).toBe(true);
    const ids = (chips: PersonFilter[], q = '') =>
      filterRows(rows, new Set(chips), q).map((r) => r.id);
    expect(ids(['legends'])).toEqual([2]);
    expect(ids(['rulers'])).toEqual([5]);
    expect(ids(['mages'])).toEqual([2]);
    expect(ids(['priests'])).toEqual([4, 3]);
    expect(ids(['living'])).toEqual([5, 3, 1]);
    expect(ids(['living', 'priests'])).toEqual([3]);
    expect(ids([], 'p5')).toEqual([5]);
  });

  it('builds life rows with age and year, gold for deeds of a legend', () => {
    const rows = lifeRows(
      world,
      hero,
      [
        event(1, 'year_summary', 20, 9),
        event(2, 'marriage', 25, 5),
        event(3, 'battle', 40, 9),
        event(4, 'famine', 41, 1),
      ],
      (e) => `line ${e.id}`,
    );
    expect(rows.map((r) => [r.age, r.year, r.gold])).toEqual([
      [0, 10, false],
      [15, 25, false],
      [30, 40, true],
    ]);
    expect(rows[0]!.text).toBe('Born at Perthlys.');
    expect(rows[2]!.eventId).toBe(3);
  });

  it('gathers family, rivals and deeds', () => {
    const family = familyOf(world, hero);
    expect(family.parents.map((p) => p.id)).toEqual([2]);
    expect(family.spouses.map((p) => p.id)).toEqual([3]);
    expect(family.children.map((p) => p.id)).toEqual([4]);
    expect(rivalsOf(world, hero).map((r) => [r.person.id, r.why])).toEqual([
      [6, 'killed them'],
      [5, 'rival'],
    ]);
    const groups = deedsOf([
      event(1, 'spell_cast', 30, 5),
      event(2, 'faith_schism', 31, 9),
      event(3, 'famine', 32, 5),
    ]);
    expect(groups.map((g) => [g.id, g.events.length])).toEqual([
      ['spells', 1],
      ['faith', 1],
    ]);
  });

  it('writes the chips and says why Watch is unavailable', () => {
    const chips = chipsOf(world, mage, DEFAULT_CONTENT, 250).map((c) => c.text);
    expect(chips).toContain('Born Year 100 at Perthlys');
    expect(chips).toContain('Died Year 160, aged 60');
    expect(chips).toContain('Fame 2');
    expect(chipsOf(world, hero, DEFAULT_CONTENT, 250).map((c) => c.text)).toContain(
      '240 years old',
    );
    expect(watchOf(world, hero, true)).toMatchObject({ name: 'Perthlys', reason: undefined });
    expect(watchOf(world, hero, false)!.reason).toBe('Watch is available at the present year');
    const away = person(7, { siteId: 2 });
    expect(watchOf(world, away, true)!.reason).toBe('Town fell in Year 120');
  });
});
