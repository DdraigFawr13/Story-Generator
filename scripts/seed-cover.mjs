// Pick the fewest seeds per world key that hold every example the tests search for.
// Usage, after a history change loses or moves examples:
//   FIND_WORLD_POOL=pool.json FIND_WORLD_LOG=survey.jsonl npx vitest run tests/unit
//   node scripts/seed-cover.mjs survey.jsonl
// pool.json maps a key to the seeds to try ({"d64": ["NOT-1", ...]}). The result is a greedy cover
// (a few seeds, not always the fewest); put it in COVER_64 / COVER_128 or at the head of a file's list.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/seed-cover.mjs <survey.jsonl>');
const rows = readFileSync(file, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));

const holds = new Map(); // key -> what -> Set(seed)
const cost = new Map(); // key\0seed -> ms to generate
for (const row of rows) {
  if (row.type === 'gen') cost.set(`${row.key}\0${row.seed}`, row.ms);
  if (row.type !== 'survey') continue;
  const byWhat = holds.get(row.key) ?? new Map();
  holds.set(row.key, byWhat);
  const seeds = byWhat.get(`${row.file}: ${row.what}`) ?? new Set();
  byWhat.set(`${row.file}: ${row.what}`, seeds);
  if (row.ok) seeds.add(row.seed);
}

for (const [key, byWhat] of holds) {
  const open = new Set([...byWhat.keys()].filter((what) => byWhat.get(what).size > 0));
  const missing = [...byWhat.keys()].filter((what) => byWhat.get(what).size === 0);
  const cover = [];
  while (open.size > 0) {
    const tally = new Map();
    for (const what of open)
      for (const s of byWhat.get(what)) tally.set(s, (tally.get(s) ?? 0) + 1);
    const [best] = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    cover.push(best);
    for (const what of [...open]) if (byWhat.get(what).has(best)) open.delete(what);
  }
  const ms = cover.reduce((sum, s) => sum + (cost.get(`${key}\0${s}`) ?? 0), 0);
  console.log(`${key}: ${cover.join(', ')} (${byWhat.size} searches, ~${ms} ms to build)`);
  for (const what of missing) console.log(`  no pool seed holds ${what}`);
}
