import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import { advanceSettlement } from '../../src/sim/settlement';
import { validateSettlementState } from '../../src/sim/settlement-validation';
import type { SettlementState } from '../../src/sim/state';

export async function collectSettlementFixtures() {
  const results = [];
  for (const seed of ['RIVERSIDE', 'TERRAIN_000', 'TERRAIN_098']) {
    const initial = createSettlement(seed),
      whole = advanceSettlement(initial, 137);
    const first = advanceSettlement(initial, 57);
    const restored = JSON.parse(canonicalJson(first.state)) as SettlementState;
    validateSettlementState(restored);
    const resumed = advanceSettlement(capture(restored), 80);
    results.push({
      seed,
      digest: await digestCanonical(whole.state),
      resumedDigest: await digestCanonical(resumed.state),
      eventDigest: await digestCanonical(whole.state.events),
      rng: whole.state.rng,
      allocators: whole.state.allocators,
      population: whole.state.world.settlement.population,
      bytes: canonicalJson(whole.state).length,
    });
  }
  return results;
}
