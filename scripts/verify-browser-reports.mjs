import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BROWSER_PROJECTS = ['chromium', 'firefox', 'webkit'];
const SHARDS = 2;

function cases(report) {
  const rows = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      assert.equal(typeof spec.id, 'string', 'Missing case identity');
      for (const test of spec.tests) {
        assert.ok(BROWSER_PROJECTS.includes(test.projectName), 'Unexpected browser project');
        assert.equal(
          test.expectedStatus,
          'passed',
          'Expected-failure/skip cases cannot close coverage',
        );
        rows.push({
          key: `${test.projectName}:${spec.id}`,
          project: test.projectName,
          title: `${spec.file}:${spec.line} ${spec.title}`,
          test,
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  assert.ok(Array.isArray(report.suites), 'Missing suites');
  for (const suite of report.suites) visit(suite);
  return rows;
}

function policy(report) {
  assert.equal(typeof report.config.version, 'string', 'Missing Playwright version');
  assert.equal(report.config.forbidOnly, true, 'Focused tests must fail CI');
  assert.equal(
    report.config.fullyParallel,
    true,
    'Browser partitions must distribute individual cases',
  );
  assert.ok(Array.isArray(report.errors) && report.errors.length === 0, 'Fatal browser errors');
  assert.deepEqual(
    report.config.projects.map((project) => project.name).sort(),
    [...BROWSER_PROJECTS].sort(),
    'Wrong browser configuration',
  );
  for (const project of report.config.projects) {
    assert.equal(project.retries, 1, 'The existing CI retry policy must be retained');
    assert.equal(project.repeatEach, 1, 'Unexpected repeated cases');
  }
}

/** Job success alone cannot prove that a matrix covered every case in every engine. */
export function verifyBrowserReports(expected, inputs) {
  policy(expected);
  assert.equal(expected.config.shard, null, 'Expected list must be unpartitioned');
  assert.deepEqual(
    expected.config.argv.slice(2),
    ['test', '--list', '--fully-parallel', '--forbid-only', '--reporter=json'],
    'Expected list must be unfiltered',
  );
  assert.deepEqual(
    expected.config.filteredProjects.map((project) => project.name).sort(),
    [...BROWSER_PROJECTS].sort(),
    'Expected list must include every engine',
  );
  const listed = cases(expected);
  const wanted = new Map(listed.map((row) => [row.key, row]));
  assert.equal(wanted.size, listed.length, 'Duplicate expected case');
  const coverage = Object.fromEntries(
    BROWSER_PROJECTS.map((project) => [
      project,
      listed.filter((row) => row.project === project).length,
    ]),
  );
  for (const count of Object.values(coverage)) assert.ok(count > 0, 'Empty expected engine');
  assert.equal(inputs.length, BROWSER_PROJECTS.length * SHARDS, 'Missing/extra browser partitions');
  const partitions = new Set();
  const seen = new Set();
  const flaky = [];
  for (const { name, report } of inputs) {
    const match = /^browser-report-(chromium|firefox|webkit)-([12])-of-2\.json$/.exec(name);
    assert.ok(match, 'Wrong browser report name');
    const [, project, index] = match;
    const partition = `${project}:${index}`;
    assert.ok(!partitions.has(partition), 'Duplicate browser partition');
    partitions.add(partition);
    policy(report);
    assert.equal(report.config.version, expected.config.version, 'Mixed Playwright versions');
    assert.deepEqual(
      report.config.shard,
      { current: Number(index), total: SHARDS },
      'Wrong partition metadata',
    );
    assert.deepEqual(
      report.config.filteredProjects.map((row) => row.name),
      [project],
      'Wrong partition engine',
    );
    const actual = cases(report);
    assert.ok(actual.length > 0, 'Empty browser partition');
    let expectedCount = 0,
      flakyCount = 0;
    for (const row of actual) {
      assert.equal(row.project, project, 'Case assigned to wrong engine');
      assert.ok(wanted.has(row.key), `Extra case: ${row.key}`);
      assert.ok(!seen.has(row.key), `Duplicate executed case: ${row.key}`);
      assert.ok(['expected', 'flaky'].includes(row.test.status), `Unsuccessful case: ${row.title}`);
      assert.ok(
        row.test.results.length > 0 && row.test.results.length <= 2,
        'Missing/excess attempts',
      );
      assert.equal(row.test.results.at(-1).status, 'passed', 'Final attempt did not pass');
      if (row.test.status === 'flaky') {
        assert.equal(row.test.results.length, 2, 'Flaky case needs its actual retry');
        assert.notEqual(row.test.results[0].status, 'passed', 'False flaky status');
        flaky.push(`${project} ${row.title}`);
        flakyCount++;
      } else {
        assert.equal(row.test.results.length, 1, 'Retried cases must be reported as flaky');
        expectedCount++;
      }
      seen.add(row.key);
    }
    assert.equal(report.stats.expected, expectedCount, 'Wrong successful-case count');
    assert.equal(report.stats.flaky, flakyCount, 'Wrong flaky-case count');
    assert.equal(report.stats.unexpected, 0, 'Unexpected browser failures');
    assert.equal(report.stats.skipped, 0, 'Skipped browser cases');
  }
  assert.equal(seen.size, wanted.size, 'Incomplete browser case coverage');
  return { coverage, cases: seen.size, partitions: partitions.size, flaky };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Supply the complete expected list and report directory');
  const expected = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const directory = process.argv[3];
  const inputs = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map(async (name) => ({
        name,
        report: JSON.parse(await readFile(resolve(directory, name), 'utf8')),
      })),
  );
  console.info('Complete browser coverage verified:', verifyBrowserReports(expected, inputs));
}
