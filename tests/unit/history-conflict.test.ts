import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
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
  grievance: { raid: 3, border: 3, insult: 6, envy: 3 },
  warThreshold: 0.5,
};

const generate = (seed: string, years = 100) =>
  generateWorld(
    seed,
    { width: 64, height: 64, historyYears: years },
    withRules(QUARRELSOME, DEFAULT_CONTENT.creatures),
  );

describe('war', () => {
  it('is never declared without a grievance (raid, clash or insult) among its causes', () => {
    let wars = 0;
    for (const seed of ['WAR-A', 'WAR-B', 'WAR-C', 'WAR-D']) {
      const world = generate(seed);
      const byId = new Map<Id, SimEvent>(world.events.map((e) => [e.id, e]));
      for (const war of eventsOf(world, 'war_declared')) {
        wars += 1;
        expect(war.causes.length).toBeGreaterThan(0);
        for (const id of war.causes) {
          expect(['civ_raid', 'border_clash', 'insult']).toContain(byId.get(id)?.type);
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
      grievance: { raid: 20, border: 20, insult: 20, envy: 20 },
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
  function den(rules: HistoryRules, years: number): WorldState {
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
    runHistory(world, withRules(rules, [DEN]));
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
