import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { verifyBatteryReports } from '../tests/fixtures/seed-battery.ts';

const directory = process.argv[2];
if (!directory) throw new Error('Provide the downloaded seed-report directory.');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
const reports = await Promise.all(
  files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'))),
);
if (process.argv[3] === undefined) {
  console.info('Complete seed battery verified:', verifyBatteryReports(reports, 4));
} else if (process.argv[3] === '--living') {
  const aggregate = reports.filter((report) => report?.version === 'p1-settlement-v2');
  const individual = reports.filter((report) => report?.version === 'p2-settlement-v1');
  if (aggregate.length + individual.length !== reports.length)
    throw new Error('Unexpected seed report version.');
  const aggregateCoverage = verifyBatteryReports(aggregate, 4);
  const individualCoverage = verifyBatteryReports(individual, 4, 'p2-settlement-v1');
  for (const report of individual) {
    if (
      report.continuationWeeks !== 12 ||
      report.outcomes.some(
        (outcome) =>
          typeof outcome.continuedDigest !== 'string' ||
          !/^[a-f0-9]{64}$/.test(outcome.continuedDigest),
      )
    )
      throw new Error('Incomplete individual save-continuation report.');
  }
  console.info('Complete aggregate seed battery verified:', aggregateCoverage);
  console.info('Complete individual seed battery verified:', individualCoverage);
} else throw new Error('Unknown seed verification mode.');
