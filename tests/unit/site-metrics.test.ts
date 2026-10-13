import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, LIFE_EVENTS, WORK_EVENTS } from '../../src/content';
import { embark, stepSite } from '../../src/engine';
import { domainMap, siteMetrics } from '../../scripts/site-metrics.mjs';
import { biggest, copy } from './helpers/site-fixture';

describe('drama --site metrics', () => {
  it('counts add up after 20 days at the biggest site', () => {
    const world = copy();
    const active = embark(world, DEFAULT_CONTENT, biggest(world).id);
    const startFollowed = active.residents.length;
    const first = world.events.length;
    for (let i = 0; i < 20; i += 1) stepSite(world, DEFAULT_CONTENT);
    const events = world.events.slice(first);
    const domains = domainMap({ life: LIFE_EVENTS, work: WORK_EVENTS });
    const months = 20 / 28;
    const m = siteMetrics(world, active, events, { months, domains, startFollowed });
    for (const n of [m.births, m.marriages, m.deaths, m.tantrums, m.despair, m.wandered, m.thefts])
      expect(Number.isInteger(n) && n >= 0).toBe(true);
    expect(m.totalEvents).toBe(events.length);
    const perMonth = Object.values(m.perMonth).reduce((a, b) => a + b, 0);
    expect(perMonth).toBeCloseTo(events.length / months, 6);
    expect(Object.values(m.deathsByCause).reduce((a, b) => a + b, 0)).toBe(m.deaths);
    expect(m.chain.length).toBeGreaterThanOrEqual(events.length ? 1 : 0);
    expect(m.followedStart).toBe(startFollowed);
  });
});
