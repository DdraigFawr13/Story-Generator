import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { createRun } from '../../src/engine/history/state';
import { claimHoard } from '../../src/engine/history/dragons';
import { fightHunt } from '../../src/engine/history/beasts';
import { createHero, initNotables, killNotable } from '../../src/engine/history/notables';
import {
  createWorld,
  emptyGoods,
  generateWorld,
  popBands,
  runHistory,
  serializeWorld,
  validateContent,
  type Civ,
  type ContentBundle,
  type CreatureDef,
  type HistoryRules,
  type Id,
  type SimEvent,
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

const withRules = (history: HistoryRules, creatures: CreatureDef[] = []): ContentBundle => ({
  ...DEFAULT_CONTENT,
  history,
  creatures,
});
const eventsOf = (world: WorldState, type: string) => world.events.filter((e) => e.type === type);
/** No new sites, so fixtures keep the sites they start with. */
const STILL: HistoryRules = { ...DEFAULT_CONTENT.history, expandChance: 0 };

/** Quarrelsome rules, so short generated worlds see raids, clashes and wars. */
const QUARRELSOME: HistoryRules = {
  ...DEFAULT_CONTENT.history,
  birthRate: 0.2,
  crowdingBirthCut: 0.3,
  raidWarValue: 0,
  civRaidChance: 1,
  borderCells: 1,
  borderClashChance: 1,
  insultChance: 1,
  grievance: { raid: 3, border: 3, insult: 6, envy: 3, vengeance: 3 },
  warThreshold: 0.5,
};

const generate = (seed: string, years = 100) =>
  generateWorld(
    seed,
    { width: 64, height: 64, historyYears: years },
    withRules(QUARRELSOME, DEFAULT_CONTENT.creatures),
  );

describe('war', () => {
  it('is never declared without a grievance among its causes', () => {
    // Every event that adds a grievance: raids (famine and plunder), clashes, insults (and envy), oaths, break-aways, allies, heresies, preached wars and wrongs to holy places.
    const GRIEVANCES = [
      'civ_raid',
      'plunder_raid',
      'vengeance_raid',
      'border_clash',
      'insult',
      'oath_sworn',
      'city_freed',
      'ally_aided',
      'heresy_denounced',
      'holy_war_preached',
      'temple_desecrated',
      'holy_city_taken',
      // M5.2 lineages: a barrow's treasure carried out wrongs the owning civ (places.ts barrowGrievance), and history now hits it.
      'expedition_treasure',
      // Diplomacy: an oath refused, an ally who came, a betrayal or a vassal's revolt is a wrong, and a betrayal or revolt opens a war at once.
      'call_refused',
      'ally_answered',
      'alliance_betrayed',
      'vassal_revolt',
    ];
    let wars = 0;
    for (const seed of ['WAR-A', 'WAR-B', 'WAR-C', 'WAR-D']) {
      const world = generate(seed);
      // Every battle says where the two hosts set out from; a war's first starts at a site.
      const siteCells = new Set([...world.sites.values()].map((s) => s.cell));
      const seen = new Set<unknown>();
      for (const b of eventsOf(world, 'battle')) {
        expect(typeof b.data.hostFrom).toBe('number');
        expect(typeof b.data.enemyHostFrom).toBe('number');
        if (!seen.has(b.data.war)) expect(siteCells.has(b.data.hostFrom as number)).toBe(true);
        seen.add(b.data.war);
      }
      const byId = new Map<Id, SimEvent>(world.events.map((e) => [e.id, e]));
      for (const war of eventsOf(world, 'war_declared')) {
        wars += 1;
        expect(war.causes.length).toBeGreaterThan(0);
        for (const id of war.causes) {
          expect(GRIEVANCES).toContain(byId.get(id)?.type);
        }
      }
    }
    // The quarrelsome rules must actually start wars, or this guards nothing.
    expect(wars).toBeGreaterThan(0);
  });

  it('never starts between civs with no links, and does between linked ones', () => {
    const rules: HistoryRules = {
      ...STILL,
      insultChance: 1,
      grievance: { raid: 20, border: 20, insult: 20, envy: 20, vengeance: 20 },
      warThreshold: 0.01,
    };
    // 80 cells apart is past the link reach; 10 cells apart is within it.
    const apart = strip(
      [
        { x: 5, pop: 100 },
        { x: 85, pop: 100, civ: 2 },
      ],
      60,
    );
    apart.civs.get(1)!.grievances.set(2, 50);
    apart.civs.get(2)!.grievances.set(1, 50);
    runHistory(apart, withRules(rules));
    expect(eventsOf(apart, 'war_declared')).toEqual([]);
    const near = strip(
      [
        { x: 5, pop: 100 },
        { x: 15, pop: 100, civ: 2 },
      ],
      60,
    );
    runHistory(near, withRules(rules));
    expect(eventsOf(near, 'war_declared').length).toBeGreaterThan(0);
  });
});

describe('ruins', () => {
  it('stay in the world once a site is abandoned', () => {
    const world = strip(
      [
        { x: 10, pop: 4 },
        { x: 20, pop: 100 },
      ],
      30,
    );
    runHistory(world, withRules(STILL));
    const ruin = world.sites.get(1);
    expect(ruin?.ruinedYear).toBe(1);
    expect(eventsOf(world, 'site_abandoned').length).toBe(1);
    expect(world.sites.get(2)?.ruinedYear).toBeUndefined();
  });

  it('keep ruinedYear for every site named by a razing or abandonment', () => {
    let ruined = 0;
    for (const seed of ['RUIN-A', 'RUIN-B', 'RUIN-C']) {
      const world = generate(seed);
      const bySite = new Map([...world.sites.values()].map((s) => [s.cell, s]));
      for (const e of [...eventsOf(world, 'site_razed'), ...eventsOf(world, 'site_abandoned')]) {
        const site = bySite.get(e.place!);
        expect(site?.ruinedYear).toBeDefined();
        ruined += 1;
      }
    }
    expect(ruined).toBeGreaterThan(0);
  });
});

describe('beasts', () => {
  const DEN: CreatureDef = {
    id: 'test-wolf',
    name: 'test wolf',
    tier: 'beast',
    biomes: ['grassland'],
    minWildness: 0,
    danger: 1,
    maxAlive: 1,
    spawnChance: 0,
    lifespan: [100, 100],
    raidChance: 1,
    raidRange: 5,
    names: ['the wolf of {near}'],
  };

  /** Lair at x=14 on row 4: Site1 (x=10) is in range, Site2 (x=60) is not. */
  function den(rules: HistoryRules, years: number, def: CreatureDef = DEN): WorldState {
    const world = strip(
      [
        { x: 10, pop: 200 },
        { x: 60, pop: 200 },
      ],
      years,
    );
    world.creatures.set(1, {
      id: 1,
      defId: DEN.id,
      name: 'the wolf of Site1',
      lair: 4 * WIDTH + 14,
      born: 0,
      lifespan: 100,
      deeds: [],
    });
    world.nextId.creature = 2;
    runHistory(world, withRules(rules, [def]));
    return world;
  }

  it('raid only sites within raidRange', () => {
    const world = den({ ...STILL, slayBase: 0 }, 20);
    const raids = eventsOf(world, 'beast_raid');
    expect(raids.length).toBeGreaterThan(0);
    for (const raid of raids) expect(raid.place).toBe(world.sites.get(1)!.cell);
  });

  it('never raid again once slain', () => {
    const world = den({ ...STILL, slayBase: 1 }, 20);
    expect(eventsOf(world, 'beast_slain').length).toBe(1);
    expect(world.creatures.get(1)?.died).toBeDefined();
    expect(eventsOf(world, 'beast_raid').length).toBe(1);
  });

  it("never give a new beast a dead one's name", () => {
    // Playtest (S3, 1000 years): a second giant near Mariuk took the slain one's name, so its raids
    // read as the dead giant's on the Legends page.
    const world = strip([{ x: 10, pop: 200 }], 1);
    world.creatures.set(1, {
      id: 1,
      defId: DEN.id,
      name: 'the wolf of Site1',
      lair: 4 * WIDTH + 14,
      born: 0,
      lifespan: 100,
      died: 0,
      deeds: [],
    });
    world.nextId.creature = 2;
    runHistory(world, withRules(STILL, [{ ...DEN, spawnChance: 1, raidChance: 0 }]));
    expect(world.creatures.get(2)?.name).toBe('the wolf of Site1 the Second');
  });
});

describe('dragons', () => {
  const DRAIG: CreatureDef = {
    id: 'draig',
    name: 'dragon',
    tier: 'legendary',
    biomes: ['grassland'],
    minWildness: 0,
    danger: 700,
    maxAlive: 1,
    spawnChance: 0,
    lifespan: [100, 100],
    raidChance: 0,
    raidRange: 100,
    roam: 0,
    names: ['unused'],
  };
  const GREEDY = DEFAULT_CONTENT.dragons.tempers.find((t) => t.id === 'greedy')!;

  const withDragons = (
    history: HistoryRules,
    def: Partial<CreatureDef>,
    dragons: Partial<ContentBundle['dragons']> = {},
  ): ContentBundle => ({
    ...withRules(history, [{ ...DRAIG, ...def }]),
    dragons: { ...DEFAULT_CONTENT.dragons, ...dragons },
  });

  /** A living dragon of the given temper already lying at `lair`, with an empty hoard. */
  function lairedDragon(world: WorldState, lair: number, temper = 'greedy') {
    world.creatures.set(1, {
      id: 1,
      defId: 'draig',
      name: 'Test the Greedy',
      lair,
      born: 0,
      lifespan: 1000,
      dragon: {
        temper,
        ageAtWaking: 100,
        lairName: "Test's Hollow",
        hoard: { tribute: 0, plunder: 0, items: [] },
        tributeFrom: [],
      },
      deeds: [],
    });
    world.nextId.creature = 2;
    return world.creatures.get(1)!;
  }

  it('wakes one by firstBy and, where the world holds one, never two at once', () => {
    const world = strip([{ x: 10, pop: 200 }], 80);
    const content = withDragons(
      STILL,
      { lifespan: [10, 10] },
      { firstBy: 5, successorGap: [3, 6], tempers: [GREEDY] },
    );
    runHistory(world, content);
    const dragons = [...world.creatures.values()].filter((c) => c.dragon);
    expect(dragons.length).toBeGreaterThan(2);
    expect(dragons[0]!.born).toBeLessThanOrEqual(5);
    expect(new Set(dragons.map((d) => d.name)).size).toBe(dragons.length);
    for (let n = 1; n < dragons.length; n += 1) {
      // The next one wakes only after the last died, and after the gap.
      expect(dragons[n]!.born - dragons[n - 1]!.died!).toBeGreaterThanOrEqual(3);
    }
    expect(eventsOf(world, 'dragon_woke')).toHaveLength(dragons.length);
  });

  it('holds up to maxAlive at once in a world big enough, their lairs kept apart', () => {
    // 900 cells / 300 = 3 slots; maxAlive 3.
    const world = strip([{ x: 10, pop: 200 }], 40);
    const content = withDragons(
      STILL,
      { raidChance: 0 },
      { firstBy: 5, laterFirstBy: 10, cellsPerDragon: 300, maxAlive: 3, lairsApart: 20 },
    );
    runHistory(world, content);
    const alive = [...world.creatures.values()].filter((c) => c.dragon && c.died === undefined);
    expect(alive).toHaveLength(3);
    for (const a of alive)
      for (const b of alive)
        if (a.id < b.id)
          expect(Math.abs((a.lair % WIDTH) - (b.lair % WIDTH))).toBeGreaterThanOrEqual(20);
  });

  it('takes tribute from a town with no legend instead of raiding it', () => {
    const world = strip([{ x: 10, pop: 200 }], 1);
    const baseline = strip([{ x: 10, pop: 200 }], 1);
    runHistory(baseline, withRules(STILL));
    runHistory(world, withDragons(STILL, { raidChance: 1 }, { firstBy: 1, tempers: [GREEDY] }));
    const dragon = [...world.creatures.values()].find((c) => c.dragon)!;
    expect(dragon.dragon!.hoard.tribute).toBe(1);
    expect(dragon.dragon!.tributeFrom).toEqual([1]);
    expect(eventsOf(world, 'dragon_tribute')).toHaveLength(1);
    expect(eventsOf(world, 'beast_raid')).toHaveLength(0);
    expect(world.sites.get(1)!.goods.food).toBeLessThan(baseline.sites.get(1)!.goods.food * 0.7);
  });

  it('hoards what it kills, and its slayer carries the hoard home', () => {
    const world = strip([{ x: 10, pop: 200 }], 1);
    const content = withDragons(
      {
        ...STILL,
        slayBase: 1,
        slayTierFactor: { ...STILL.slayTierFactor, legendary: 1000 },
      },
      {},
    );
    const run = createRun(world, content, {} as never, {} as never, new Map());
    run.year = 5;
    initNotables(run);
    const dragon = lairedDragon(world, 4 * WIDTH + 30);
    const ruler = world.people.get(world.civs.get(1)!.rulerId!)!;
    world.items.set(1, {
      id: 1,
      kind: 'artifact',
      name: 'the Test Torc',
      form: 'torc',
      made: 0,
      makerId: null,
      holder: ruler.id,
      deeds: [],
    });
    killNotable(run, ruler, { cause: 'beast', beast: dragon, fought: true });
    const item = world.items.get(1)!;
    expect(item.holder).toBeNull();
    expect(item.lostAt).toBe(dragon.lair);
    expect(dragon.dragon!.hoard.items).toEqual([1]);
    expect(eventsOf(world, 'item_hoarded')).toHaveLength(1);

    const site = world.sites.get(1)!;
    const hero = createHero(run, site, 'Test Hero', 700)!;
    fightHunt(run, hero, dragon, DRAIG, site, world.civs.get(1)!);
    expect(dragon.died).toBe(5);
    expect(dragon.slayerId).toBe(hero.id);
    expect(item.holder).toBe(hero.id);
    expect(eventsOf(world, 'dragon_hoard_claimed')).toHaveLength(1);
    const slain = eventsOf(world, 'beast_slain')[0]!;
    expect(slain.importance).toBeGreaterThanOrEqual(7 + DEFAULT_CONTENT.dragons.slainImportance);
    claimHoard(run, dragon, undefined, slain.id);
    expect(eventsOf(world, 'dragon_hoard_claimed')).toHaveLength(1);
  });

  it('keeps new sites out of the shadow of a living dragon', () => {
    const rules: HistoryRules = {
      ...STILL,
      birthRate: 0.2,
      crowdingBirthCut: 0.3,
      expandChance: 1,
      expandCooldown: 1,
      expandRange: [5, 12],
    };
    const lair = 4 * WIDTH + 58;
    const radius = DEFAULT_CONTENT.dragons.noSettleRadius;
    const near = (world: WorldState) =>
      [...world.sites.values()].filter(
        (s) =>
          s.founded > 0 &&
          Math.max(Math.abs((s.cell % WIDTH) - 58), Math.abs(Math.floor(s.cell / WIDTH) - 4)) <=
            radius,
      );
    const free = strip([{ x: 50, pop: 400 }], 90);
    runHistory(free, withRules(rules, []));
    expect(near(free).length).toBeGreaterThan(0);
    const shadowed = strip([{ x: 50, pop: 400 }], 90);
    lairedDragon(shadowed, lair);
    runHistory(shadowed, withDragons(rules, {}));
    expect([...shadowed.sites.values()].filter((s) => s.founded > 0).length).toBeGreaterThan(0);
    expect(near(shadowed)).toEqual([]);
  });
});

describe('trade', () => {
  it('moves a good from surplus to shortage between linked sites only', () => {
    const world = strip(
      [
        { x: 10, pop: 100 },
        { x: 20, pop: 100 },
        { x: 90, pop: 100 },
      ],
      10,
    );
    world.sites.get(1)!.goods.ore = 500;
    // Ore use is low enough that the rich site still has some left by year 10 (the stock is capped).
    const need = { ...STILL.need, ore: 0.05 };
    runHistory(world, withRules({ ...STILL, need, wealthDecay: 0 }));
    const [rich, linked, alone] = [1, 2, 3].map((id) => world.sites.get(id)!);
    expect(linked!.goods.ore).toBeGreaterThan(0);
    expect(rich!.goods.ore).toBeGreaterThan(0);
    expect(alone!.goods.ore).toBe(0);
    expect(rich!.wealth).toBeGreaterThan(0);
    expect(linked!.wealth).toBeGreaterThan(0);
    expect(alone!.wealth).toBe(0);
  });
});

describe('determinism', () => {
  it('gives the same events, creatures and goods for a seed over 50 years', () => {
    const a = generate('DET-A', 50);
    const b = generate('DET-A', 50);
    expect(b.events).toEqual(a.events);
    expect([...b.creatures.values()]).toEqual([...a.creatures.values()]);
    expect([...b.sites.values()].map((s) => s.goods)).toEqual(
      [...a.sites.values()].map((s) => s.goods),
    );
    expect(serializeWorld(b)).toBe(serializeWorld(a));
  });
});

describe('content checks', () => {
  const [creature] = DEFAULT_CONTENT.creatures;
  const [resource] = DEFAULT_CONTENT.resources;
  const check = (patch: Partial<ContentBundle>) =>
    validateContent({ ...DEFAULT_CONTENT, ...patch }).join('\n');

  it('accepts the shipped content', () => {
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });

  it('rejects a creature with danger over 1000 or an unknown biome', () => {
    expect(check({ creatures: [{ ...creature!, danger: 1001 }] })).toMatch(/danger 1001/);
    expect(check({ creatures: [{ ...creature!, biomes: ['no-such-biome'] }] })).toMatch(
      /unknown biome "no-such-biome"/,
    );
  });

  it('rejects a resource with an unknown good', () => {
    const bad = { ...resource!, good: 'mithril' } as unknown as typeof resource;
    expect(check({ resources: [bad!] })).toMatch(/unknown good "mithril"/);
  });
});
