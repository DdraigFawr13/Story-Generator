export const RNG_ALGORITHM = 'xorshift32-v1';
const MAX_UINT32 = 0xffffffff;

export function validateRngState(state: number): void {
  if (!Number.isInteger(state) || state < 1 || state > MAX_UINT32) {
    throw new Error('RNG state must be a nonzero unsigned 32-bit integer.');
  }
}

export function nextUint32(state: number): number {
  validateRngState(state);
  let value = state;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function uniform(state: number, range: number): { value: number; state: number } {
  validateRngState(state);
  if (!Number.isInteger(range) || range < 1 || range > MAX_UINT32) {
    throw new Error('Uniform range must be an integer from 1 to 2^32−1.');
  }
  // xorshift32 has 2^32−1 outputs: zero is never produced.
  const limit = Math.floor(MAX_UINT32 / range) * range;
  let current = state;
  for (;;) {
    current = nextUint32(current);
    const value = current - 1;
    if (value < limit) return { value: value % range, state: current };
  }
}
