import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkModule } from '../../scripts/check-boundaries.mjs';

describe('architectural boundaries include type and dynamic imports', () => {
  const core = path.resolve('src/engine/core/example.ts');
  it('permits internal core imports', () => {
    expect(checkModule(core, "import { streamFor } from './rng';")).toEqual([]);
  });
  it.each([
    "import type { View } from '../../app/NextApp';",
    "export * from '../../platform/save-store';",
    "type T = import('../../app/NextApp').NextApp;",
    "const ui = import('../../app/NextApp');",
    'const core = import(name);',
    "import fs from 'node:fs';",
    'const seed = Math.random();',
    "const seed = Math['random']();",
    'const seed = Date.now();',
    'const text = a.localeCompare(b);',
    'const alias = globalThis;',
  ])('rejects core escape: %s', (source) => {
    expect(checkModule(core, source).length).toBeGreaterThan(0);
  });
  it('rejects the deleted legacy layers', () => {
    expect(checkModule(path.resolve('src/sim/example.ts'), '').length).toBeGreaterThan(0);
  });
  it('keeps the new engine pure and content data-only', () => {
    const engine = path.resolve('src/engine/core/example.ts');
    const content = path.resolve('src/content/example.ts');
    const app = path.resolve('src/app/example.tsx');
    expect(checkModule(engine, "import type { RaceDef } from './content-types';")).toEqual([]);
    expect(
      checkModule(engine, "import { DEFAULT_CONTENT } from '../../content';").length,
    ).toBeGreaterThan(0);
    expect(checkModule(engine, "import { App } from '../../app/NextApp';").length).toBeGreaterThan(
      0,
    );
    expect(checkModule(engine, 'const roll = Math.random();').length).toBeGreaterThan(0);
    expect(checkModule(engine, 'const a = Math.floor(Math.sqrt(x) * 2);')).toEqual([]);
    for (const unsafe of ['Math.sin(x)', 'Math.pow(x, 2)', "Math['log'](x)", 'x ** 2']) {
      expect(checkModule(engine, `const a = ${unsafe};`).length).toBeGreaterThan(0);
      expect(checkModule(content, `const a = ${unsafe};`).length).toBeGreaterThan(0);
    }
    expect(checkModule(content, "import type { RaceDef } from '../engine';")).toEqual([]);
    expect(
      checkModule(content, "import { NextApp } from '../app/NextApp';").length,
    ).toBeGreaterThan(0);
    expect(checkModule(app, "import { useState } from 'react';")).toEqual([]);
  });
});
