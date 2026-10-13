// The site speed guard, run on its own after the unit tests (`npm test`, vitest.speed.config.ts).

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { embark, stepSite } from '../../src/engine';
import { biggest, copy } from '../unit/helpers/site-fixture';

const C = DEFAULT_CONTENT;

describe('site speed', () => {
  it('runs a year of site life for 150 residents within the speed guard', () => {
    const world = copy();
    const site = biggest(world);
    const content = { ...C, site: { ...C.site, followCap: 150 } };
    const active = embark(world, content, site.id);
    const start = performance.now();
    for (let day = 0; day < 336; day += 1) stepSite(world, content);
    const ms = performance.now() - start;
    console.log(
      `site tick: ${active.residents.length} residents, 336 days in ${ms.toFixed(1)} ms (${(336000 / Math.max(ms, 0.01)).toFixed(0)} days/s)`,
    );
    // The Phase 3 budget is 10 days/s; 2.5 s a year (over 130 days/s) leaves room for slow CI
    // runners and later systems (decided 2026-10-13: one guard, replacing two at 1 s). It runs
    // alone, after the other tests, so their load does not skew it (Morgan, 2026-10-13).
    expect(ms).toBeLessThan(2500);
  });
});
