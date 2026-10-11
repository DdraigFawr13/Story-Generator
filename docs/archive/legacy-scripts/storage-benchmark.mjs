import { createServer } from 'vite';
import { chromium, firefox, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const server = await createServer({ server: { host: '127.0.0.1', port: 4175, strictPort: true } });
const measurements = [];
try {
  await server.listen();
  const { simulateSettlement, advanceSettlement } =
    await server.ssrLoadModule('/src/sim/settlement.ts');
  const generationStarted = performance.now();
  const first = simulateSettlement('RIVERSIDE', 1000).state;
  process.stdout.write(
    `Generated 1,000 weeks in ${Math.round(performance.now() - generationStarted)}ms. Generating retained 10,000-week world…\n`,
  );
  const long = advanceSettlement(first, 9000).state;
  process.stdout.write(
    `Generated 10,000 weeks in ${Math.round(performance.now() - generationStarted)}ms.\n`,
  );
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch({
      headless: true,
      ...(engine === 'chromium' ? { args: ['--enable-precise-memory-info'] } : {}),
    });
    try {
      for (const snapshot of [first, long]) {
        const page = await browser.newPage();
        try {
          await page.goto('http://127.0.0.1:4175');
          await page.getByRole('button', { name: 'New world', exact: true }).waitFor();
          const result = await page.evaluate(
            async (snapshot) => {
              const path = '/tests/fixtures/storage-benchmark.ts';
              const { measureStorage } = await import(path);
              return measureStorage(snapshot);
            },
            JSON.parse(JSON.stringify(snapshot)),
          );
          assert.equal(result.continuedEqual, true);
          const reloadStarted = performance.now();
          await page.reload();
          await page.getByRole('button', { name: 'Resume local save' }).click();
          await page
            .getByTestId('tick')
            .filter({ hasText: String(snapshot.tick) })
            .waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Play', exact: true }).isVisible(),
            true,
          );
          const measured = {
            engine,
            version: browser.version(),
            ...result,
            uiReloadResumeMs: performance.now() - reloadStarted,
          };
          measurements.push(measured);
          process.stdout.write(JSON.stringify(measured) + '\n');
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  const output =
    process.env.STORY_GENERATOR_STORAGE_REPORT ?? '/tmp/story-generator-storage-report.json';
  await writeFile(
    output,
    JSON.stringify({ measuredAt: new Date().toISOString(), measurements }, null, 2) + '\n',
  );
  process.stdout.write(`Report written to ${output}\n`);
} finally {
  await server.close();
}
