import { describe, expect, it } from 'vitest';
import { canonicalBytes, canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import {
  advanceSettlement,
  reduceSettlementWeek,
  simulateSettlement,
} from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import { shelter } from '../../src/sim/settlement-math';
import { uniform } from '../../src/sim/rng';
import type { SettlementState, WeatherKind } from '../../src/sim/state';

const spring = simulateSettlement('RIVERSIDE', 11).state;
function fixture(tick: number, mutate: (state: SettlementState) => void) {
  const baseline = tick === 11 ? spring : simulateSettlement('RIVERSIDE', tick).state;
  const state = JSON.parse(canonicalJson(baseline)) as SettlementState;
  mutate(state);
  // Deliberate phase-input fixtures are not save files or autonomous runs.
  // The pure reducer validates its complete resulting state and ledger.
  return reduceSettlementWeek(capture(state));
}
function phaseWeather(state: SettlementState, tick: number, kind: WeatherKind) {
  state.tick = tick;
  const startTick = Math.floor((tick - 1) / 12) * 12 + 1;
  state.world.currentWeather = {
    kind,
    multiplier: state.config.economy.weatherMultipliers[kind],
    startTick,
  };
  state.world.currentWeatherEventId = state.allocators.event++;
  const tile = state.world.settlement.center;
  state.events.push({
    id: state.world.currentWeatherEventId,
    tick: startTick,
    phase: 1,
    type: 'weather',
    settlementId: 1,
    entityIds: [1],
    location: { tile, x: tile % 64, y: Math.floor(tile / 64) },
    causes: [],
    facts: {
      ...state.world.currentWeather,
      year: Math.floor((startTick - 1) / 48) + 1,
      season: ['spring', 'summer', 'autumn', 'winter'][Math.floor((startTick - 1) / 12) % 4],
    },
    effects: {},
    importance: 'ordinary',
  });
}
function uniformSequence(state: number, count: number, range: number) {
  const values = [];
  for (let i = 0; i < count; i++) {
    const d = uniform(state, range);
    values.push(d.value);
    state = d.state;
  }
  return { values, state };
}

describe('weekly settlement accounting', () => {
  it('starts an independently versioned world and preserves committed inputs', () => {
    const initial = createSettlement('RIVERSIDE'),
      before = canonicalJson(initial);
    const next = advanceSettlement(initial, 1).state;
    expect(canonicalJson(initial)).toBe(before);
    expect(next.schemaVersion).toBe(2);
    expect(next.lastTick?.labor).toMatchObject({
      workforce: 12,
      foragers: 6,
      repairs: 0,
      builders: 2,
      gatherers: 2,
    });
    expect(next.lastTick?.labor.fields).toHaveLength(2);
    expect(next.lastTick?.production.foraging).toBe(12);
    expect(next.lastTick?.food.consumed).toBe(24);
    expect(next.world.settlement.food).toBe(348);
    expect(next.world.project).toMatchObject({ id: 11, kind: 'hut', progress: 2, escrow: 12 });
    expect(next.rng.terrain).toEqual(initial.rng.terrain);
    expect(next.rng.demographics).toEqual(initial.rng.demographics);
    expect(() => validateSettlementState(next)).not.toThrow();
  });
  it.each([
    ['normal', 444],
    ['drought', 266],
  ] as const)('matches the independent %s spring fixture', (kind, food) => {
    const next = fixture(0, (s) => {
      phaseWeather(s, 11, kind);
      s.world.settlement.population = 24;
      s.world.settlement.households = 6;
      s.world.settlement.food = 100;
      for (const b of s.world.buildings.filter((b) => b.kind === 'field')) {
        const tile = s.world.map.tiles[b.tile]!;
        s.world.map.tiles[b.tile] = [tile[0], 75, tile[2], 0];
        b.tendedWeeks = 11;
      }
    });
    expect(next.lastTick?.production.fields.length).toBe(2);
    const expectedHarvest = kind === 'normal' ? 360 : 180;
    expect(next.lastTick!.production.fields.slice(0, 2).reduce((sum, b) => sum + b.yield, 0)).toBe(
      expectedHarvest,
    );
    expect(next.lastTick!.production.foraging).toBe(12);
    expect(next.lastTick!.closing.food).toBe(food);
  });
  it('matches winter shortfall and health without a mid-season death roll', () => {
    const next = fixture(37, (s) => {
      s.world.settlement.population = 24;
      s.world.settlement.households = 6;
      s.world.settlement.food = 0;
      s.world.settlement.health = 100;
    });
    expect(next.lastTick?.production.foraging).toBe(6);
    expect(next.lastTick?.food).toMatchObject({ consumed: 6, deficit: 18 });
    expect(next.world.settlement.health).toBe(85);
    expect(next.lastTick?.demographics.deathTrials).toBe(0);
    expect(next.events.filter((e) => e.tick === 38).map((e) => e.type)).toContain(
      'shortage_started',
    );
  });
  it('uses opening materials and cannot fund construction with same-week gathering', () => {
    const next = fixture(0, (s) => {
      s.world.settlement.timber = 12;
      s.world.buildings.find((b) => b.kind === 'store')!.durability = 75;
    });
    expect(next.lastTick?.repairs).toHaveLength(1);
    expect(next.world.buildings.find((b) => b.kind === 'store')!.durability).toBe(85);
    expect(
      next.events.filter((e) => e.type === 'construction_started').map((e) => e.facts.kind),
    ).not.toContain('hut');
    expect(next.lastTick?.production.gathered).toBeGreaterThan(0);
    expect(next.lastTick?.timber.newEscrow).toBe(4); // Next affordable need is a field.
  });
  it('charges escrow once and leaves excess reserved construction labor idle', () => {
    const next = fixture(1, (s) => {
      s.world.project!.progress = 3;
    });
    expect(next.lastTick?.construction).toMatchObject({
      before: 3,
      after: 4,
      worked: 1,
      completed: true,
    });
    expect(next.lastTick?.labor.unusedConstruction).toBe(1);
    expect(next.lastTick?.timber).toMatchObject({ newEscrow: 0, completedEscrow: 12 });
    expect(next.world.project).toBeNull();
    expect(next.world.buildings.find((b) => b.id === 11)?.creationEventId).toBe(
      next.events.find((e) => e.type === 'construction_completed')?.id,
    );
    expect(next.world.entities.find((e) => e.id === 11)?.creationEventId).toBe(
      next.events.find((e) => e.type === 'construction_started')?.id,
    );
    expect(shelter(next.world.buildings)).toBe(28);
  });
  it('does not harvest a field completed on the boundary', () => {
    const next = fixture(11, (s) => {
      const entity = s.world.entities.at(-1)!;
      const building = s.world.buildings.find((b) => b.id === entity.id)!;
      s.world.buildings = s.world.buildings.filter((b) => b.id !== building.id);
      const start = s.events.find(
        (e) => e.type === 'construction_started' && e.entityIds.includes(entity.id),
      )!;
      entity.kind = 'field';
      start.facts = { ...start.facts, kind: 'field', cost: 4, requiredLabor: 4 };
      s.world.project = {
        id: entity.id,
        kind: 'field',
        tile: entity.tile,
        progress: 3,
        requiredLabor: 4,
        escrow: 4,
        startEventId: start.id,
      };
    });
    expect(
      next.lastTick!.production.fields.some((b) => b.id === next.lastTick!.construction!.id),
    ).toBe(false);
    expect(
      next.world.buildings.find((b) => b.id === next.lastTick!.construction!.id)?.tendedWeeks,
    ).toBe(0);
    expect(
      next.events.filter((e) => e.tick === 12).find((e) => e.type === 'harvest')!.phase,
    ).toBeLessThan(
      next.events.filter((e) => e.tick === 12).find((e) => e.type === 'construction_completed')!
        .phase,
    );
  });
  it('preserves historical identities and loses food after a store decays', () => {
    const next = fixture(11, (s) => {
      s.world.settlement.timber = 0;
      s.world.settlement.food = 790;
      s.world.buildings.find((b) => b.kind === 'store')!.durability = 1;
    });
    const store = spring.world.buildings.find((b) => b.kind === 'store')!;
    expect(next.world.buildings.some((b) => b.id === store.id)).toBe(false);
    expect(next.world.entities[store.id - 1]?.retired).toBe(true);
    expect(next.lastTick?.closing.capacity).toBe(400);
    expect(next.world.settlement.food).toBe(400);
    expect(next.lastTick?.food.demolitionOverflow).toBeGreaterThan(0);
    const loss = next.events.find(
      (e) => e.tick === 12 && e.type === 'food_overflow' && e.phase === 6,
    )!;
    expect(loss.facts.reason).toBe('demolition');
    expect(loss.effects.food).toEqual({ before: 769, after: 400 });
    expect(loss.causes).toContain(
      next.events.find((e) => e.tick === 12 && e.type === 'building_removed')!.id,
    );
  });
  it('exposes the field-first low-population recovery risk without changing policy', () => {
    const next = fixture(0, (s) => {
      s.world.settlement.population = 4;
      s.world.settlement.households = 1;
      s.world.settlement.food = 0;
      s.world.settlement.timber = 0;
    });
    expect(next.lastTick?.labor).toMatchObject({
      workforce: 2,
      foragers: 0,
      repairs: 0,
      builders: 0,
      gatherers: 0,
    });
    expect(next.lastTick?.food.deficit).toBe(4);
    expect(next.world.settlement.health).toBe(80);
  });
  it('consumes all eligible birth draws even with no shelter room', () => {
    let seedState = 1;
    for (; seedState < 10000; seedState++) {
      const deathDraws = uniformSequence(seedState, 24, 1000);
      if (
        deathDraws.values.every((v) => v >= 5) &&
        uniformSequence(deathDraws.state, 24, 1000).values.some((v) => v < 15)
      )
        break;
    }
    expect(seedState).toBeLessThan(10000);
    const next = fixture(11, (s) => {
      s.world.settlement.population = 24;
      s.world.settlement.households = 6;
      s.world.settlement.food = 300;
      s.world.settlement.health = 100;
      s.world.settlement.timber = 0;
      s.world.buildings.find((b) => b.id === 11)!.durability = 1; // Seventh hut is removed this boundary.
      s.rng.demographics.state = seedState;
    });
    const deaths = uniformSequence(seedState, 24, 1000);
    const survivors = 24 - deaths.values.filter((v) => v < 5).length;
    const births = uniformSequence(deaths.state, survivors, 1000);
    expect(survivors).toBe(24);
    expect(next.lastTick?.demographics.birthSuccesses).toBeGreaterThan(0);
    expect(next.lastTick?.demographics.births).toBe(0);
    expect(next.lastTick?.demographics.birthTrials).toBe(survivors);
    expect(next.rng.demographics.state).toBe(births.state);
    expect(next.lastTick?.demographics.births).toBe(
      Math.min(births.values.filter((v) => v < 15).length, 24 - survivors),
    );
  });
  it('applies overflow before consumption and records shortage recovery', () => {
    const capacity = fixture(0, (s) => {
      s.world.settlement.food = 790;
    });
    expect(capacity.lastTick?.food.overflow).toBe(2);
    expect(capacity.world.settlement.food).toBe(776);
    const recovered = fixture(0, (s) => {
      s.world.settlement.shortage = true;
      s.world.settlement.health = 85;
    });
    expect(recovered.world.settlement.shortage).toBe(false);
    expect(recovered.world.settlement.health).toBe(87);
    expect(recovered.events.map((e) => e.type)).toContain('shortage_recovered');
  });
  it('plans repeated repairs using the updated durability and stable ties', () => {
    const repaired = fixture(0, (s) => {
      s.world.buildings.find((b) => b.kind === 'hut')!.durability = 65;
    });
    expect(repaired.lastTick?.repairs.map((r) => [r.before, r.after])).toEqual([
      [65, 75],
      [75, 85],
    ]);
    expect(repaired.lastTick?.timber.maintenance).toBe(2);
  });
  it('rejects inconsistent restored data without regenerating the world', () => {
    const good = JSON.parse(canonicalJson(spring)) as SettlementState;
    expect(() => validateSettlementState(good)).not.toThrow();
    expect(() => validateSettlementState({ ...good, rulesVersion: 'future' })).toThrow();
    expect(() =>
      validateSettlementState({ ...good, config: { ...good.config, workRadius: 9 } }),
    ).toThrow();
    const bad = JSON.parse(canonicalJson(good)) as SettlementState;
    bad.world.settlement.food++;
    expect(() => validateSettlementState(bad)).toThrow('closing');
    const invalid = JSON.parse(canonicalJson(good)) as SettlementState;
    invalid.events.at(-1)!.causes = [invalid.allocators.event];
    expect(() => validateSettlementState(invalid)).toThrow('Causes');
    const missingFacts = JSON.parse(canonicalJson(good)) as SettlementState;
    missingFacts.events.find((e) => e.type === 'weather')!.facts = {};
    expect(() => validateSettlementState(missingFacts)).toThrow('shape');
    const misplaced = JSON.parse(canonicalJson(good)) as SettlementState;
    const index = misplaced.world.map.tiles.findIndex((t) => t[2] === 'water');
    misplaced.world.map.tiles[index] = [0, 0, 'grass', 0];
    expect(() => validateSettlementState(misplaced)).toThrow('river metadata');
  });
  it('records extinction once and preserves unfinished escrow without revival', () => {
    let deathState = 1;
    while (uniform(deathState, 1000).value >= 5) deathState++;
    const extinct = fixture(1, (s) => {
      s.tick = 11;
      s.world.settlement.population = 1;
      s.world.settlement.households = 1;
      s.world.settlement.food = 0;
      s.world.settlement.health = 0;
      s.rng.demographics.state = deathState;
      for (const b of s.world.buildings.filter((b) => b.kind === 'field')) b.tendedWeeks = 0;
    });
    expect(extinct.world.settlement).toMatchObject({
      population: 0,
      households: 0,
      health: 0,
      shortage: false,
      surplus: false,
    });
    expect(extinct.world.project).toMatchObject({ id: 11, progress: 2, escrow: 12 });
    expect(extinct.lastTick?.demographics.birthTrials).toBe(0);
    expect(extinct.events.find((e) => e.type === 'extinction')!.causes).toEqual([
      extinct.events.find((e) => e.tick === 12 && e.type === 'deaths')!.id,
    ]);
    const after = advanceSettlement(capture(extinct), 12).state;
    expect(after.world.settlement.population).toBe(0);
    expect(after.world.project).toEqual(extinct.world.project);
    expect(after.world.buildings.every((b) => b.tendedWeeks === 0)).toBe(true);
    expect(after.events.filter((e) => e.type === 'extinction')).toHaveLength(1);
    expect(after.rng.demographics).toEqual(extinct.rng.demographics);
    expect(after.rng.weather).not.toEqual(extinct.rng.weather);
    expect(after.lastTick?.production.harvest).toBe(0);
  });
  it('rejects a complete over-limit tick without consuming RNG or IDs', () => {
    const initial = createSettlement('RIVERSIDE');
    const candidate = reduceSettlementWeek(initial);
    const limited = advanceSettlement(initial, 1, {
      maxEvents: 50_000,
      maxBytes: canonicalBytes(candidate).byteLength - 1,
    });
    expect(limited).toMatchObject({ advanced: 0, halted: 'payload-limit' });
    expect(canonicalJson(limited.state)).toBe(canonicalJson(initial));
    const eventLimited = advanceSettlement(initial, 1, {
      maxEvents: initial.events.length,
      maxBytes: 16_777_216,
    });
    expect(eventLimited.advanced).toBe(0);
    expect(eventLimited.halted).toBe('event-limit');
  });
});
