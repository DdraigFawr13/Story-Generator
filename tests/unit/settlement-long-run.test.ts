import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalBytes, canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import { advanceSettlement, simulateSettlement } from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import type { SettlementState } from '../../src/sim/state';

interface SeedOutcome {
  seed: string;
  population: number;
  food: number;
  timber: number;
  health: number;
  buildings: number;
  events: number;
  shortages: number;
  extinctionTick: number | null;
  bytes: number;
  digest: string;
  elapsedMs: number;
}

describe('real settlement continuity and seed battery', () => {
  it('preserves a naturally extinct world and history through 10,000 weeks', () => {
    const result = simulateSettlement('RIVERSIDE', 10000);
    expect(result.advanced).toBe(10000);
    expect(result.halted).toBeNull();
    expect(result.state.world.settlement.population).toBe(0);
    expect(result.state.events.filter((e) => e.type === 'extinction')).toHaveLength(1);
    expect(result.state.events.some((e) => e.type === 'building_removed')).toBe(true);
    expect(() => validateSettlementState(result.state)).not.toThrow();
    const continued = advanceSettlement(result.state, 48).state;
    expect(continued.world.settlement.population).toBe(0);
    expect(continued.rng.demographics).toEqual(result.state.rng.demographics);
  }, 600_000);
  it('matches uninterrupted simulation after a JSON capture and chunked advancement', () => {
    const initial = createSettlement('RIVERSIDE');
    const whole = advanceSettlement(initial, 137);
    const first = advanceSettlement(initial, 57);
    const restored = JSON.parse(canonicalJson(first.state)) as SettlementState;
    validateSettlementState(restored);
    const resumed = advanceSettlement(capture(restored), 80);
    expect(canonicalJson(resumed.state)).toBe(canonicalJson(whole.state));
    let chunked = initial;
    for (const count of [1, 4, 16, 48, 68]) chunked = advanceSettlement(chunked, count).state;
    expect(canonicalJson(chunked)).toBe(canonicalJson(whole.state));
    expect(restored.rng).toEqual(first.state.rng);
  }, 30_000);
  it('advances all 100 fixed terrain seeds to 1,000 ticks with exact admission', async () => {
    const seeds = [
      'RIVERSIDE',
      ...Array.from({ length: 99 }, (_, i) => `TERRAIN_${String(i).padStart(3, '0')}`),
    ];
    const outcomes: SeedOutcome[] = [];
    const started = performance.now();
    for (const [index, seed] of seeds.entries()) {
      const before = performance.now();
      const result = simulateSettlement(seed, 1000);
      expect(result.advanced).toBe(1000);
      expect(result.halted).toBeNull();
      expect(() => validateSettlementState(result.state)).not.toThrow();
      const world = result.state.world;
      outcomes.push({
        seed,
        population: world.settlement.population,
        food: world.settlement.food,
        timber: world.settlement.timber,
        health: world.settlement.health,
        buildings: world.buildings.length,
        events: result.state.events.length,
        shortages: result.state.events.filter((e) => e.type === 'shortage_started').length,
        extinctionTick: result.state.events.find((e) => e.type === 'extinction')?.tick ?? null,
        bytes: canonicalBytes(result.state).byteLength,
        digest: await digestCanonical(result.state),
        elapsedMs: Math.round(performance.now() - before),
      });
      if ((index + 1) % 10 === 0) console.info(`Seed battery: ${index + 1}/100 completed`);
    }
    const report = {
      version: 'p1-settlement-v1',
      seeds: 100,
      ticksPerSeed: 1000,
      elapsedMs: Math.round(performance.now() - started),
      outcomes,
    };
    if (process.env.STORY_GENERATOR_REPORT)
      writeFileSync(process.env.STORY_GENERATOR_REPORT, JSON.stringify(report, null, 2) + '\n');
    const range = (key: 'population' | 'bytes') => [
      Math.min(...outcomes.map((r) => r[key])),
      Math.max(...outcomes.map((r) => r[key])),
    ];
    console.info(
      JSON.stringify({
        seeds: 100,
        ticks: 1000,
        elapsedMs: report.elapsedMs,
        populationRange: range('population'),
        bytesRange: range('bytes'),
        extinctions: outcomes.filter((r) => r.extinctionTick !== null).length,
      }),
    );
    expect(new Set(outcomes.map((r) => r.digest)).size).toBe(100);
  }, 1_800_000);
});
