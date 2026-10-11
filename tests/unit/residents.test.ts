import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import {
  createFounderRoster,
  residentAgeWeeks,
  residentLifeStage,
  validateFounderRoster,
} from '../../src/sim/residents';
import { deriveResidentStream } from '../../src/sim/seed';
import { createSettlement } from '../../src/sim/settlement-initial';
import { advanceSettlement } from '../../src/sim/settlement';
import residentVectors from '../fixtures/residents.json';

describe('versioned resident foundations', () => {
  it.each(residentVectors)('matches the independent Python identity vector for $seed', (vector) => {
    const roster = createFounderRoster(createSettlement(vector.seed));
    expect(deriveResidentStream(vector.seed)).toBe(vector.initialRng);
    expect(roster.rng.state).toBe(vector.finalRng);
    expect(roster.households.map((household) => household.name)).toEqual(vector.householdNames);
    expect(
      roster.residents.map(({ givenName, householdName, ageWeeksAtFounding, traits }) => ({
        givenName,
        householdName,
        ageWeeksAtFounding,
        traits,
      })),
    ).toEqual(vector.residents);
  });
  it('allocates household and resident identities without changing P1 state or RNG', () => {
    const founding = createSettlement('RIVERSIDE');
    const before = canonicalJson(founding);
    const roster = createFounderRoster(founding);
    expect(canonicalJson(founding)).toBe(before);
    expect(roster.households.map((household) => household.id)).toEqual([11, 12, 13, 14, 15, 16]);
    expect(roster.residents.map((resident) => resident.id)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 17),
    );
    expect(roster.nextEntityId).toBe(41);
    expect(roster.foundingEventId).toBe(1);
    expect(Object.isFrozen(roster)).toBe(true);
    expect(() => {
      (roster.residents[0]!.parentIds as number[]).push(123);
    }).toThrow();
    expect(Object.isFrozen(roster.residents[0]!.traits)).toBe(true);
    expect(Object.isFrozen(roster.config.givenNames)).toBe(true);
    expect(() => validateFounderRoster(JSON.parse(canonicalJson(roster)), founding)).not.toThrow();
    expect(capture(JSON.parse(canonicalJson(roster)))).toEqual(roster);
    expect(createFounderRoster(createSettlement('RIVERSIDE', 'p1-settlement-v1'))).toEqual(roster);
  });

  it('derives age and stage on exact weekly boundaries without mutations or unsafe arithmetic', () => {
    const resident = {
      ...createFounderRoster(createSettlement('RIVERSIDE')).residents[0]!,
      ageWeeksAtFounding: 0,
    };
    const before = canonicalJson(resident);
    expect(residentAgeWeeks(resident, 47)).toBe(47);
    expect(residentLifeStage(resident, 18 * 48 - 1)).toBe('child');
    expect(residentLifeStage(resident, 18 * 48)).toBe('adult');
    expect(residentLifeStage(resident, 60 * 48 - 1)).toBe('adult');
    expect(residentLifeStage(resident, 60 * 48)).toBe('senior');
    expect(canonicalJson(resident)).toBe(before);
    for (const tick of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(() => residentAgeWeeks(resident, tick)).toThrow('integer');
    expect(() =>
      residentAgeWeeks({ ...resident, ageWeeksAtFounding: 1 }, Number.MAX_SAFE_INTEGER),
    ).toThrow('integer');
  });

  it('rejects unsupported, transplanted and altered founding components without admitting running worlds', () => {
    const founding = createSettlement('RIVERSIDE');
    const roster = createFounderRoster(founding);
    for (const changed of [
      { ...roster, version: 'unsupported' },
      { ...roster, nextEntityId: 40 },
      { ...roster, rng: { ...roster.rng, state: 1 } },
      { ...roster, residents: roster.residents.slice(1) },
      { ...roster, extra: 'unknown field' },
      { ...roster, households: [...roster.households].reverse() },
    ])
      expect(() => validateFounderRoster(changed, founding)).toThrow('roster');
    expect(() => validateFounderRoster(roster, createSettlement('OTHER_SEED'))).toThrow('roster');
    expect(() => createFounderRoster(advanceSettlement(founding, 1).state)).toThrow('founding');
    expect(() =>
      createFounderRoster({
        ...founding,
        world: { ...founding.world, settlement: { ...founding.world.settlement, health: 50 } },
      }),
    ).toThrow('founding');
    expect(() => deriveResidentStream('bad seed')).toThrow('seed');
  });
});
