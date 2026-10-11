import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { verifyBatteryReports } from '../tests/fixtures/seed-battery.ts';

const directory = process.argv[2];
if (!directory) throw new Error('Provide the downloaded seed-report directory.');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
const reports = await Promise.all(
  files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'))),
);
console.info('Complete seed battery verified:', verifyBatteryReports(reports, 4));
