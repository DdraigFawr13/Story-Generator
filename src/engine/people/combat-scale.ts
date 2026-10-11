// Soldier-equivalence: the single yardstick that world-tier battles and the
// drama check use to keep R-24 honest. Site-tier combat (Phase 3) resolves
// individual exchanges but must stay consistent with these numbers.

import type { Person } from '../core/types';
import { MAX_SOLDIER_EQUIVALENT, TIERS, tierOfPower } from './tiers';

/**
 * Rough number of average trained soldiers this person is worth in open battle.
 * Magic follows the tier table; mundane prowess tops out around 3.
 */
export function soldierEquivalent(
  person: Pick<Person, 'attributes' | 'magic' | 'skills' | 'health'>,
): number {
  const { strength, agility, endurance } = person.attributes;
  const fighting = person.skills['fighting'] ?? 0; // 0–20
  // Average soldier (attributes ~10, fighting ~8) ≈ 1; a peak warrior ≈ 3.
  const mundane = Math.max(
    0.2,
    ((strength + agility + endurance) / 30) * (0.5 + fighting / 16) * 1.0,
  );
  const tier = TIERS[tierOfPower(person.magic.power)];
  const span = tier.maxPower - tier.minPower;
  const t = span === 0 ? 0 : (person.magic.power - tier.minPower) / span;
  const magical = tier.soldiers[0] + (tier.soldiers[1] - tier.soldiers[0]) * t;
  const healthFactor = Math.max(0.1, person.health / 100);
  return Math.min(MAX_SOLDIER_EQUIVALENT, Math.max(mundane, magical) * healthFactor);
}
