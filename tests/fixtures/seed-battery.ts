export const BATTERY_SEEDS = [
  'RIVERSIDE',
  ...Array.from({ length: 99 }, (_, i) => `TERRAIN_${String(i).padStart(3, '0')}`),
];

export function batteryPartition(value: string | undefined) {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? '1/1');
  if (!match) throw new Error('Battery shard must be index/total.');
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > BATTERY_SEEDS.length ||
    index < 1 ||
    index > total
  )
    throw new Error('Battery shard is outside the complete seed range.');
  return {
    index,
    total,
    seeds: BATTERY_SEEDS.filter((_, offset) => offset % total === index - 1),
  };
}

interface BatteryReport {
  version: string;
  shard: { index: number; total: number };
  seeds: number;
  ticksPerSeed: number;
  outcomes: { seed: string; digest: string }[];
}

export function verifyBatteryReports(
  input: unknown[],
  total: number,
  version = 'p1-settlement-v2',
) {
  if (input.length !== total) throw new Error('Missing or extra battery reports.');
  const seenShards = new Set<number>();
  const seenSeeds = new Set<string>();
  const digests = new Set<string>();
  for (const value of input) {
    const report = value as BatteryReport | null;
    if (
      !report ||
      report.version !== version ||
      report.ticksPerSeed !== 1000 ||
      !report.shard ||
      report.shard.total !== total ||
      !Array.isArray(report.outcomes)
    )
      throw new Error('Invalid battery report contract.');
    const partition = batteryPartition(`${report.shard.index}/${total}`);
    if (seenShards.has(partition.index)) throw new Error('Duplicate battery shard.');
    seenShards.add(partition.index);
    if (
      report.seeds !== partition.seeds.length ||
      report.outcomes.length !== partition.seeds.length
    )
      throw new Error('Incomplete battery shard.');
    for (const [offset, outcome] of report.outcomes.entries()) {
      if (
        !outcome ||
        outcome.seed !== partition.seeds[offset] ||
        seenSeeds.has(outcome.seed) ||
        typeof outcome.digest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(outcome.digest)
      )
        throw new Error('Missing, duplicate or invalid seed outcome.');
      seenSeeds.add(outcome.seed);
      digests.add(outcome.digest);
    }
  }
  if (seenSeeds.size !== BATTERY_SEEDS.length || digests.size !== BATTERY_SEEDS.length)
    throw new Error('The complete 100-seed battery must have 100 distinct digests.');
  return { seeds: seenSeeds.size, ticksPerSeed: 1000, shards: seenShards.size };
}
