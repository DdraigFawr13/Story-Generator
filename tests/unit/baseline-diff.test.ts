import { describe, expect, it } from 'vitest';
import { diffBaseline, formatDiff } from '../../scripts/baseline-diff.mjs';

const base = { S1: { wars: 10, famine: 100 }, S2: { wars: 4, famine: 20 } };

describe('baseline diff', () => {
  it('stays quiet for identical numbers', () => {
    const result = diffBaseline(base, structuredClone(base));
    expect(result.changed).toBe(0);
    expect(formatDiff(result).split('\n').at(-1)).toBe('no change beyond tolerance');
  });

  it('stays quiet within tolerance and reports a number beyond it', () => {
    const now = { S1: { wars: 10.5, famine: 125 }, S2: { wars: 4, famine: 20 } };
    const result = diffBaseline(base, now);
    expect(result.rows).toEqual([{ seed: 'S1', metric: 'famine', base: 100, now: 125, delta: 25 }]);
    const text = formatDiff(result);
    expect(text).toContain('S1 famine 100 -> 125 (+25)');
    expect(text.split('\n').at(-1)).toBe('1 numbers changed beyond tolerance');
  });

  it('honours a custom tolerance', () => {
    const now = { S1: { wars: 10, famine: 125 }, S2: { wars: 4, famine: 20 } };
    expect(diffBaseline(base, now, { rel: 0.5 }).changed).toBe(0);
  });

  it('counts a missing seed or metric as changed', () => {
    const noSeed = diffBaseline(base, { S1: base.S1 });
    expect(noSeed.changed).toBe(2);
    expect(noSeed.rows.every((r) => r.seed === 'S2' && r.now === undefined)).toBe(true);
    const noMetric = diffBaseline(base, { S1: { wars: 10 }, S2: base.S2 });
    expect(noMetric.rows).toEqual([
      { seed: 'S1', metric: 'famine', base: 100, now: undefined, delta: undefined },
    ]);
  });
});
