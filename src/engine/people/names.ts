// Culture name generation (M2.1). Pure: callers pass a named RNG stream.

import type { CultureNames } from '../core/content-types';
import type { RngStream } from '../core/rng';

/** Chance a place name gets a middle syllable. */
const MIDDLE_CHANCE = 0.35;

function tidy(text: string): string {
  // Collapse a tripled letter to a double ("Kallla" -> "Kalla"), then capitalise.
  const collapsed = text.replace(/(.)\1\1+/g, '$1$1');
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
}

/** A person's given name: a start plus an end ("Cad" + "oc"). */
export function cultureGivenName(names: CultureNames, rng: RngStream): string {
  return tidy(rng.pick(names.givenStarts) + rng.pick(names.givenEnds));
}

/** A place name: a start, sometimes a middle, and an end. */
export function culturePlaceName(names: CultureNames, rng: RngStream): string {
  const start = rng.pick(names.placeStarts);
  const middle = rng.chance(MIDDLE_CHANCE) ? rng.pick(names.placeMiddles) : '';
  return tidy(start + middle + rng.pick(names.placeEnds));
}
