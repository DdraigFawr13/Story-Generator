import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { countWord, embark, stepSite } from '../../src/engine';
import { base, biggest } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;

describe('season recap', () => {
  it('is emitted once at the end of the first season, citing its top events', () => {
    const world = structuredClone(base());
    embark(world, C, biggest(world).id);
    const rules = C.chronicle.recap;
    const firstEvent = world.events.length;
    for (let d = 0; d < 200 && !world.events.some((e) => e.type === rules.seasonType); d += 1) {
      stepSite(world, C);
    }
    const recaps = world.events.filter((e) => e.type === rules.seasonType);
    expect(recaps).toHaveLength(1);
    const recap = recaps[0]!;
    expect(recap.causes.length).toBeLessThanOrEqual(rules.causes);
    for (const id of recap.causes) {
      const cause = world.events.find((e) => e.id === id)!;
      expect(cause.importance).toBeGreaterThanOrEqual(rules.causeAtLeast);
      expect(world.events.indexOf(cause)).toBeGreaterThanOrEqual(firstEvent);
    }
    // The tally counts the period's births: "a birth", a number in words, or nothing at all.
    const births = world.events
      .slice(firstEvent)
      .filter((e) => e.type === 'site_birth' && e.id < recap.id).length;
    const tally = String(recap.data.tally);
    if (births === 0) expect(tally).not.toMatch(/birth/);
    else if (births === 1) expect(tally).toContain('a birth');
    else expect(tally).toContain(`${countWord(births)} births`);
    // The recap opens with what the season was about, naming the site.
    expect(String(recap.data.story)).toMatch(
      /^[A-Z]\w+ at .+(was a season of .+: .+|passed quietly)\.$/,
    );
  });
});

describe('year recap', () => {
  it('speaks for winter too: no season recap on the same evening', () => {
    const world = structuredClone(base());
    embark(world, C, biggest(world).id);
    const rules = C.chronicle.recap;
    for (let d = 0; d < 400 && !world.events.some((e) => e.type === rules.yearType); d += 1) {
      stepSite(world, C);
    }
    const year = world.events.find((e) => e.type === rules.yearType)!;
    expect(year).toBeDefined();
    expect(world.events.some((e) => e.type === rules.seasonType && e.day === year.day)).toBe(false);
    expect(String(year.data.story)).toMatch(/^Year \d+ at /);
  });
});
