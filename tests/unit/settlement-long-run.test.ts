import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import { advanceSettlement, simulateSettlement } from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import type { SettlementState } from '../../src/sim/state';

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
});
