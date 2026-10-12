import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  createWorld,
  emptyGoods,
  popBands,
  runHistory,
  siteCapacity,
  validateContent,
  type ContentBundle,
  type HistoryRules,
  type RaceDef,
  type Site,
  type WorldState,
} from '../../src/engine';
import { createRun } from '../../src/engine/history/state';
import { pruneEvents, runYearSummary } from '../../src/engine/history/importance';

const GRASS = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'grassland');
const RACES = new Map(DEFAULT_CONTENT.races.map((r) => [r.id, r]));
const WIDTH = 100;

interface SiteSpec {
  x: number;
  pop: number;
  capacity: number;
}

interface StripOptions {
  raceId?: string;
  /** Aura (0-100) by column. */
  aura?: (x: number) => number;
}

/** A flat grassland strip, 100 x 9, one civ of `raceId` (default human), sites on row 4. */
function strip(specs: SiteSpec[], years: number, options: StripOptions = {}): WorldState {
  const height = 9;
  const size = WIDTH * height;
  const raceId = options.raceId ?? 'human';
  const race = RACES.get(raceId)!;
  const culture = DEFAULT_CONTENT.cultures.find((c) => c.raceId === raceId)!;
  const world = createWorld('FIX', { historyYears: years });
  const aura = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) aura[i] = options.aura?.(i % WIDTH) ?? 0;
  world.cells = {
    width: WIDTH,
    height,
    elevation: new Int16Array(size).fill(100),
    water: new Uint8Array(size),
    floodplain: new Uint8Array(size),
    biome: new Uint8Array(size).fill(GRASS),
    fertility: new Uint8Array(size).fill(50),
    wildness: new Uint8Array(size),
    aura,
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
  } as unknown as WorldState['cells'];
  specs.forEach((spec, n) => {
    const site: Site = {
      id: n + 1,
      name: `Site${n + 1}`,
      kind: 'village',
      cell: 4 * WIDTH + spec.x,
      civId: 1,
      founded: 0,
      pop: popBands(spec.pop, race, culture, DEFAULT_CONTENT.settlement),
      goods: { ...emptyGoods(), food: spec.pop / 2 },
      wealth: 0,
      capacity: spec.capacity,
      features: [],
      peakPop: spec.pop,
    };
    world.sites.set(site.id, site);
  });
  world.nextId.site = specs.length + 1;
  world.civs.set(1, {
    id: 1,
    name: 'Folk',
    raceId,
    cultureId: culture.id,
    capital: 1,
    founded: 0,
    grievances: new Map(),
  });
  world.nextId.civ = 2;
  return world;
}

const withHistory = (history: HistoryRules, rest: Partial<ContentBundle> = {}): ContentBundle => ({
  ...DEFAULT_CONTENT,
  history,
  ...rest,
});
const eventsOf = (world: WorldState, type: string) => world.events.filter((e) => e.type === type);

describe('climate epochs', () => {
  it('raise famine frequency inside them, and the famines cite the epoch', () => {
    // No risk anywhere, so only an epoch can bring a bad year.
    const base: HistoryRules = {
      ...DEFAULT_CONTENT.history,
      harvestVariance: 0,
      droughtYield: 0.2,
      expandChance: 0,
    };
    const calm = { ...base, climate: { ...base.climate, startChance: 0 } };
    const dry = {
      ...base,
      // One dry epoch at a time, big enough to cover the whole strip.
      climate: { ...base.climate, startChance: 1, maxActive: 1, radius: [500, 500], dryShare: 1 },
    } as HistoryRules;
    const specs = [
      { x: 10, pop: 100, capacity: 400 },
      { x: 70, pop: 100, capacity: 400 },
    ];
    const quiet = strip(specs, 60);
    runHistory(quiet, withHistory(calm));
    const stormy = strip(specs, 60);
    runHistory(stormy, withHistory(dry));
    expect(eventsOf(quiet, 'famine')).toHaveLength(0);
    expect(eventsOf(quiet, 'dry_years_began')).toHaveLength(0);
    const famines = eventsOf(stormy, 'famine');
    expect(famines.length).toBeGreaterThan(0);
    const began = new Set(eventsOf(stormy, 'dry_years_began').map((e) => e.id));
    expect(famines.every((f) => f.causes.some((c) => began.has(c)))).toBe(true);
    for (const ended of eventsOf(stormy, 'dry_years_ended')) {
      expect(began.has(ended.causes[0]!)).toBe(true);
    }
  });
});

describe('new sites', () => {
  it('keep their spacing and each civ waits out the founding cooldown', () => {
    const rules: HistoryRules = {
      ...DEFAULT_CONTENT.history,
      birthRate: 0.2,
      crowdingBirthCut: 0.3,
      expandChance: 1,
      expandCooldown: 1,
      expandRange: [5, 12],
    };
    const world = strip([{ x: 50, pop: 400, capacity: 500 }], 90);
    runHistory(world, withHistory(rules));
    const sites = [...world.sites.values()];
    const founded = sites.filter((s) => s.founded > 0).map((s) => s.founded);
    expect(founded.length).toBeGreaterThan(1);
    for (const a of sites) {
      for (const b of sites) {
        if (a.id >= b.id) continue;
        const gap = Math.max(
          Math.abs((a.cell % WIDTH) - (b.cell % WIDTH)),
          Math.abs(Math.floor(a.cell / WIDTH) - Math.floor(b.cell / WIDTH)),
        );
        expect(gap).toBeGreaterThanOrEqual(rules.newSiteSpacing);
      }
    }
    founded.sort((a, b) => a - b);
    for (let i = 1; i < founded.length; i += 1) {
      expect(founded[i]! - founded[i - 1]!).toBeGreaterThanOrEqual(rules.civFoundCooldown);
    }
  });
});

describe('race balance by mechanism', () => {
  const tylwyth = RACES.get('tylwyth') as RaceDef;

  it('shrinks a Tylwyth site on low-aura land, in capacity and over the years', () => {
    const world = strip(
      [
        { x: 10, pop: 60, capacity: 0 },
        { x: 80, pop: 60, capacity: 0 },
      ],
      60,
      { raceId: 'tylwyth', aura: (x) => (x < 50 ? 0 : 80) },
    );
    const cells = world.cells!;
    const sites = [...world.sites.values()];
    for (const site of sites) {
      site.capacity = siteCapacity(cells, site.cell, tylwyth, DEFAULT_CONTENT, []);
    }
    const [low, high] = sites;
    expect(low!.capacity).toBeLessThan(high!.capacity);
    const rules: HistoryRules = { ...DEFAULT_CONTENT.history, expandChance: 0, birthRate: 0.2 };
    runHistory(world, withHistory(rules, { diseases: [] }));
    const size = (s: Site) => s.pop.reduce((n, b) => n + b.count, 0);
    expect(size(low!)).toBeLessThan(size(high!));
  });

  it('cuts Dvergar capacity where no ore is in reach', () => {
    const world = strip([{ x: 10, pop: 60, capacity: 0 }], 1, { raceId: 'dvergar' });
    const dvergar = RACES.get('dvergar')!;
    const cell = [...world.sites.values()][0]!.cell;
    const without = siteCapacity(world.cells!, cell, dvergar, DEFAULT_CONTENT, []);
    const withOre = siteCapacity(world.cells!, cell, dvergar, DEFAULT_CONTENT, ['deposit']);
    // Deposit also multiplies food (raceFeature), so the ratio is that bonus over the cut.
    const capacity = DEFAULT_CONTENT.settlement.capacity;
    const ratio = capacity.raceFeature.dvergar!.deposit! / capacity.raceWithout.dvergar!.deposit!;
    expect(withOre / without).toBeCloseTo(ratio, 0);
  });
});

describe('importance and rollups', () => {
  it('keeps a trivial event a kept event cites, and counts the rest in the year summary', () => {
    const importance = { ...DEFAULT_CONTENT.history.importance, novelty: 0, rollupBelow: 4 };
    const content = withHistory({ ...DEFAULT_CONTENT.history, importance });
    const world = strip([{ x: 10, pop: 100, capacity: 400 }], 1);
    const run = createRun(world, content, {} as never, {} as never, new Map());
    run.year = 1;
    const cited = run.emit({ type: 'migration', place: null, data: { count: 3 } });
    const famine = run.emit({ type: 'famine', place: null, causes: [cited.id], data: {} });
    run.emit({ type: 'migration', place: null, data: { count: 4 } });
    runYearSummary(run);
    pruneEvents(run);
    expect(world.events.map((e) => e.type)).toEqual(['migration', 'famine', 'year_summary']);
    expect(world.events[1]!.id).toBe(famine.id);
    const summary = world.events[2]!;
    expect(summary.data.n_migration).toBe(2);
    expect(summary.data.summary).toBe('2 migration');
  });
});

describe('diseases as content', () => {
  it('validate, and a bad disease or race key is reported', () => {
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
    const badDisease = { ...DEFAULT_CONTENT.diseases[0]!, event: 'nonesuch' };
    expect(validateContent({ ...DEFAULT_CONTENT, diseases: [badDisease] }).join('\n')).toMatch(
      /Disease plague: unknown event type "nonesuch"/,
    );
    const settlement = {
      ...DEFAULT_CONTENT.settlement,
      capacity: {
        ...DEFAULT_CONTENT.settlement.capacity,
        raceAura: { elves: { ref: 1, min: 0, max: 1 } },
      },
    };
    expect(validateContent({ ...DEFAULT_CONTENT, settlement }).join('\n')).toMatch(
      /raceAura: unknown race "elves"/,
    );
  });
});
