import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { embark, stepSite } from '../../src/engine';
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
    // The tally counts the period's births: a number, "one birth", or nothing at all.
    const births = world.events
      .slice(firstEvent)
      .filter((e) => e.type === 'site_birth' && e.id < recap.id).length;
    const tally = String(recap.data.tally);
    if (births === 0) expect(tally).not.toMatch(/birth/);
    else if (births === 1) expect(tally).toContain('one birth');
    else expect(tally).toContain(`${births} births`);
  });
});
