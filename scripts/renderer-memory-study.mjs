import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { arch, release, tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';

assert.equal(process.platform, 'linux', 'This diagnostic needs Linux /proc and Chromium.');
const port = 4178;
const origin = `http://127.0.0.1:${port}`;
const repetitions = 3;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceTreeDirty =
  execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
const source = await createServer({ server: { middlewareMode: true } });
const cases = [{ name: 'empty-landing', envelope: null, expected: null }];
try {
  const { createSettlement } = await source.ssrLoadModule('/src/sim/settlement-initial.ts');
  const { advanceSettlement } = await source.ssrLoadModule('/src/sim/settlement.ts');
  const { canonicalBytes } = await source.ssrLoadModule('/src/sim/canonical.ts');
  const { digestCanonical } = await source.ssrLoadModule('/src/adapters/crypto.ts');
  const { prepareSave } = await source.ssrLoadModule('/src/adapters/local-save.ts');
  for (const version of ['p1-settlement-v1', 'p1-settlement-v2']) {
    let snapshot = createSettlement('RIVERSIDE', version);
    for (const tick of [1000, 10000]) {
      process.stdout.write(`Generating ${version} week ${tick}…\n`);
      snapshot = advanceSettlement(snapshot, tick - snapshot.tick).state;
      const next = advanceSettlement(snapshot, 8).state;
      cases.push({
        name: `${version}-${tick}`,
        envelope: await prepareSave(snapshot, 'memory-fixture', 1),
        payloadBytes: canonicalBytes(snapshot).byteLength,
        events: snapshot.events.length,
        population: snapshot.world.settlement.population,
        expected: {
          tick: next.tick,
          version,
          digest: await digestCanonical(next),
        },
      });
    }
  }
} finally {
  await source.close();
}
// The SSR fixture server initializes NODE_ENV for development. Build in a
// separate process so that state cannot select React's development runtime.
execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--mode', 'production'], {
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
});
const assets = (await readdir('dist/assets')).filter((name) => name.endsWith('.js'));
assert.equal(assets.length, 1, 'Record the complete production JS bundle.');
const bundleBytes = await readFile(path.join('dist/assets', assets[0]));
assert.equal(bundleBytes.includes(Buffer.from('setstate-in-render')), false);
const bundle = {
  file: assets[0],
  sha256: createHash('sha256').update(bundleBytes).digest('hex'),
  bytes: bundleBytes.byteLength,
  mode: 'production',
  nodeEnv: 'production',
};
const server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } });
const measurements = [];

async function start(profile) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  return { context, page: context.pages()[0] };
}
async function identifyRenderer(page, browser) {
  const session = await browser.newBrowserCDPSession();
  const marker = 'story-generator-memory-renderer';
  const ids = new Set();
  session.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) if (event.name === marker) ids.add(event.pid);
  });
  await session.send('Tracing.start', {
    categories: 'blink.user_timing',
    transferMode: 'ReportEvents',
  });
  try {
    await page.evaluate((name) => performance.mark(name), marker);
  } finally {
    const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.end');
    await complete;
  }
  assert.equal(ids.size, 1, 'The page mark must identify exactly one renderer.');
  const pid = [...ids][0];
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  assert.equal(processInfo.find((entry) => entry.id === pid)?.type, 'renderer');
  await session.detach();
  return pid;
}
async function checkpoint(pid, session) {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  const startTicks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const bytes = (field) => {
    const match = status.match(new RegExp(`^${field}:\\s+(\\d+) kB$`, 'm'));
    assert.ok(match, `Missing ${field} in the renderer's status.`);
    return Number(match[1]) * 1024;
  };
  const rssBytes = bytes('VmRSS');
  const peakRssBytes = bytes('VmHWM');
  assert.ok(Number.isSafeInteger(peakRssBytes) && peakRssBytes >= rssBytes && rssBytes > 0);
  const { usedSize } = await session.send('Runtime.getHeapUsage');
  assert.ok(Number.isSafeInteger(usedSize) && usedSize > 0);
  return { pid, startTicks, rssBytes, peakRssBytes, usedJsHeapBytes: usedSize };
}
async function prepareProfile(profile, envelope) {
  const { context, page } = await start(profile);
  try {
    await page.goto(origin);
    await expect(page.getByRole('button', { name: 'New world', exact: true })).toBeEnabled();
    await page.evaluate(async (envelope) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('story-generator-local-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('world');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const transaction = database.transaction('world', 'readwrite');
          transaction.objectStore('world').put(envelope, 'slot');
          transaction.oncomplete = resolve;
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    }, envelope);
  } finally {
    // Fixture transfer/validation occurs in an earlier, completely closed browser.
    // Its renderer and any copied comparison payloads are excluded from measurement.
    await context.close();
  }
}
async function storedSummary(page) {
  // Run this only AFTER the final memory checkpoint: reading a second full
  // envelope for a benchmark assertion must not inflate the measured workload.
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('story-generator-local-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('world', 'readonly');
        const request = transaction.objectStore('world').get('slot');
        transaction.oncomplete = () =>
          resolve({
            tick: request.result.payload.tick,
            version: request.result.payload.simulationVersion,
            digest: request.result.digest,
          });
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  });
}

try {
  for (const entry of cases) {
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const profile = await mkdtemp(path.join(tmpdir(), 'story-generator-memory-'));
      let context;
      try {
        if (entry.envelope) await prepareProfile(profile, entry.envelope);
        const launched = await start(profile);
        context = launched.context;
        const page = launched.page;
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        const started = performance.now();
        await page.goto(origin);
        const ready = page.getByRole('button', {
          name: entry.envelope ? 'Resume local save' : 'New world',
          exact: true,
        });
        await expect(ready).toBeEnabled();
        assert.equal(context.pages().length, 1);
        const pid = await identifyRenderer(page, context.browser());
        const session = await context.newCDPSession(page);
        const checkpoints = { landing: await checkpoint(pid, session) };
        let resumeMs = null,
          stored = null;
        if (entry.envelope) {
          await ready.click();
          await expect(page.getByTestId('tick')).toHaveText(String(entry.envelope.payload.tick));
          await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
          resumeMs = performance.now() - started;
          checkpoints.resumed = await checkpoint(pid, session);
          for (let week = 0; week < 8; week++)
            await page.getByRole('button', { name: 'Step one week', exact: true }).click();
          await expect(page.locator('.save-status')).toContainText(
            `Saved through week ${entry.expected.tick}.`,
          );
          await expect(page.locator('.save-status')).not.toContainText('Writing a complete');
          checkpoints.autosaved = await checkpoint(pid, session);
          stored = await storedSummary(page);
          assert.deepEqual(stored, entry.expected);
        }
        assert.equal(new Set(Object.values(checkpoints).map((value) => value.startTicks)).size, 1);
        const peaks = Object.values(checkpoints).map((value) => value.peakRssBytes);
        assert.deepEqual(
          peaks,
          [...peaks].sort((a, b) => a - b),
        );
        assert.deepEqual(errors, []);
        const measurement = {
          case: entry.name,
          repetition,
          engine: 'chromium',
          version: context.browser().version(),
          startingTick: entry.envelope?.payload.tick ?? null,
          payloadBytes: entry.payloadBytes ?? null,
          events: entry.events ?? null,
          population: entry.population ?? null,
          resumeMs,
          checkpoints,
          stored,
          errors,
        };
        measurements.push(measurement);
        process.stdout.write(JSON.stringify(measurement) + '\n');
      } finally {
        await context?.close();
        await rm(profile, { recursive: true, force: true });
      }
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    sourceCommit,
    sourceTreeDirty,
    platform: { os: process.platform, kernel: release(), arch: arch(), node: process.version },
    bundle,
    viewport: { width: 1280, height: 900 },
    repetitions,
    method: {
      peak: 'Linux /proc renderer VmHWM: peak resident set since process birth through each checkpoint',
      isolation:
        'One page and one saved world in each fresh Chromium process/profile; preparation browser fully closed first',
      workload:
        'Production landing/validation, paused Resume, eight manual weeks and completed automatic save',
      jsHeap:
        'Runtime.getHeapUsage usedSize at checkpoints; neither retained-after-GC nor peak JS heap',
      included:
        'App startup, shared mappings, renderer libraries, DOM/canvas/fonts and ordinary controller/save copies of the same world; PID identification tracing overhead',
      excluded:
        'Node/Vite processes, browser/GPU/utility processes, fixture preparation browser and post-measurement digest inspection',
      limits:
        'Three desktop Linux samples/case, not percentiles, total browser memory, phone budgets, maximum-payload proof or other-engine evidence',
    },
    measurements,
  };
  const output =
    process.env.STORY_GENERATOR_MEMORY_REPORT ?? '/tmp/story-generator-renderer-memory.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`Report written to ${output}\n`);
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
