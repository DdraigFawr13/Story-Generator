import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  buildLinks,
  checkSites,
  createWorld,
  generateWorld,
  popBands,
  runHistory,
  serializeWorld,
  sitePopulation,
  type HistoryRules,
  type Id,
  type Site,
  type WorldState,
} from '../../src/engine';

const GRASS = DEFAULT_CONTENT.biomes.findIndex((b) => b.id === 'grassland');
const HUMAN = DEFAULT_CONTENT.races.find((r) => r.id === 'human')!;
const GWERIN = DEFAULT_CONTENT.cultures.find((c) => c.id === 'gwerin')!;

/** Plenty of births, so small fixtures and short runs fill up and spill over. */
const LIVELY: HistoryRules = {
  ...DEFAULT_CONTENT.history,
  birthRate: 0.2,
  crowdingBirthCut: 0.3,
  droughtScale: 0.5,
};

interface SiteSpec {
  x: number;
  pop: number;
  capacity: number;
  /** Drought risk (0-100) at the site's cell. */
  drought?: number;
}

/** A flat grassland strip, 100 x 9, with one civ and the given sites on row 4. */
function strip(specs: SiteSpec[], years: number): WorldState {
  const width = 100;
  const height = 9;
  const size = width * height;
  const world = createWorld('FIX', { historyYears: years });
  const drought = new Uint8Array(size);
  const cells = {
    width,
    height,
    elevation: new Int16Array(size).fill(100),
    water: new Uint8Array(size),
    floodplain: new Uint8Array(size),
    biome: new Uint8Array(size).fill(GRASS),
    fertility: new Uint8Array(size).fill(50),
    aura: new Uint8Array(size),
    auraSpots: [],
    resources: new Map(),
    travelCost: new Uint8Array(size).fill(2),
    roads: new Uint8Array(size),
    territory: new Uint16Array(size),
    risk: { drought, storm: new Uint8Array(size), snow: new Uint8Array(size) },
  };
  specs.forEach((spec, n) => {
    const cell = 4 * width + spec.x;
    drought[cell] = spec.drought ?? 0;
    const site: Site = {
      id: n + 1,
      name: `Site${n + 1}`,
      kind: 'village',
      cell,
      civId: 1,
      founded: 0,
      pop: popBands(spec.pop, HUMAN, GWERIN, DEFAULT_CONTENT.settlement),
      stores: spec.pop / 2,
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
    raceId: 'human',
    cultureId: 'gwerin',
    capital: 1,
    founded: 0,
    grievances: new Map(),
  });
  world.nextId.civ = 2;
  world.cells = cells as unknown as WorldState['cells'];
  return world;
}

const withRules = (history: HistoryRules) => ({ ...DEFAULT_CONTENT, history });
const eventsOf = (world: WorldState, type: string) => world.events.filter((e) => e.type === type);

describe('harvest and famine', () => {
  it('starves a site in a drought cell before an equal site with no drought risk', () => {
    // Droughts every year at risk 100 and no yield variance, so the outcome is certain.
    const rules: HistoryRules = {
      ...DEFAULT_CONTENT.history,
      harvestVariance: 0,
      droughtScale: 1,
      expandChance: 0,
    };
    const world = strip(
      [
        { x: 10, pop: 100, capacity: 400, drought: 100 },
        { x: 70, pop: 100, capacity: 400, drought: 0 },
      ],
      50,
    );
    runHistory(world, withRules(rules));
    const famines = eventsOf(world, 'famine');
    expect(famines.some((e) => e.data.site === 'Site1')).toBe(true);
    expect(famines.some((e) => e.data.site === 'Site2')).toBe(false);
    const first = famines.find((e) => e.data.site === 'Site1')!;
    expect(first.causes.length).toBeGreaterThan(0);
    expect(world.events.find((e) => e.id === first.causes[0])?.type).toBe('bad_harvest');
  });
});

describe('plague', () => {
  it('travels only along links', () => {
    // Site1 and Site2 are 10 cells apart (linked); Site3 is 70 cells away (cost 140 > reach).
    const world = strip(
      [
        { x: 10, pop: 300, capacity: 2000 },
        { x: 20, pop: 100, capacity: 2000 },
        // Too small to ever start its own outbreak (plagueMinPop 200).
        { x: 90, pop: 100, capacity: 150 },
      ],
      30,
    );
    const rules: HistoryRules = {
      ...DEFAULT_CONTENT.history,
      plagueChance: 1,
      plagueMinPop: 200,
      plagueSpread: 1,
      expandChance: 0,
    };
    const links = buildLinks(world.cells!, [...world.sites.values()], rules);
    expect(links.get(1)).toEqual([2]);
    expect(links.get(3)).toEqual([]);
    runHistory(world, withRules(rules));
    const hit = new Set(eventsOf(world, 'plague').map((e) => e.data.site));
    expect(hit.has('Site1')).toBe(true);
    expect(hit.has('Site2')).toBe(true);
    expect(hit.has('Site3')).toBe(false);
    const spread = eventsOf(world, 'plague').find((e) => e.data.site === 'Site2')!;
    expect(spread.data.from).toBe('Site1');
    expect(spread.causes.length).toBe(1);
  });
});

describe('abandonment', () => {
  it('ruins a dwindling site, and ends a people with no site left', () => {
    const world = strip(
      [
        { x: 10, pop: 4, capacity: 2000 },
        { x: 20, pop: 3, capacity: 2000 },
      ],
      3,
    );
    runHistory(world, DEFAULT_CONTENT);
    const [first, second] = [...world.sites.values()];
    expect(first!.ruinedYear).toBe(1);
    expect(second!.ruinedYear).toBe(1);
    expect(sitePopulation(first!) + sitePopulation(second!)).toBe(0);
    const civ = world.civs.get(1)!;
    expect(civ.fell).toBe(1);
    const fell = eventsOf(world, 'civ_fell')[0]!;
    expect(world.events.find((e) => e.id === fell.causes[0])?.type).toBe('site_abandoned');
    expect(checkSites(world)).toEqual([]);
  });
});

describe('history of a generated world', () => {
  const generate = (seed: string, rules = DEFAULT_CONTENT.history, years = 50) =>
    generateWorld(seed, { width: 64, height: 64, historyYears: years }, withRules(rules));

  it('is deterministic for a seed and differs between seeds', () => {
    const a = serializeWorld(generate('HIST-A'));
    expect(serializeWorld(generate('HIST-A'))).toBe(a);
    expect(serializeWorld(generate('HIST-B'))).not.toBe(a);
  });

  it('keeps sites sound and gives every migration and new site a cause', () => {
    const world = generate('HIST-A', LIVELY, 60);
    expect(checkSites(world)).toEqual([]);
    for (const site of world.sites.values()) expect(sitePopulation(site)).toBeGreaterThanOrEqual(0);
    const migrations = eventsOf(world, 'migration');
    const founded = world.events.filter((e) => e.type === 'site_founded' && e.day > 0);
    // The lively rules must actually exercise the chains this test guards.
    expect(migrations.length).toBeGreaterThan(0);
    expect(founded.length).toBeGreaterThan(0);
    const ids = new Set<Id>(world.events.map((e) => e.id));
    for (const event of [...eventsOf(world, 'famine'), ...migrations, ...founded]) {
      if (event.type === 'famine' && event.causes.length === 0) continue;
      expect(event.causes.length).toBeGreaterThan(0);
      for (const cause of event.causes) {
        expect(ids.has(cause)).toBe(true);
        expect(cause).toBeLessThan(event.id);
      }
    }
  });

  it('passes the site checks on default rules too', () => {
    expect(checkSites(generate('HIST-C'))).toEqual([]);
  });
});
