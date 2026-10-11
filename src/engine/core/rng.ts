// Named deterministic RNG streams (R-03). A stream's starting state is derived
// from (seed, name), so adding a new stream never reshuffles existing ones.
// Use one stream per system, e.g. 'worldgen.height', 'site.social'.

const MAX_UINT32 = 0xffffffff;

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return hash;
}

export function deriveStreamState(seed: string, name: string): number {
  return hashString(`${seed}:${name}`) || 1;
}

function nextUint32(state: number): number {
  let value = state;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export class RngStream {
  constructor(
    private readonly states: Record<string, number>,
    private readonly name: string,
  ) {}

  private next(): number {
    const state = nextUint32(this.states[this.name] ?? 1);
    this.states[this.name] = state;
    return state;
  }

  /** Uniform integer in [0, range). Rejection sampling avoids modulo bias. */
  int(range: number): number {
    if (!Number.isInteger(range) || range < 1) throw new Error(`Invalid range ${range}.`);
    const limit = Math.floor(MAX_UINT32 / range) * range;
    for (;;) {
      const value = this.next() - 1;
      if (value < limit) return value % range;
    }
  }

  /** Uniform integer in [min, max], inclusive. */
  between(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** True with probability p (0–1), at one-in-a-million resolution. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.int(1_000_000) < Math.floor(p * 1_000_000);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty list.');
    return items[this.int(items.length)]!;
  }

  /** Picks a key by integer-ish weight. Iterates in the given order (keep it stable). */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    if (total <= 0) throw new Error('Weighted pick needs a positive total weight.');
    let roll = this.int(Math.ceil(total));
    for (const [item, weight] of entries) {
      roll -= Math.max(0, weight);
      if (roll < 0) return item;
    }
    return entries[entries.length - 1]![0];
  }
}

/** Returns the named stream for a world, creating its state from the seed on first use. */
export function streamFor(
  owner: { seed: string; rng: Record<string, number> },
  name: string,
): RngStream {
  if (owner.rng[name] === undefined) owner.rng[name] = deriveStreamState(owner.seed, name);
  return new RngStream(owner.rng, name);
}
