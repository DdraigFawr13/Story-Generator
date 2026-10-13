// Culture values between peoples: each culture's 0–10 values (content/cultures.ts) shape how
// its civ quarrels, forgives, marries abroad and fights over a seat. Every number is content
// (`history.cultureValues`).

import { CULTURE_VALUES, type CultureDef, type CultureValue } from '../core/content-types';
import type { Civ } from '../core/types';
import { cultureOf, type HistoryRun } from './state';

/** A civ's value, or 5 (neutral) when it has no culture. */
export function cultureValue(run: HistoryRun, civ: Civ, value: CultureValue): number {
  return cultureOf(run, civ)?.values[value] ?? 5;
}

/** Mean gap between two cultures' values (0 alike, about 2 typical), less for one race. */
export function strangeness(run: HistoryRun, a: Civ, b: Civ): number {
  const [ca, cb] = [cultureOf(run, a), cultureOf(run, b)];
  if (!ca || !cb) return run.rules.cultureValues.typicalStrangeness;
  let gap = 0;
  for (const v of CULTURE_VALUES) gap += Math.abs(ca.values[v] - cb.values[v]);
  gap /= CULTURE_VALUES.length;
  return ca.raceId === cb.raceId ? gap * run.rules.cultureValues.sameRaceStrangeness : gap;
}

/** Insult chance multiplier: unlike peoples offend each other more often. */
export function insultFactor(run: HistoryRun, a: Civ, b: Civ): number {
  return strangeness(run, a, b) / run.rules.cultureValues.typicalStrangeness;
}

/** The value a slighted culture holds dearest among those an envoy can offend. */
export function slightedValue(culture: CultureDef | undefined): CultureValue {
  let best: CultureValue = 'honour';
  if (!culture) return best;
  for (const v of ['faith', 'kin', 'order', 'freedom', 'honour'] as const) {
    if (culture.values[v] > culture.values[best]) best = v;
  }
  return best;
}

/** Yearly grievance decay for a civ: proud peoples remember wrongs longer. */
export function grievanceDecayOf(run: HistoryRun, civ: Civ): number {
  const rules = run.rules;
  const decay =
    rules.grievanceDecay +
    (cultureValue(run, civ, 'honour') - 5) * rules.cultureValues.honourMemory;
  return Math.min(0.995, Math.max(0.5, decay));
}
