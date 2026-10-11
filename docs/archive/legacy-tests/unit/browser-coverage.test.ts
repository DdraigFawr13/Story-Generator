import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BROWSER_PROJECTS, verifyBrowserReports } from '../../scripts/verify-browser-reports.mjs';

function fixtures() {
  const config = {
    argv: [
      'node',
      'playwright',
      'test',
      '--list',
      '--fully-parallel',
      '--forbid-only',
      '--reporter=json',
    ],
    version: '1.64.0',
    forbidOnly: true,
    fullyParallel: true,
    shard: null as { current: number; total: number } | null,
    projects: BROWSER_PROJECTS.map((name) => ({ name, retries: 1, repeatEach: 1 })),
    filteredProjects: BROWSER_PROJECTS.map((name) => ({ name })),
  };
  function spec(project: string, id: string, executed: boolean) {
    return {
      id,
      file: 'reader.spec.ts',
      line: 12,
      title: id,
      tests: [
        {
          projectName: project,
          expectedStatus: 'passed',
          status: executed ? 'expected' : 'skipped',
          results: executed ? [{ status: 'passed' }] : [],
        },
      ],
    };
  }
  const expected = {
    config,
    errors: [],
    suites: [
      {
        specs: BROWSER_PROJECTS.flatMap((project) =>
          ['a', 'b', 'c'].map((id) => spec(project, id, false)),
        ),
      },
    ],
  };
  const inputs = BROWSER_PROJECTS.flatMap((project) =>
    [1, 2].map((current) => ({
      name: `browser-report-${project}-${current}-of-2.json`,
      report: {
        config: {
          ...structuredClone(config),
          shard: { current, total: 2 },
          filteredProjects: [{ name: project }],
        },
        errors: [] as unknown[],
        suites: [
          { specs: (current === 1 ? ['a', 'b'] : ['c']).map((id) => spec(project, id, true)) },
        ],
        stats: { expected: current === 1 ? 2 : 1, flaky: 0, unexpected: 0, skipped: 0 },
      },
    })),
  );
  return { expected, inputs };
}

describe('complete browser-partition gate', () => {
  it('proves every case in all three engines exactly once across all six partitions', () => {
    const { expected, inputs } = fixtures();
    expect(verifyBrowserReports(expected, inputs)).toEqual({
      coverage: { chromium: 3, firefox: 3, webkit: 3 },
      cases: 9,
      partitions: 6,
      flaky: [],
    });
  });
  it('rejects missing, duplicate and mislabelled partitions rather than trusting green jobs', () => {
    const { expected, inputs } = fixtures();
    expect(() => verifyBrowserReports(expected, inputs.slice(1))).toThrow(/Missing\/extra/);
    const duplicate = structuredClone(inputs);
    duplicate[0] = duplicate[1]!;
    expect(() => verifyBrowserReports(expected, duplicate)).toThrow(/Duplicate browser partition/);
    const metadata = structuredClone(inputs);
    metadata[0]!.report.config.shard.current = 2;
    expect(() => verifyBrowserReports(expected, metadata)).toThrow(/partition metadata/);
    const name = structuredClone(inputs);
    name[0]!.name = 'browser-report-chromium-1-of-3.json';
    expect(() => verifyBrowserReports(expected, name)).toThrow(/report name/);
  });
  it('rejects incomplete, duplicate, extra and wrong-engine cases', () => {
    const { expected, inputs } = fixtures();
    const missing = structuredClone(inputs);
    missing[0]!.report.suites[0]!.specs.pop();
    missing[0]!.report.stats.expected--;
    expect(() => verifyBrowserReports(expected, missing)).toThrow(/Incomplete browser/);
    const duplicate = structuredClone(inputs);
    duplicate[0]!.report.suites[0]!.specs[1]!.id = 'a';
    expect(() => verifyBrowserReports(expected, duplicate)).toThrow(/Duplicate executed case/);
    const extra = structuredClone(inputs);
    extra[0]!.report.suites[0]!.specs[0]!.id = 'unlisted';
    expect(() => verifyBrowserReports(expected, extra)).toThrow(/Extra case/);
    const engine = structuredClone(inputs);
    engine[0]!.report.suites[0]!.specs[0]!.tests[0]!.projectName = 'webkit';
    expect(() => verifyBrowserReports(expected, engine)).toThrow(/wrong engine/);
  });
  it('requires actual final passes and rejects skipped, failed and empty attempts', () => {
    for (const status of ['skipped', 'unexpected', 'interrupted']) {
      const { expected, inputs } = fixtures();
      inputs[0]!.report.suites[0]!.specs[0]!.tests[0]!.status = status;
      expect(() => verifyBrowserReports(expected, inputs)).toThrow(/Unsuccessful case/);
    }
    const { expected, inputs } = fixtures();
    inputs[0]!.report.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'failed';
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/Final attempt/);
    inputs[0]!.report.suites[0]!.specs[0]!.tests[0]!.results = [];
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/Missing\/excess attempts/);
  });
  it('retains the existing one-retry policy and reports each real flaky case', () => {
    const { expected, inputs } = fixtures();
    const test = inputs[0]!.report.suites[0]!.specs[0]!.tests[0]!;
    test.status = 'flaky';
    test.results = [{ status: 'timedOut' }, { status: 'passed' }];
    inputs[0]!.report.stats.expected--;
    inputs[0]!.report.stats.flaky++;
    expect(verifyBrowserReports(expected, inputs).flaky).toEqual(['chromium reader.spec.ts:12 a']);
    inputs[0]!.report.stats.flaky = 0;
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/flaky-case count/);
    inputs[0]!.report.stats.flaky = 1;
    test.results.unshift({ status: 'failed' });
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/Missing\/excess attempts/);
  });
  it('rejects focused or incomplete enumeration, changed retry policy, versions and fatal errors', () => {
    const { expected, inputs } = fixtures();
    const focused = structuredClone(expected);
    focused.config.forbidOnly = false;
    expect(() => verifyBrowserReports(focused, inputs)).toThrow(/Focused tests/);
    const partial = structuredClone(expected);
    partial.config.filteredProjects.pop();
    expect(() => verifyBrowserReports(partial, inputs)).toThrow(/every engine/);
    const filtered = structuredClone(expected);
    filtered.config.argv.push('--grep=only-one-case');
    expect(() => verifyBrowserReports(filtered, inputs)).toThrow(/unfiltered/);
    const partitioned = structuredClone(expected);
    partitioned.config.shard = { current: 1, total: 2 };
    expect(() => verifyBrowserReports(partitioned, inputs)).toThrow(/unpartitioned/);
    const retry = structuredClone(inputs);
    retry[0]!.report.config.projects[0]!.retries = 2;
    expect(() => verifyBrowserReports(expected, retry)).toThrow(/retry policy/);
    const version = structuredClone(inputs);
    version[0]!.report.config.version = 'wrong';
    expect(() => verifyBrowserReports(expected, version)).toThrow(/Mixed Playwright/);
    const error = structuredClone(inputs);
    error[0]!.report.errors.push({ message: 'browser setup failed' });
    expect(() => verifyBrowserReports(expected, error)).toThrow(/Fatal browser/);
  });
  it('rejects dishonest result counters and hidden retries', () => {
    const { expected, inputs } = fixtures();
    inputs[0]!.report.stats.skipped = 1;
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/Skipped browser/);
    inputs[0]!.report.stats.skipped = 0;
    inputs[0]!.report.stats.expected = 9;
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/successful-case count/);
    inputs[0]!.report.stats.expected = 2;
    inputs[0]!.report.suites[0]!.specs[0]!.tests[0]!.results.unshift({ status: 'failed' });
    expect(() => verifyBrowserReports(expected, inputs)).toThrow(/reported as flaky/);
  });
  it('runs the actual CLI and fails missing artifacts or malformed JSON', async () => {
    const { expected, inputs } = fixtures();
    const root = await mkdtemp(join(tmpdir(), 'story-browser-gate-'));
    try {
      const list = join(root, 'expected.txt');
      await writeFile(list, JSON.stringify(expected));
      for (const input of inputs)
        await writeFile(join(root, input.name), JSON.stringify(input.report));
      const run = () =>
        spawnSync(
          process.execPath,
          [
            fileURLToPath(new URL('../../scripts/verify-browser-reports.mjs', import.meta.url)),
            list,
            root,
          ],
          { encoding: 'utf8' },
        );
      const success = run();
      expect(success.error).toBeUndefined();
      expect(success.status).toBe(0);
      expect(success.stdout).toContain('Complete browser coverage verified');
      await unlink(join(root, inputs[0]!.name));
      expect(run().status).toBe(1);
      await writeFile(join(root, inputs[0]!.name), '{');
      expect(run().status).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
