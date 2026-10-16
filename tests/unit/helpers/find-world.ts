/**
 * Example-finding for tests that need a world where some event happened (a wedding, a beast slain).
 * Instead of pinning one seed, which every history change breaks, a test names a fixed list of
 * about eight small seeds and takes the first world that has the example. Losing every example
 * still fails, loudly, with the list searched. Worlds are generated once per seed and options
 * key and shared, so tests must not change them (structuredClone first).
 */
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
