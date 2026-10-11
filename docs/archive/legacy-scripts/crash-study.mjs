import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const profile = await mkdtemp(path.join(tmpdir(), 'story-generator-crash-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true } });
let child = null,
  browser = null;
async function launch() {
  child = spawn(
    chromium.executablePath(),
    [
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9226',
      `--user-data-dir=${profile}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Diagnostic browser startup timed out')),
      10000,
    );
    child.stderr.on('data', (data) => {
      if (data.toString().includes('DevTools listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  browser = await chromium.connectOverCDP('http://127.0.0.1:9226');
  const page = await browser.contexts()[0].newPage();
  await page.goto('http://127.0.0.1:4176');
  await page.getByRole('button', { name: 'New world', exact: true }).waitFor();
  return page;
}
async function stop(signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  // This PID is the detached process group spawned by this script, never an
  // existing user's browser. Its profile is a freshly created temporary directory.
  process.kill(-child.pid, signal);
  await exited;
}
try {
  await server.listen();
  const { simulateSettlement } = await server.ssrLoadModule('/src/sim/settlement.ts');
  const payload = JSON.parse(JSON.stringify(simulateSettlement('RIVERSIDE', 1000).state));
  let page = await launch();
  const before = await page.evaluate(async (payload) => {
    const localPath = '/src/adapters/local-save.ts',
      cryptoPath = '/src/adapters/crypto.ts';
    const { openLocalStore, prepareSave } = await import(localPath),
      { digestCanonical } = await import(cryptoPath);
    const store = await openLocalStore();
    try {
      await store.write(await prepareSave(payload, 'before-crash', 1));
      return await digestCanonical(payload);
    } finally {
      store.close();
    }
  }, payload);
  await page.evaluate(async () => {
    const path = '/tests/fixtures/crash-study.ts';
    const { holdSaveUntilCrash } = await import(path);
    await holdSaveUntilCrash();
  });
  await stop('SIGKILL');
  page = await launch();
  const after = await page.evaluate(async () => {
    const path = '/tests/fixtures/persistence-browser.ts';
    const { storedDigest } = await import(path);
    return storedDigest();
  });
  assert.equal(after.tick, 1000);
  assert.equal(after.digest, before);
  const report = {
    measuredAt: new Date().toISOString(),
    engine: 'chromium',
    version: browser.version(),
    crashPoint: 'after put request success, while the read-write transaction is held open',
    before,
    after,
    oldCompleteSnapshotRetained: true,
  };
  const output =
    process.env.STORY_GENERATOR_CRASH_REPORT ?? '/tmp/story-generator-crash-report.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
} finally {
  await stop('SIGTERM');
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
