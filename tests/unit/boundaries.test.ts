import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkModule } from '../../scripts/check-boundaries.mjs';

describe('architectural boundaries include type and dynamic imports', () => {
  const sim = path.resolve('src/sim/example.ts');
  const ui = path.resolve('src/ui/example.tsx');
  it('permits internal core imports', () => {
    expect(checkModule(sim, "import { uniform } from './rng';")).toEqual([]);
  });
  it.each([
    "import type { View } from '../ui/App';",
    "export * from '../adapters/crypto';",
    "type T = import('../controller/founding').FoundingView;",
    "const ui = import('../ui/App');",
    'const core = import(name);',
    "import fs from 'node:fs';",
    'const seed = Math.random();',
    "const seed = Math['random']();",
    'const seed = Date.now();',
    'const text = a.localeCompare(b);',
    'const alias = globalThis;',
  ])('rejects core escape: %s', (source) => {
    expect(checkModule(sim, source).length).toBeGreaterThan(0);
  });
  it('requires UI to consume the controller', () => {
    expect(
      checkModule(ui, "import { generateGeography } from '../sim/terrain';").length,
    ).toBeGreaterThan(0);
    expect(checkModule(ui, "import type { FoundingView } from '../controller/founding';")).toEqual(
      [],
    );
  });
});
