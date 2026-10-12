// Innate aptitude (§5.3, R-26): race baseline + inheritance + birthplace.
// Used by world-tier history (Phase 2) and site promotion (Phase 3) alike.
// No spontaneous talent beyond inheritance variance.

import type { AbilityDef, RaceDef } from '../core/content-types';
import type { RngStream } from '../core/rng';
import { ATTRIBUTE_KEYS, type Attributes, type Magic, type Person } from '../core/types';
import { BIRTH_TIER_IDS, TIERS, tierOfPower, type BirthTierId } from './tiers';

export interface AptitudeInput {
  race: RaceDef;
  parents?: readonly Pick<Person, 'potential' | 'magic'>[];
  /** World-cell aura 0–100 at the birthplace (Phase 1 layer). */
  birthplaceAura?: number;
  /** Birth tiers below this get weight 0, for rolling "a strong-or-better birth" directly. */
  minTier?: BirthTierId | undefined;
}

export interface Aptitude {
  attributes: Attributes;
  potential: Attributes;
  magic: Magic;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Bell-shaped offset in −6..6 from three small uniforms (no pow/exp, §7.2). */
function bell(rng: RngStream): number {
  return rng.between(-2, 2) + rng.between(-2, 2) + rng.between(-2, 2);
}

export function rollAptitude(input: AptitudeInput, rng: RngStream): Aptitude {
  const { race, parents = [] } = input;
  const [min, max] = race.attributeRange;
  const potential = {} as Attributes;
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const parentAverage =
      parents.length > 0
        ? parents.reduce((sum, parent) => sum + parent.potential[key], 0) / parents.length
        : null;
    // Children regress partly toward the race mean.
    const centre =
      parentAverage === null
        ? race.attributeMeans[key]
        : Math.round((race.attributeMeans[key] + parentAverage * 2) / 3);
    const value = clamp(centre + bell(rng), min, max);
    attributes[key] = value;
    potential[key] = Math.min(20, value + rng.between(0, 3));
    // Age scaling (children ~40% of potential, elders declining) belongs to the
    // Phase 3 life-cycle system, not here.
  }
  return { attributes, potential, magic: rollMagic(input, rng) };
}

function rollMagic(input: AptitudeInput, rng: RngStream): Magic {
  const { race, parents = [], birthplaceAura = 0, minTier } = input;
  const floor = minTier === undefined ? 0 : BIRTH_TIER_IDS.indexOf(minTier);
  const parentGifted = parents.some((p) => TIERS[tierOfPower(p.magic.power)].minPower >= 3);
  const entries = BIRTH_TIER_IDS.map((id, index): [BirthTierId, number] => {
    if (index < floor) return [id, 0];
    let weight = race.magicTierWeights[id];
    // Bloodlines pass on real talent: gifted-or-better odds double. High-aura
    // birthplaces nudge every magical tier (§5.4A).
    if (parentGifted && id !== 'none' && id !== 'faint') weight *= 2;
    if (birthplaceAura >= 90 && id !== 'none') weight *= 1.25;
    return [id, weight];
  });
  const tier = TIERS[rng.weighted(entries)];
  if (tier.id === 'none') return { power: 0, affinities: {} };
  const power = rng.between(tier.minPower, tier.maxPower);
  const schools = Object.entries(race.affinityWeights);
  const affinities: Record<string, number> = {};
  if (schools.length > 0) {
    const primary = rng.weighted(schools);
    affinities[primary] = clamp(power + rng.between(-1, 1), 1, 20);
    if (rng.chance(0.3)) {
      const secondary = rng.weighted(schools);
      if (secondary !== primary) affinities[secondary] = Math.max(1, Math.floor(power / 2));
    }
  }
  return { power, affinities };
}

/** R-25 hard gate. Separately, a source (teacher/book/institution) is required to learn. */
export function meetsRequirements(
  person: Pick<Person, 'attributes' | 'magic'>,
  ability: AbilityDef,
): boolean {
  for (const [key, min] of Object.entries(ability.requirements)) {
    if (min === undefined) continue;
    let value: number;
    if (key === 'power') value = person.magic.power;
    else if (key.startsWith('affinity.'))
      value = person.magic.affinities[key.slice('affinity.'.length)] ?? 0;
    else value = person.attributes[key as keyof Attributes];
    if (value < min) return false;
  }
  return true;
}
