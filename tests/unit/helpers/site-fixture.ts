import { DEFAULT_CONTENT } from '../../../src/content';
import { generateWorld, sitePopulation, type Site, type WorldState } from '../../../src/engine';

/** The small 64x64 world the site tests share; built once per test file, never mutated. */
let shared: WorldState | undefined;
export const base = () =>
  (shared ??= generateWorld('SITE-A', { width: 64, height: 64 }, DEFAULT_CONTENT));
/** A private copy a test may change. */
export const copy = () => structuredClone(base());
/** The most populous live site (lowest id breaks a tie). */
export const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;
