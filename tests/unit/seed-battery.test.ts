import { expect, it } from 'vitest';
import { BATTERY_SEEDS, batteryPartition, verifyBatteryReports } from '../fixtures/seed-battery';

function reports(total = 4) {
  return Array.from({ length: total }, (_, offset) => {
    const shard = batteryPartition(`${offset + 1}/${total}`);
    return {
      version: 'p1-settlement-v2',
      shard,
      seeds: shard.seeds.length,
      ticksPerSeed: 1000,
      outcomes: shard.seeds.map((seed) => ({
        seed,
        digest: BATTERY_SEEDS.indexOf(seed).toString(16).padStart(64, '0'),
      })),
    };
  });
}

it('partitions every original seed exactly once without shrinking local coverage', () => {
  expect(batteryPartition(undefined).seeds).toEqual(BATTERY_SEEDS);
  for (const total of [1, 3, 4, 100]) {
    const selected = reports(total).flatMap((report) => report.outcomes.map((row) => row.seed));
    expect(selected).toHaveLength(100);
    expect(new Set(selected)).toEqual(new Set(BATTERY_SEEDS));
    expect(verifyBatteryReports(reports(total), total).seeds).toBe(100);
  }
});

it('rejects invalid shard settings instead of silently running fewer seeds', () => {
  for (const value of [
    '',
    '0/4',
    '5/4',
    '1/0',
    '1/101',
    '1',
    '1.5/4',
    '1/4junk',
    '999999999999999999/4',
  ])
    expect(() => batteryPartition(value)).toThrow();
});

it('fails the aggregate gate for missing, duplicate, truncated or mismatched reports', () => {
  const broken: unknown[][] = [
    reports().slice(1),
    [...reports(), reports()[0]],
    [null, ...reports().slice(1)],
  ];
  const duplicate = reports();
  duplicate[1] = duplicate[0]!;
  broken.push(duplicate);
  for (const change of [
    (report: ReturnType<typeof reports>[number]) => {
      report.outcomes.pop();
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.outcomes[0]!.seed = 'OTHER_SEED';
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.outcomes[0]!.digest = 'invalid';
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.ticksPerSeed = 48;
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.version = 'p1-settlement-v1';
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.shard.total = 3;
    },
    (report: ReturnType<typeof reports>[number]) => {
      report.seeds = 1;
    },
  ]) {
    const altered = reports();
    change(altered[0]!);
    broken.push(altered);
  }
  for (const input of broken) expect(() => verifyBatteryReports(input, 4)).toThrow();
  const equalDigests = reports();
  equalDigests[1]!.outcomes[0]!.digest = equalDigests[0]!.outcomes[0]!.digest;
  expect(() => verifyBatteryReports(equalDigests, 4)).toThrow(/distinct digests/);
});
