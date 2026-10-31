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
 * A search list that leads with `first` (the seed known to hold the example; a scan that reaches
 * the end of its list times out), then any `extra` seeds, then the shared list, without repeats.
 */
export function seedsFrom(first: string, extra: readonly string[] = []): string[] {
  return [...new Set([first, ...extra, ...SEEDS])];
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

/** Like `seedsFrom`, for the 128x128 worlds: `first`, then the file's own `extra` seeds, then `SEEDS_128`. */
export function seedsFrom128(first: string, extra: readonly string[] = []): string[] {
  return [...new Set([first, ...extra, ...SEEDS_128])];
}

/** A 64x64, 250-year world (250 is the default history length, so this is also the 64x64 default). */
export function smallWorld(seed: string, content = DEFAULT_CONTENT): WorldState {
  return generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, content);
}

const cache = new Map<string, unknown>();

/** Generate (or reuse) the world for `seed` under a key naming the options it was built with. */
export function cached<T>(key: string, seed: string, make: (seed: string) => T): T {
  const id = `${key}\u0000${seed}`;
  if (!cache.has(id)) cache.set(id, make(seed));
  return cache.get(id) as T;
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
  for (const seed of seeds) {
    const world = cached(key, seed, make);
    if (has(world)) return { seed, world };
  }
  throw new Error(`No world has ${what}; searched ${seeds.join(', ')}. Add seeds to the list.`);
}
