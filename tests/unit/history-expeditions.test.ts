import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { createRun } from '../../src/engine/history/state';
import { claimHoard } from '../../src/engine/history/dragons';
import { createHero, initNotables, killNotable } from '../../src/engine/history/notables';
import { lairAbandoned, runExpeditions, runPlaces } from '../../src/engine/history/places';
import { runItems } from '../../src/engine/history/items';
import {
  createWorld,
  emptyGoods,
  popBands,
  validateContent,
  type Civ,
  type ContentBundle,
  type HistoryRules,
  type Id,
  type PerilousPlace,
  type PlaceRules,
  type Site,
  type WorldState,
} from '../../src/engine';

const GRASS = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'grassland');
const HUMAN = DEFAULT_CONTENT.races.find((r) => r.id === 'human')!;
const GWERIN = DEFAULT_CONTENT.cultures.find((c) => c.id === 'gwerin')!;
const WIDTH = 100;

interface SiteSpec {
  x: number;
  pop: number;
  /** Civ id, default 1. */
  civ?: number;
}

/** A flat grassland strip, 100 x 9, with the given sites on row 4 and a civ for each civ id used. */
function strip(specs: SiteSpec[], years: number): WorldState {
  const height = 9;
  const size = WIDTH * height;
  const world = createWorld('FIX', { historyYears: years });
  const cells = {
    width: WIDTH,
    height,
    elevation: new Int16Array(size).fill(100),
    water: new Uint8Array(size),
    floodplain: new Uint8Array(size),
    biome: new Uint8Array(size).fill(GRASS),
    fertility: new Uint8Array(size).fill(50),
    wildness: new Uint8Array(size),
    aura: new Uint8Array(size),
    auraSpots: [],
    resources: new Map(),
    travelCost: new Uint8Array(size).fill(2),
    roads: new Uint8Array(size),
    territory: new Uint16Array(size),
    risk: {
      drought: new Uint8Array(size),
      storm: new Uint8Array(size),
      snow: new Uint8Array(size),
    },
  };
  specs.forEach((spec, n) => {
    const site: Site = {
      id: n + 1,
      name: `Site${n + 1}`,
      kind: 'village',
      cell: 4 * WIDTH + spec.x,
      civId: spec.civ ?? 1,
      founded: 0,
      pop: popBands(spec.pop, HUMAN, GWERIN, DEFAULT_CONTENT.settlement),
      goods: { ...emptyGoods(), food: spec.pop / 2 },
      wealth: 0,
      capacity: spec.pop * 4,
      features: [],
      peakPop: spec.pop,
    };
    world.sites.set(site.id, site);
  });
  world.nextId.site = specs.length + 1;
  for (const id of new Set(specs.map((s) => s.civ ?? 1))) {
    const capital = [...world.sites.values()].find((s) => s.civId === id)!;
    const civ: Civ = {
      id,
      name: `Folk${id}`,
      raceId: 'human',
      cultureId: 'gwerin',
      capital: capital.id,
      founded: 0,
      grievances: new Map(),
    };
    world.civs.set(id, civ);
  }
  world.nextId.civ = world.civs.size + 1;
  world.cells = cells as unknown as WorldState['cells'];
  return world;
}

const eventsOf = (world: WorldState, type: string) => world.events.filter((e) => e.type === type);
const STILL: HistoryRules = { ...DEFAULT_CONTENT.history, expandChance: 0 };

type Expedition = PlaceRules['expedition'];
/** Content that sends every civ out every year and lets the odds be forced either way. */
function withExpedition(over: Partial<Expedition>, extra: Partial<ContentBundle> = {}) {
  const places = DEFAULT_CONTENT.places;
  return {
    ...DEFAULT_CONTENT,
    history: STILL,
    ...extra,
    places: {
      ...places,
      expedition: { ...places.expedition, chance: 1000, ...over },
    },
  } satisfies ContentBundle;
}
/** A win is certain: success base far above need, capped at 1, and nobody dies. */
const SURE_WIN: Partial<Expedition> = { successBase: 1000, successMax: 1, winLoss: 0 };
/** A loss is certain. */
const SURE_LOSS: Partial<Expedition> = { successBase: 0 };

const runOf = (world: WorldState, content: ContentBundle, year = 5) => {
  const run = createRun(world, content, {} as never, {} as never, new Map());
  run.year = year;
  world.day = year * 365;
  return run;
};

function lyingItem(world: WorldState, id: Id, cell: number) {
  world.items.set(id, {
    id,
    kind: 'artifact',
    name: `the Test Torc ${id}`,
    form: 'torc',
    made: 0,
    makerId: null,
    holder: null,
    lostAt: cell,
    deeds: [],
  });
  world.nextId.item = id + 1;
  return world.items.get(id)!;
}

function placeAt(world: WorldState, cell: number, over: Partial<PerilousPlace> = {}) {
  const place: PerilousPlace = {
    id: world.nextId.place,
    kind: 'ruin',
    name: 'the ruins of Test',
    cell,
    since: 0,
    danger: 1,
    finds: 0,
    deeds: [],
    ...over,
  };
  world.nextId.place += 1;
  world.places.set(place.id, place);
  return place;
}

const AT = 4 * WIDTH + 20;

describe('perilous places', () => {
  it('turns a ruined town into a place, a ruined hold into an old mine, and leaves a hamlet alone', () => {
    const world = strip(
      [
        { x: 10, pop: 200 },
        { x: 30, pop: 200 },
        { x: 50, pop: 200 },
      ],
      1,
    );
    const [town, hold, hamlet] = [...world.sites.values()];
    town!.kind = 'town';
    hold!.kind = 'hold';
    hamlet!.kind = 'hamlet';
    for (const site of world.sites.values()) site.ruinedYear = 3;
    const run = runOf(world, withExpedition({}), 3);
    runPlaces(run);
    runPlaces(run);
    const places = [...world.places.values()];
    expect(places.map((p) => [p.kind, p.siteId, p.since])).toEqual([
      ['ruin', town!.id, 3],
      ['old-mine', hold!.id, 3],
    ]);
    expect(places[0]!.name).toMatch(/Site1/);
    expect(new Set(places.map((p) => p.name)).size).toBe(2);
  });

  it('raises a barrow holding the ruler artifact when a ruler dies and the chance is certain', () => {
    const world = strip([{ x: 40, pop: 300 }], 1);
    const culture = DEFAULT_CONTENT.cultures.map((c) => ({
      ...c,
      values: { ...c.values, faith: 10 },
    }));
    const base = withExpedition({});
    const content = {
      ...base,
      cultures: culture,
      places: { ...base.places, barrow: { ...base.places.barrow, chance: 1, tries: 200 } },
    };
    const run = runOf(world, content);
    initNotables(run);
    const ruler = world.people.get(world.civs.get(1)!.rulerId!)!;
    const torc = lyingItem(world, 1, 0);
    torc.holder = ruler.id;
    delete torc.lostAt;
    const death = killNotable(run, ruler, { cause: 'old-age' });
    const barrow = [...world.places.values()].find((p) => p.kind === 'barrow')!;
    expect(barrow.personId).toBe(ruler.id);
    expect(barrow.civId).toBe(1);
    const raised = eventsOf(world, 'barrow_raised')[0]!;
    expect(raised.causes).toEqual([death.id]);
    expect(raised.data.peril).toBe(barrow.name);
    expect(torc.holder).toBeNull();
    expect(torc.lostAt).toBe(barrow.cell);
    expect(torc.deeds).toContain(raised.id);
    expect(barrow.deeds).toEqual([raised.id]);
  });

  it('lets a great beast hoard what it kills, its slayer claim it, and its lair become a place', () => {
    const world = strip([{ x: 40, pop: 300 }], 1);
    const def = DEFAULT_CONTENT.creatures.find((d) => d.id === 'twrch')!;
    const run = runOf(world, withExpedition({}, { creatures: [def] }));
    initNotables(run);
    const lair = AT;
    world.creatures.set(1, {
      id: 1,
      defId: def.id,
      name: 'Twrch of Test',
      lair,
      born: 0,
      lifespan: 1000,
      deeds: [],
    });
    world.nextId.creature = 2;
    const beast = world.creatures.get(1)!;
    const hero = createHero(run, world.sites.get(1)!, 'Test Hero', 10)!;
    const torc = lyingItem(world, 1, 0);
    torc.holder = hero.id;
    delete torc.lostAt;
    killNotable(run, hero, { cause: 'beast', beast, fought: true });
    expect(torc.holder).toBeNull();
    expect(torc.lostAt).toBe(lair);
    expect(beast.hoard).toEqual([1]);
    expect(eventsOf(world, 'item_hoarded')).toHaveLength(1);
    // Dying of age leaves the lair as a place and says what lies there.
    beast.died = run.year;
    lairAbandoned(run, beast, def);
    const lairPlace = [...world.places.values()].find((p) => p.creatureId === 1)!;
    expect(lairPlace.kind).toBe('lair');
    expect(lairPlace.cell).toBe(lair);
    expect(eventsOf(world, 'lair_abandoned')[0]!.data.items).toBe(torc.name);
    // A living beast's slayer claims the hoard.
    const other = createHero(run, world.sites.get(1)!, 'Other Hero', 10)!;
    torc.holder = null;
    claimHoard(run, beast, other, 0);
    expect(torc.holder).toBe(other.id);
    expect(eventsOf(world, 'dragon_hoard_claimed')).toHaveLength(1);
  });
});

describe('expeditions', () => {
  it('bring home the item lying in a place and credit the leader', () => {
    const world = strip([{ x: 10, pop: 400 }], 1);
    const run = runOf(world, withExpedition(SURE_WIN));
    const leader = createHero(run, world.sites.get(1)!, 'Test Leader', 5)!;
    const fame = leader.fame;
    const place = placeAt(world, AT);
    const torc = lyingItem(world, 1, AT);
    runExpeditions(run);
    const events = eventsOf(world, 'expedition_treasure');
    expect(events).toHaveLength(1);
    expect(events[0]!.actors).toEqual([leader.id]);
    expect(torc.holder).toBe(leader.id);
    expect(torc.lostAt).toBeUndefined();
    expect(torc.deeds).toContain(events[0]!.id);
    expect(leader.deeds).toContain(events[0]!.id);
    expect(leader.fame).toBeGreaterThan(fame);
    expect(place.lastVisit).toBe(5);
    // Nothing is left to find: the place is emptied and the event says so.
    expect(place.emptied).toBe(5);
    expect(String(events[0]!.data.empty)).not.toBe('');
    expect(events[0]!.causes).toEqual([eventsOf(world, 'expedition_set_out')[0]!.id]);
  });

  it('make a new hero of a commoner who brings something home', () => {
    const world = strip([{ x: 10, pop: 400 }], 1);
    const run = runOf(world, withExpedition(SURE_WIN));
    const place = placeAt(world, AT);
    const torc = lyingItem(world, 1, AT);
    const before = world.people.size;
    runExpeditions(run);
    const event = eventsOf(world, 'expedition_treasure')[0]!;
    expect(world.people.size).toBe(before + 1);
    const finder = world.people.get(event.actors[0]!)!;
    expect(finder.title).toBe('hero');
    expect(torc.holder).toBe(finder.id);
    expect(String(event.data.role)).toContain('a commoner of Site1');
    expect(place.emptied).toBe(5);
  });

  it('leave a leader who dies in a place and their items there, out of reach of the finders', () => {
    const world = strip([{ x: 10, pop: 400 }], 1);
    world.cells!.territory[AT] = 1;
    const base = withExpedition(SURE_LOSS);
    const content = {
      ...base,
      notables: { ...base.notables, beastKill: 2 },
      history: { ...STILL, slayAdultsPerDanger: 2 },
    };
    const run = runOf(world, content, 10);
    const leader = createHero(run, world.sites.get(1)!, 'Test Leader', 5)!;
    const torc = lyingItem(world, 1, 0);
    torc.holder = leader.id;
    delete torc.lostAt;
    const place = placeAt(world, AT, { danger: 1000000, finds: 1 });
    runExpeditions(run);
    expect(leader.died).toBe(10);
    expect(leader.causeOfDeath).toBe('peril');
    expect(torc.holder).toBeNull();
    expect(torc.lostAt).toBe(AT);
    const lost = eventsOf(world, 'item_lost')[0]!;
    expect(lost.data.site).toBe(place.name);
    expect(eventsOf(world, 'expedition_failed')).toHaveLength(1);
    // Only an expedition finds it: the yearly search of lost items skips a live place ...
    const searching = runOf(
      world,
      withExpedition({}, { notables: { ...base.notables, itemFindChance: 1 } }),
      20,
    );
    searching.notables.living.add(createHero(searching, world.sites.get(1)!, 'Finder', 5)!.id);
    runItems(searching);
    expect(torc.holder).toBeNull();
    // ... until the place is emptied.
    place.emptied = 20;
    runItems(searching);
    expect(torc.holder).not.toBeNull();
  });

  it('wake the dead of a robbed barrow and anger the barrow civ', () => {
    const world = strip(
      [
        { x: 10, pop: 400 },
        { x: 90, pop: 400, civ: 2 },
      ],
      1,
    );
    const run = runOf(
      world,
      withExpedition({ ...SURE_WIN, wakeDeadChance: 1 }, { creatures: DEFAULT_CONTENT.creatures }),
    );
    createHero(run, world.sites.get(1)!, 'Test Leader', 5);
    const barrow = placeAt(world, AT, {
      kind: 'barrow',
      name: 'the Barrow of Test',
      civId: 2,
    });
    lyingItem(world, 1, AT);
    runExpeditions(run);
    const robbery = eventsOf(world, 'expedition_treasure')[0]!;
    const dead = [...world.creatures.values()].find((c) => c.defId === 'restless-dead')!;
    expect(dead.lair).toBe(barrow.cell);
    const woke = eventsOf(world, 'barrow_woke')[0]!;
    expect(woke.causes).toEqual([robbery.id]);
    expect(dead.deeds[0]).toBe(woke.id);
    expect(world.civs.get(2)!.grievances.get(1)).toBe(
      DEFAULT_CONTENT.places.expedition.barrowGrievance,
    );
    // The barrow civ had no one to send: its own roll found nothing in range.
    expect(eventsOf(world, 'expedition_set_out')).toHaveLength(1);
  });
});

describe('place content', () => {
  it('rejects a place kind whose danger runs high to low', () => {
    const places = DEFAULT_CONTENT.places;
    const kinds = places.kinds.map((k) =>
      k.id === 'ruin' ? { ...k, danger: [10, 3] as [number, number] } : k,
    );
    const problems = validateContent({ ...DEFAULT_CONTENT, places: { ...places, kinds } }).join(
      '\n',
    );
    expect(problems).toMatch(/Place kind ruin: danger needs 1 <= min <= max/);
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });
});
