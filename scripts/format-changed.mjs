// Prettier's check on the files this branch changed against origin/main, for the local
// `npm run check`. A fresh container's first full `prettier --check .` takes about 12 s
// (measured 2026-10-31); the changed files take under a second. CI still checks every file.
// Falls back to the full check when origin/main is unknown.
import { execFileSync } from 'node:child_process';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

let files;
try {
  const base = git('merge-base', 'HEAD', 'origin/main');
  const changed = git('diff', '--name-only', '--diff-filter=ACMR', base);
  const untracked = git('ls-files', '--others', '--exclude-standard');
  files = [...new Set(`${changed}\n${untracked}`.split('\n').filter(Boolean))];
} catch {
  files = null;
}

const args =
  files === null
    ? ['--check', '--cache', '.']
    : ['--check', '--cache', '--ignore-unknown', ...files];
if (files !== null && files.length === 0) {
  console.log('format: no files changed against origin/main');
  process.exit(0);
}
execFileSync('npx', ['prettier', ...args], { stdio: 'inherit' });
