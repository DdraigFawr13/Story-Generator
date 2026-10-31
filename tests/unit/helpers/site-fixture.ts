import { sitePopulation, type Site, type WorldState } from '../../../src/engine';
import { cached, smallWorld } from './find-world';

/** The small 64x64 worlds the site tests share (with every file that uses key 'd64'); never mutated. */
export const base = () => cached('d64', 'SITE-A', smallWorld);
/** A second 64x64 world, for village-life targets that one village alone would make seed-bound. */
export const baseB = () => cached('d64', 'SITE-B', smallWorld);
/** A third 64x64 world, whose biggest town is human (SITE-B's is a halfling shire since the 2026-10-13 roster). */
export const baseC = () => cached('d64', 'SITE-C', smallWorld);
/** A private copy a test may change. */
export const copy = () => structuredClone(base());
/** The most populous live site (lowest id breaks a tie). */
export const biggest = (world: WorldState): Site =>
  [...world.sites.values()]
    .filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0)
    .sort((a, b) => sitePopulation(b) - sitePopulation(a) || a.id - b.id)[0]!;
