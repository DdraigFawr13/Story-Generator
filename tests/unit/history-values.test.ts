import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT as C } from '../../src/content';
import type { Civ } from '../../src/engine/core/types';
import type { HistoryRun } from '../../src/engine/history/state';
import {
  grievanceDecayOf,
  insultFactor,
  slightedValue,
  strangeness,
} from '../../src/engine/history/values';

const run = { content: C, rules: C.history } as unknown as HistoryRun;
const civ = (cultureId: string) => ({ cultureId }) as Civ;
const culture = (id: string) => C.cultures.find((c) => c.id === id)!;

describe('culture values between peoples', () => {
  it('count two cultures of one race as less strange than two races', () => {
    expect(strangeness(run, civ('gwerin'), civ('gwerin'))).toBe(0);
    const humans = insultFactor(run, civ('gwerin'), civ('skarn'));
    const races = insultFactor(run, civ('tylwyth'), civ('tarqai'));
    expect(humans).toBeLessThan(1);
    expect(races).toBeGreaterThan(2 * humans);
  });

  it('let proud peoples keep grudges longer', () => {
    const skarn = grievanceDecayOf(run, civ('skarn'));
    const ushani = grievanceDecayOf(run, civ('ushani'));
    expect(skarn).toBeGreaterThan(C.history.grievanceDecay);
    expect(ushani).toBeLessThan(C.history.grievanceDecay);
  });

  it('slight what each people holds dearest', () => {
    expect(slightedValue(culture('dvergar'))).toBe('kin');
    expect(slightedValue(culture('ushani'))).toBe('order');
    expect(slightedValue(culture('skarn'))).toBe('honour');
    for (const v of Object.values(C.history.cultureValues.slights))
      expect(v.length).toBeGreaterThan(0);
  });
});
