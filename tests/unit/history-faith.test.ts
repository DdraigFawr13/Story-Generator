import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, FAITHS } from '../../src/content';
import { faithAfterTaken, initFaiths, enmity, runFaith } from '../../src/engine/history/faith';
import { initNotables } from '../../src/engine/history/notables';
import { createRun, grievanceEventsOf } from '../../src/engine/history/state';
import {
  createWorld,
  emptyGoods,
  popBands,
  validateContent,
  type Civ,
  type ContentBundle,
  type Faith,
  type FaithRules,
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

const withFaiths = (faiths: Partial<FaithRules>): ContentBundle => ({
  ...DEFAULT_CONTENT,
  faiths: { ...FAITHS, ...faiths },
});

/** Civ 1 keeps the Wells (abhors war), civ 2 the Hall (holds war sacred), civ 3 the Wells again. */
function fixture(content: ContentBundle) {
  const world = strip(
    [
      { x: 10, pop: 200, civ: 1 },
      { x: 30, pop: 200, civ: 2 },
      { x: 50, pop: 200, civ: 3 },
    ],
    10,
  );
  world.civs.get(2)!.cultureId = 'skarn';
  const run = createRun(world, content, {} as never, {} as never, new Map());
  initNotables(run);
  initFaiths(run);
  return { world, run };
}

describe('faiths', () => {
  it('gives every realm and site a faith and every faith a high priest', () => {
    const { world } = fixture(DEFAULT_CONTENT);
    expect(world.faiths.size).toBe(2);
    for (const civ of world.civs.values()) expect(world.faiths.has(civ.faithId!)).toBe(true);
    for (const site of world.sites.values())
      expect(site.faithId).toBe(world.civs.get(site.civId!)!.faithId);
    for (const faith of world.faiths.values()) {
      const priest = world.people.get(faith.highPriestId!)!;
      expect(priest.title).toBe('priest');
      expect(priest.died).toBeUndefined();
      expect(priest.siteId).toBe(faith.seatSiteId);
    }
  });

  it('clashes the same both ways, and a schism clashes with its parent', () => {
    const faiths = FAITHS.defs.map(
      (d) => ({ sacred: d.sacred, abhors: d.abhors }) as unknown as Faith,
    );
    for (const a of faiths) for (const b of faiths) expect(enmity(a, b)).toBe(enmity(b, a));
    // A prophet who must split the faith: the new faith abhors what the old holds second-most sacred.
    const { world, run } = fixture(
      withFaiths({ prophetChance: 10, prophetActs: { preach: 0, schism: 1, mission: 0 } }),
    );
    run.year = 10;
    runFaith(run);
    const schism = [...world.faiths.values()].find((f) => f.parentId !== undefined)!;
    expect(schism).toBeDefined();
    const parent = world.faiths.get(schism.parentId!)!;
    expect(enmity(schism, parent)).toBeGreaterThan(0);
    expect(schism.name).not.toBe(parent.name);
    expect(
      world.events.some((e) => e.type === 'faith_schism' && e.data.faith === schism.name),
    ).toBe(true);
  });

  it('defiles a holy city taken by another faith and turns the town in a holy war', () => {
    const { world, run } = fixture(withFaiths({ holyConvert: 1 }));
    run.year = 3;
    const [defender, attacker] = [world.civs.get(1)!, world.civs.get(2)!];
    const site = world.sites.get(defender.capital)!;
    const wells = defender.faithId!;
    expect(world.faiths.get(wells)!.seatSiteId).toBe(site.id);
    site.civId = attacker.id;
    const taken = run.emit({
      type: 'site_conquered',
      place: site.cell,
      data: { site: site.name, civ: attacker.name, loser: defender.name },
    });
    const war = { holy: true } as never;
    faithAfterTaken(run, { site, attacker, defender, event: taken, razed: false, war });
    const wrong = world.events.find((e) => e.type === 'holy_city_taken')!;
    expect(wrong.causes).toEqual([taken.id]);
    // The other Wells realm holds it against the conqueror, with the event behind the grievance.
    expect(world.civs.get(3)!.grievances.get(attacker.id)).toBe(FAITHS.desecrationGrievance);
    expect(grievanceEventsOf(run, 3, attacker.id)).toEqual([wrong.id]);
    expect(site.faithId).toBe(attacker.faithId);
    expect(
      world.events.some((e) => e.type === 'site_converted' && e.causes.includes(wrong.id)),
    ).toBe(true);
  });

  it('rejects a schism name two faiths share', () => {
    const defs = FAITHS.defs.map((d) => ({ ...d }));
    defs[1]!.schismNames = [defs[0]!.schismNames[0]!, ...defs[1]!.schismNames.slice(1)];
    const problems = validateContent(withFaiths({ defs })).join('\n');
    expect(problems).toMatch(/schism name "The Deep Wells" is used twice/);
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });
});
