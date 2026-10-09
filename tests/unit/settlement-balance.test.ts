import { expect, it } from 'vitest';
import legacy from '../fixtures/settlement-v1.json';
import { digestCanonical } from '../../src/adapters/crypto';
import { decodeSave, prepareSave } from '../../src/adapters/local-save';
import { canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import { LEGACY_SETTLEMENT_VERSION, SETTLEMENT_VERSION } from '../../src/sim/settlement-config';
import {
  advanceSettlement,
  reduceSettlementWeek,
  simulateSettlement,
} from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import type { SettlementState } from '../../src/sim/state';

it.each(legacy.outcomes)(
  'preserves frozen v1 history for $seed at $ticks weeks',
  async (expected) => {
    const state = advanceSettlement(
      createSettlement(expected.seed, LEGACY_SETTLEMENT_VERSION),
      expected.ticks,
    ).state;
    expect(await digestCanonical(state)).toBe(expected.digest);
    expect(state.rng).toEqual(expected.rng);
    expect(state.allocators).toEqual(expected.allocators);
    expect(state.events).toHaveLength(expected.events);
  },
  30_000,
);

it('resumes a v1 envelope on its original rules while new worlds use v2', async () => {
  const first = advanceSettlement(
    createSettlement('RIVERSIDE', LEGACY_SETTLEMENT_VERSION),
    57,
  ).state;
  const envelope = await prepareSave(first, 'legacy', 1);
  const restored = await decodeSave(JSON.parse(JSON.stringify(envelope)));
  const resumed = advanceSettlement(restored.payload, 80).state;
  expect(await digestCanonical(resumed)).toBe(
    legacy.outcomes.find((e) => e.seed === 'RIVERSIDE' && e.ticks === 137)!.digest,
  );
  expect(restored.payload.simulationVersion).toBe(LEGACY_SETTLEMENT_VERSION);
  expect(createSettlement('RIVERSIDE').simulationVersion).toBe(SETTLEMENT_VERSION);
  const mislabeled = JSON.parse(canonicalJson(first)) as SettlementState;
  mislabeled.simulationVersion = mislabeled.rulesVersion = SETTLEMENT_VERSION;
  expect(() => validateSettlementState(mislabeled)).toThrow('unsupported configuration');
});

function depleted(population: number) {
  const state = JSON.parse(canonicalJson(createSettlement('RIVERSIDE'))) as SettlementState;
  Object.assign(state.world.settlement, {
    population,
    households: Math.ceil(population / 4),
    food: 0,
    health: 50,
  });
  // Controlled phase inputs demonstrate recovery capacity; they are not autonomous histories.
  return capture(reduceSettlementWeek(capture(state)));
}

it.each([1, 2])('feeds a depleted %i-resident settlement and lets health recover', (population) => {
  const first = depleted(population);
  expect(first.lastTick!.labor.workforce).toBe(population);
  expect(first.lastTick!.labor.foragers).toBe(1);
  expect(first.lastTick!.production.foraging).toBe(2);
  expect(first.lastTick!.food.deficit).toBe(0);
  expect(first.world.settlement.health).toBe(52);
  const continued = advanceSettlement(first, 95).state;
  expect(continued.world.settlement.population).toBeGreaterThan(0);
  expect(continued.world.settlement.health).toBe(100);
  expect(() => validateSettlementState(continued)).not.toThrow();
});

it('reserves a forager before fields and allows a depleted four-person settlement to recover', () => {
  const first = depleted(4);
  expect(first.lastTick!.labor.fields).toHaveLength(1);
  expect(first.lastTick!.labor.foragers).toBe(1);
  expect(first.lastTick!.food.deficit).toBe(2);
  const continued = advanceSettlement(first, 95).state;
  expect(continued.events.some((e) => e.type === 'shortage_recovered')).toBe(true);
  expect(continued.world.settlement.population).toBeGreaterThan(0);
  expect(continued.world.settlement.health).toBe(100);
});

it('uses stored food in winter and spends no labor tending dormant fields', () => {
  const state = JSON.parse(
    canonicalJson(simulateSettlement('RIVERSIDE', 36).state),
  ) as SettlementState;
  Object.assign(state.world.settlement, { population: 24, households: 6, food: 200, health: 100 });
  const next = reduceSettlementWeek(capture(state));
  expect(next.lastTick!.labor.fields).toHaveLength(0);
  expect(next.lastTick!.production.foraging).toBe(6);
  expect(next.lastTick!.production.harvest).toBe(0);
  expect(next.lastTick!.food.consumed).toBe(24);
  expect(next.world.settlement.food).toBe(182);
  expect(next.world.settlement.health).toBe(100);
  const winterEnd = advanceSettlement(capture(next), 11).state;
  expect(winterEnd.lastTick!.production.harvest).toBe(0);
  expect(
    winterEnd.world.buildings.filter((b) => b.kind === 'field').every((b) => b.tendedWeeks === 0),
  ).toBe(true);
  const evidence = winterEnd.events.find((e) => e.tick === 48 && e.type === 'harvest')!;
  expect(evidence.facts.seasonMultiplier).toBe(0);
  expect(evidence.facts.total).toBe(0);
});

it('rejects a checksummed ledger claiming extra workforce or winter field labor', async () => {
  const snapshot = simulateSettlement('RIVERSIDE', 37).state;
  const invalid = JSON.parse(canonicalJson(snapshot)) as SettlementState;
  invalid.lastTick!.labor.workforce++;
  expect(() => validateSettlementState(invalid)).toThrow('workforce');
  const winter = JSON.parse(canonicalJson(snapshot)) as SettlementState;
  winter.lastTick!.labor.fields.push(winter.world.buildings.find((b) => b.kind === 'field')!.id);
  winter.lastTick!.labor.unassigned--;
  const envelope = await prepareSave(snapshot, 'tamper', 1);
  const damaged = { ...envelope, payload: winter, digest: await digestCanonical(winter) };
  await expect(decodeSave(damaged)).rejects.toThrow('dormant field labor');
});
