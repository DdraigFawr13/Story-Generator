import { defineConfig } from 'vitest/config';

// The speed guard runs alone, after the unit tests, so their load does not skew its timing.
export default defineConfig({
  test: { include: ['tests/speed/**/*.test.ts'], environment: 'node' },
});
