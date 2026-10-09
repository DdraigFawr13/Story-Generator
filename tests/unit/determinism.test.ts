import { describe, expect, it } from 'vitest';
import vectors from '../fixtures/rng.json';
import { calendarAtTick, nextTick } from '../../src/sim/clock';
import { deriveStream, validateSeed, type StreamName } from '../../src/sim/seed';
import { nextUint32, uniform } from '../../src/sim/rng';

describe('seed and named-stream golden vectors', () => {
  for (const vector of vectors.streams) {
    it(`${vector.seed}:${vector.name}`, () => {
      expect(deriveStream(vector.seed, vector.name as StreamName)).toBe(vector.initial);
      let state = vector.initial;
      for (const expected of vector.raw) {
        state = nextUint32(state);
        expect(state).toBe(expected);
      }
      state = vector.initial;
      for (const expected of vector.uniform1000) {
        const draw = uniform(state, 1000);
        expect(draw).toEqual(expected);
        state = draw.state;
      }
    });
  }
  it('consumes rejection draws instead of using a 2^32 range', () => {
    expect(uniform(vectors.rejection.initial, vectors.rejection.range)).toEqual(
      vectors.rejection.result,
    );
    expect(nextUint32(vectors.rejection.initial) - 1).toBeGreaterThanOrEqual(
      vectors.rejection.range,
    );
  });
  it.each(['', 'a b', 'é', 'x\n', 'a'.repeat(65)])(
    'rejects an invalid seed without normalization: %j',
    (seed) => {
      expect(() => validateSeed(seed)).toThrow();
    },
  );
  it('preserves case and all 64 valid characters', () => {
    expect(validateSeed('A'.repeat(64))).toHaveLength(64);
    expect(deriveStream('seed', 'terrain')).not.toBe(deriveStream('SEED', 'terrain'));
    expect(
      new Set(
        ['terrain', 'weather', 'demographics'].map((name) =>
          deriveStream('RIVERSIDE', name as StreamName),
        ),
      ).size,
    ).toBe(3);
  });
  it.each([0, -1, 1.5, 0x100000000, NaN])('rejects invalid RNG state %s', (state) => {
    expect(() => nextUint32(state)).toThrow();
  });
  it.each([0, -1, 1.5, 0x100000000])('rejects invalid uniform range %s', (range) => {
    expect(() => uniform(1, range)).toThrow();
  });
});

describe('completed-week clock', () => {
  it('keeps founding before spring', () => {
    expect(calendarAtTick(0)).toEqual({ kind: 'founding' });
  });
  it.each([
    [1, 1, 'spring', 1, false],
    [12, 1, 'spring', 12, true],
    [13, 1, 'summer', 1, false],
    [25, 1, 'autumn', 1, false],
    [37, 1, 'winter', 1, false],
    [48, 1, 'winter', 12, true],
    [49, 2, 'spring', 1, false],
  ] as const)('labels tick %s', (tick, year, season, week, boundary) => {
    expect(calendarAtTick(tick)).toEqual({
      kind: 'week',
      year,
      season,
      week,
      seasonBoundary: boundary,
    });
  });
  it('never wraps the safe-integer clock', () => {
    expect(nextTick(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => nextTick(Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => calendarAtTick(-1)).toThrow();
    expect(() => calendarAtTick(0.5)).toThrow();
  });
});
