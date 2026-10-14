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

  it("builds life rows with age and year, gold only for a legend's deeds", () => {
    const events = [
      event(1, 'year_summary', 20, 9),
      event(2, 'marriage', 25, 5),
      event(3, 'battle', 40, 9),
      event(4, 'famine', 41, 1),
      event(5, 'legend_duel', 60, 9),
    ];
    const rows = lifeRows(world, hero, events, (e) => `line ${e.id}`);
    expect(rows.map((r) => [r.age, r.year, r.gold])).toEqual([
      [0, 10, false],
      [15, 25, false],
      [30, 40, false],
      [50, 60, false],
    ]);
    expect(rows[0]!.text).toBe('Born at Perthlys.');
    expect(rows[2]!.eventId).toBe(3);
    const legendRows = lifeRows(world, hero, events, (e) => `line ${e.id}`, { legend: true });
    expect(legendRows.map((r) => r.gold)).toEqual([false, false, false, true]);
  });

  it('keeps only events the person acted in and folds repeated battles', () => {
    const battle = (id: number, year: number, war: number, actors: number[]): SimEvent => ({
      ...event(id, 'battle', year, 8),
      actors,
      data: { war, civ: 'Horde of X', enemy: 'Thanedom of Dunberg', attackerLead: 'P2' },
    });
    const events = [
      battle(10, 205, 3, [9, 8]), // a realm battle she was not in
      battle(11, 210, 4, [1, 8]),
      battle(12, 211, 4, [1, 8]),
      battle(13, 212, 4, [1, 8]),
      battle(14, 214, 5, [1, 8]),
      { ...event(15, 'notable_died', 230, 5), actors: [1] },
    ];
    const rows = lifeRows(world, hero, events, (e) => `line ${e.id}`);
    expect(rows.map((r) => r.text)).toEqual([
      'Born at Perthlys.',
      'Fought in 4 battles against the Horde of X, Years 210\u2013214',
      'line 15',
    ]);
    expect(rows[1]!.members!.map((m) => m.eventId)).toEqual([11, 12, 13, 14]);
    expect(rows[1]!.year).toBe(210);
    expect(rows[1]!.yearEnd).toBe(214);
  });

  it('gathers family, rivals and deeds', () => {
    const family = familyOf(world, hero);
    expect(family.parents.map((p) => p.id)).toEqual([2]);
    expect(family.spouses.map((p) => p.id)).toEqual([3]);
    expect(family.children.map((p) => p.id)).toEqual([4]);
    expect(rivalsOf(world, hero).map((r) => [r.person.id, r.why])).toEqual([
      [6, `slew ${hero.name}`],
      [5, 'rival'],
    ]);
    expect(familyOf(world, hero).siblings).toEqual([]);
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

  it('lists a foe the events show she slew, though no killerId says so', () => {
    const slain = person(20, { title: 'captain', died: 214 });
    const slayer = person(21, { title: 'hero', sex: 'f' });
    const bystander = person(22, { title: 'scholar' });
    const w = {
      ...world,
      people: new Map([
        ...world.people,
        ...[slain, slayer, bystander].map((p) => [p.id, p] as const),
      ]),
    } as unknown as WorldState;
    const died: SimEvent = {
      ...event(70, 'notable_died', 214, 5),
      actors: [20, 21, 22],
      data: { cause: 'in battle, slain by P21' },
    };
    const natural: SimEvent = {
      ...event(71, 'notable_died', 214, 5),
      actors: [22, 21],
      data: { cause: 'in the famine' },
    };
    const duel: SimEvent = {
      ...event(72, 'legend_duel', 150, 7),
      actors: [21, 6],
      data: { outcome: 'and P6 was killed' },
    };
    const mine = [died, natural, duel];
    expect(rivalsOf(w, slayer, mine).map((r) => [r.person.id, r.why])).toEqual([
      [20, `slain by ${slayer.name}`],
      [6, `slain by ${slayer.name}`],
    ]);
    expect(rivalsOf(w, slain, [died]).map((r) => [r.person.id, r.why])).toEqual([
      [21, `slew ${slain.name}`],
    ]);
    expect(rivalsOf(w, bystander, [died, natural])).toEqual([]);
  });

  it('gathers siblings, grandchildren and the house', () => {
    const grand = person(30, { born: 80 });
    const kid = person(31, { born: 50, family: { parents: [40], spouses: [], children: [30] } });
    const sib = person(32, { born: 52, family: { parents: [40], spouses: [], children: [] } });
    const me = person(33, {
      born: 51,
      dynastyId: 9,
      family: { parents: [40], spouses: [], children: [31] },
    });
    const parent = person(40, { family: { parents: [], spouses: [], children: [31, 32, 33] } });
    const all = [grand, kid, sib, me, parent];
    const w = {
      people: new Map(all.map((p) => [p.id, p])),
      dynasties: new Map([[9, { id: 9, name: 'House Grim', founderId: 40, founded: 20 }]]),
    } as unknown as WorldState;
    const family = familyOf(w, me);
    expect(family.siblings.map((p) => p.id)).toEqual([31, 32]);
    expect(family.grandchildren.map((p) => p.id)).toEqual([30]);
    expect(family.line).toMatchObject({ name: 'House Grim', founded: 20, members: 1 });
    expect(family.line!.founder!.id).toBe(40);
  });

  it('searches every word in any order across name, role, realm, race and faith', () => {
    const rows = indexRows(world, DEFAULT_CONTENT);
    const ids = (q: string) => filterRows(rows, new Set(), q).map((r) => r.id);
    expect(ids('Council ruler')).toEqual([5]);
    expect(ids('RULER of  council')).toEqual([5]);
    expect(ids('human')).toEqual(rows.map((r) => r.id));
    expect(ids('human ruler')).toEqual([5]);
    expect(ids('ruler nobody')).toEqual([]);
    expect(ids('  ')).toHaveLength(rows.length);
    expect(ids('(')).toEqual([]);
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
    expect(watchOf(world, away, true)!.fallen).toBe(true);
    expect(watchOf(world, hero, true)!.fallen).toBe(false);
  });
});
