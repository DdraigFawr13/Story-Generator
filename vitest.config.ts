import { defineConfig } from 'vitest/config';

// Test files share their workers' module state (isolate: false), measured 54 s to 33 s on
// 2026-10-16. Shared fixture worlds stay safe because tests copy a world before changing it.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', isolate: false },
});
