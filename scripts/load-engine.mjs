// Loads the TypeScript engine and content into plain Node via Vite's module runner.
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function loadEngine() {
  const config = { root, configFile: false, logLevel: 'error' };
  const engine = await runnerImport(`${root}src/engine/index.ts`, config);
  const content = await runnerImport(`${root}src/content/index.ts`, config);
  return { ...engine.module, ...content.module };
}

/** Parse "--name value" pairs; returns a map of strings. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1] ?? '';
    i += 1;
  }
  return args;
}
