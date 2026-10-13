import { describe, expect, it } from 'vitest';
import { defaultSaveName, freeName, saveLine } from '../../src/app/site-saves';

describe('site save names (M3.12)', () => {
  it('drops the site and day from the list line when the name already says them', () => {
    const day = 40 + 250 * 336;
    const named = { name: defaultSaveName('Svalathorp', day), seed: 'S1', day, savedAt: '' };
    expect(saveLine({ ...named, site: 'Svalathorp' })).toBe('seed S1');
    expect(saveLine({ ...named, name: 'B mid', site: 'Svalathorp' })).toMatch(
      /^Svalathorp · .+ · seed S1$/,
    );
  });

  it('keeps both saves under the first free "(n)" name, within 60 characters', () => {
    expect(freeName('B mid', ['B mid'])).toBe('B mid (2)');
    expect(freeName('B mid', ['B mid', 'B mid (2)'])).toBe('B mid (3)');
    const long = 'x'.repeat(60);
    expect(freeName(long, [long])).toHaveLength(60);
    expect(freeName(long, [long]).endsWith(' (2)')).toBe(true);
  });
});
