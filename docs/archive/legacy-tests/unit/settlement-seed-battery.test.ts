import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalBytes } from '../../src/sim/canonical';
import { SETTLEMENT_VERSION } from '../../src/sim/settlement-config';
import { advanceSettlement, simulateSettlement } from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import { batteryPartition } from '../fixtures/seed-battery';

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
  firstWinter: {
    populationBefore: number;
    populationAfter: number;
    foodBefore: number;
    foodAfter: number;
    healthAfter: number;
    cropHarvest: number;
  };
}

describe('complete settlement seed battery', () => {
  it('advances all 100 fixed terrain seeds to 1,000 ticks with exact admission', async () => {
    const shard = batteryPartition(process.env.STORY_GENERATOR_BATTERY_SHARD);
    const seeds = shard.seeds;
    const outcomes: SeedOutcome[] = [];
    const started = performance.now();
    for (const [index, seed] of seeds.entries()) {
      const before = performance.now();
      const autumn = simulateSettlement(seed, 36).state;
      const winter = advanceSettlement(autumn, 12).state;
      const result = advanceSettlement(winter, 952);
      expect(result.advanced).toBe(952);
      expect(result.state.tick).toBe(1000);
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
        firstWinter: {
          populationBefore: autumn.world.settlement.population,
          populationAfter: winter.world.settlement.population,
          foodBefore: autumn.world.settlement.food,
          foodAfter: winter.world.settlement.food,
          healthAfter: winter.world.settlement.health,
          cropHarvest: winter.lastTick!.production.harvest,
        },
      });
      if ((index + 1) % 10 === 0)
        console.info(
          `Seed battery ${shard.index}/${shard.total}: ${index + 1}/${seeds.length} completed`,
        );
    }
    const report = {
      version: SETTLEMENT_VERSION,
      seeds: seeds.length,
      shard: { index: shard.index, total: shard.total },
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
        seeds: seeds.length,
        ticks: 1000,
        elapsedMs: report.elapsedMs,
        populationRange: range('population'),
        bytesRange: range('bytes'),
        extinctions: outcomes.filter((r) => r.extinctionTick !== null).length,
      }),
    );
    expect(new Set(outcomes.map((r) => r.digest)).size).toBe(seeds.length);
  }, 1_800_000);
});
