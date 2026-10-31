/**
 * Example-finding for tests that need a world where some event happened (a wedding, a beast slain).
 * Instead of pinning one seed, which every history change breaks, a test names a fixed list of
 * about eight small seeds and takes the first world that has the example. Losing every example
 * still fails, loudly, with the list searched. Worlds are generated once per seed and options
 * key and shared, so tests must not change them (structuredClone first).
 *
 * The key names the world (size and content bundle), never the file: two files that build the same
 * world under the same key and seed share one generation per worker. Conventions: 'd64', 'd96' and
 * 'd128' are default-content 250-year worlds at that size; a custom content bundle gets a key naming
 * it ('frequent64', 'busy64'). Two different bundles must never share a key.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { DEFAULT_CONTENT } from '../../../src/content';
import { generateWorld, type WorldState } from '../../../src/engine';

/**
 * The shared base seed list. Worlds under the same key and seed are generated once per worker and
 * shared by every file, so files that search these seeds reuse each other's worlds.
 */
export const SEEDS = [
  'SITE-A',
  'SITE-B',
  'SITE-C',
  'SITE-D',
  'SITE-E',
  'SITE-F',
  'SITE-G',
  'SITE-H',
] as const;

/**
 * The 64x64 default-content seeds that between them hold every example the d64 searches look for
 * (surveyed 2026-10-31 with `FIND_WORLD_POOL`, below): NOT-1 holds all but two, NOT-B those two.
 * Every d64 search leads with them, so a worker builds at most these two worlds for its searches.
 */
export const COVER_64 = ['NOT-1', 'NOT-B'] as const;

/**
 * A search list: the cover seeds, then `first` and any `extra` seeds (the file's own fallbacks;
 * a scan that reaches the end of its list times out), then the shared list, without repeats.
 */
export function seedsFrom(first: string, extra: readonly string[] = []): string[] {
  return [...new Set([...COVER_64, first, ...extra, ...SEEDS])];
}

/** The shared 128x128 base list (feuds, great beasts, orders), in that order; key 'd128'. */
export const SEEDS_128 = [
  'FD-21',
  'FD-1',
  'FD-2',
  'FD-5',
  'FD-15',
  'FD-3',
  'FD-8',
  'FD-10',
  'GB-1',
  'GB-2',
  'GB-3',
  'GB-4',
  'GB-5',
  'GB-6',
  'GB-7',
  'GB-8',
  'OR-9',
  'OR-1',
  'OR-2',
  'OR-3',
  'OR-4',
  'OR-5',
  'OR-6',
  'OR-7',
  'OR-8',
] as const;

/** The 128x128 cover (surveyed 2026-10-31): FD-2 holds every feud, beast and order example but one, FD-1 that one (the third-generation feud search keeps FD-21, see history-feuds). */
export const COVER_128 = ['FD-2', 'FD-1'] as const;

/** Like `seedsFrom`, for the 128x128 worlds: the cover, `first`, the file's `extra` seeds, then `SEEDS_128`. */
export function seedsFrom128(first: string, extra: readonly string[] = []): string[] {
  return [...new Set([...COVER_128, first, ...extra, ...SEEDS_128])];
}

/** A 64x64, 250-year world (250 is the default history length, so this is also the 64x64 default). */
export function smallWorld(seed: string, content = DEFAULT_CONTENT): WorldState {
  return generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, content);
}

const cache = new Map<string, unknown>();

/** Generate (or reuse) the world for `seed` under a key naming the options it was built with. */
export function cached<T>(key: string, seed: string, make: (seed: string) => T): T {
  const id = `${key}\u0000${seed}`;
  if (!cache.has(id)) {
    const start = performance.now();
    cache.set(id, make(seed));
    log({ type: 'gen', key, seed, ms: Math.round(performance.now() - start) });
  }
  return cache.get(id) as T;
}

// Seed survey, for re-choosing the cover seeds after a history change (`scripts/seed-cover.mjs`):
// FIND_WORLD_LOG names a JSON-lines file that gets one row per generated world and per search;
// FIND_WORLD_POOL names a JSON map of key -> seeds that every search is also tried on. A survey run
// is a measurement, not a check: a search whose `has` keeps state from its last call (a few do)
// can fail its test while surveying. Off unless the variables are set.
const LOG = process.env.FIND_WORLD_LOG;
const POOL: Record<string, string[]> = process.env.FIND_WORLD_POOL
  ? JSON.parse(readFileSync(process.env.FIND_WORLD_POOL, 'utf8'))
  : {};
function log(row: object): void {
  if (!LOG) return;
  const file = (expect.getState().testPath ?? '').replace(/.*tests\/unit\//, '');
  appendFileSync(LOG, `${JSON.stringify({ file, ...row })}\n`);
}

/**
 * The first seed in `seeds` whose world satisfies `has`, with that world. Throws when none does,
 * naming what was looked for, so a history change that loses every example is a visible failure.
 */
export function findWorld<T>(
  what: string,
  key: string,
  seeds: readonly string[],
  make: (seed: string) => T,
  has: (world: T) => boolean,
): { seed: string; world: T } {
  const pool = POOL[key];
  if (pool) {
    for (const seed of new Set([...seeds, ...pool])) {
      let ok = false;
      try {
        ok = has(cached(key, seed, make));
      } catch {
        ok = false;
      }
      log({ type: 'survey', key, what, seed, ok });
    }
  }
  for (const seed of seeds) {
    const world = cached(key, seed, make);
    if (has(world)) {
      log({ type: 'find', key, what, seeds, match: seed });
      return { seed, world };
    }
  }
  log({ type: 'find', key, what, seeds, match: null });
  throw new Error(`No world has ${what}; searched ${seeds.join(', ')}. Add seeds to the list.`);
}
