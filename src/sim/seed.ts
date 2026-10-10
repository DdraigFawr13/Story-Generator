export const STREAM_NAMES = ['terrain', 'weather', 'demographics'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

export function validateSeed(seed: string): string {
  if (
    typeof seed !== 'string' ||
    seed.length < 1 ||
    seed.length > 64 ||
    /[^A-Za-z0-9_-]/.test(seed)
  ) {
    throw new Error('Use 1–64 letters, numbers, underscores or hyphens for the seed.');
  }
  return seed;
}

export function deriveStream(seed: string, name: StreamName): number {
  validateSeed(seed);
  if (!STREAM_NAMES.includes(name)) throw new Error('Unknown RNG stream.');
  return deriveNamedStream(seed, name);
}

// A separate domain keeps identity generation out of the frozen P1 RNG streams.
export function deriveResidentStream(seed: string): number {
  return deriveNamedStream(seed, 'residents-v1');
}

function deriveNamedStream(seed: string, name: string): number {
  validateSeed(seed);
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(`${seed}:${name}`)) {
    hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  }
  return hash || 1;
}
