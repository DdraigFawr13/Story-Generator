import { describe, expect, it } from 'vitest';
import {
  RngStream,
  cultureGivenName,
  culturePlaceName,
  validateContent,
  type ContentBundle,
} from '../../src/engine';
import { DEFAULT_CONTENT } from '../../src/content';

const withCultures = (cultures: ContentBundle['cultures']): ContentBundle => ({
  ...DEFAULT_CONTENT,
  cultures,
});
const first = DEFAULT_CONTENT.cultures[0]!;

describe('default cultures', () => {
  it('has six cultures, four of them human', () => {
    expect(DEFAULT_CONTENT.cultures).toHaveLength(6);
    expect(DEFAULT_CONTENT.cultures.filter((c) => c.raceId === 'human')).toHaveLength(4);
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });

  it('rejects an unknown biome', () => {
    const broken = withCultures([{ ...first, preferredBiomes: ['nowhere'] }]);
    expect(validateContent(broken).join('\n')).toMatch(/Culture gwerin: unknown biome "nowhere"/);
  });

  it('rejects an unknown race', () => {
    const broken = withCultures([{ ...first, raceId: 'goblin' }]);
    expect(validateContent(broken).join('\n')).toMatch(/Culture gwerin: unknown race "goblin"/);
  });

  it('rejects a value above 10', () => {
    const broken = withCultures([{ ...first, values: { ...first.values, war: 11 } }]);
    expect(validateContent(broken).join('\n')).toMatch(/Culture gwerin: value "war"/);
  });

  it('rejects a race with no culture', () => {
    const broken = withCultures(DEFAULT_CONTENT.cultures.filter((c) => c.raceId !== 'dvergar'));
    expect(validateContent(broken).join('\n')).toMatch(/Race dvergar has no culture/);
  });
});

describe('culture names', () => {
  it('are deterministic, non-empty and capitalised', () => {
    for (const culture of DEFAULT_CONTENT.cultures) {
      const make = () => {
        const rng = RngStream.detached('NAMES', culture.id);
        return [cultureGivenName(culture.names, rng), culturePlaceName(culture.names, rng)];
      };
      const names = make();
      expect(make()).toEqual(names);
      for (const name of names) expect(name).toMatch(/^\p{Lu}\p{L}/u);
    }
  });
});
