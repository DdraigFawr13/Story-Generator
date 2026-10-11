import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true } });
try {
  const { simulateLivingSettlement } = await server.ssrLoadModule('/src/sim/living.ts');
  const { residentWorkHistory } = await server.ssrLoadModule('/src/controller/work-history.ts');
  const { residentName } = await server.ssrLoadModule('/src/controller/residents.ts');
  const { canonicalJson } = await server.ssrLoadModule('/src/sim/canonical.ts');
  const { digestCanonical } = await server.ssrLoadModule('/src/adapters/crypto.ts');
  const baseline = JSON.parse(
    await readFile(root + 'docs/evidence/phase2-individual-battery.json', 'utf8'),
  );
  const samples = [];
  for (const seed of [
    'RIVERSIDE',
    'TERRAIN_005',
    'TERRAIN_011',
    'TERRAIN_019',
    'TERRAIN_030',
    'TERRAIN_098',
  ]) {
    const world = simulateLivingSettlement(seed, 1000).state;
    const before = canonicalJson(world);
    const histories = world.world.residents.map((person) => residentWorkHistory(world, person.id));
    for (const history of histories) {
      const firstWeek =
        (history.person.birthEventId === null
          ? 0
          : world.events[history.person.birthEventId - 1].tick) + 1;
      const through = history.death?.tick ?? world.tick;
      assert.equal(
        Object.values(history.totals).reduce((sum, value) => sum + value, 0),
        Math.max(0, through - firstWeek + 1),
      );
      for (const span of history.spans) {
        assert.equal(span.start.type, 'work_changed');
        assert.ok(
          span.start.facts.assignments.some(
            (row) =>
              row.id === history.person.id &&
              canonicalJson(row.after) === canonicalJson(span.activity),
          ),
        );
        assert.equal(span.weeks, span.throughTick - span.start.tick + 1);
      }
    }
    const digest = await digestCanonical(world);
    assert.equal(digest, baseline.outcomes.find((row) => row.seed === seed).digest);
    assert.equal(canonicalJson(world), before);
    const span = (value) =>
      value
        ? {
            role: value.activity.role,
            targetId: value.activity.targetId,
            from: value.start.tick,
            through: value.throughTick,
            weeks: value.weeks,
            startEventId: value.start.id,
            endEventId: value.end?.id ?? null,
          }
        : null;
    const active = histories
      .filter((history) => !history.death)
      .sort(
        (a, b) =>
          Object.values(b.totals).filter(Boolean).length -
            Object.values(a.totals).filter(Boolean).length || a.person.id - b.person.id,
      )[0];
    const deceased = histories.find((history) => history.death);
    const selected = [active, deceased].filter(Boolean).map((history) => ({
      id: history.person.id,
      name: residentName(history.person),
      status: history.death ? 'deceased' : 'living',
      totals: history.totals,
      spans: history.spans.length,
      first: span(history.spans[0]),
      longest: span(history.longest),
      last: span(history.spans.at(-1)),
    }));
    samples.push({ seed, tick: world.tick, digest, selected });
    console.info(JSON.stringify({ seed, digest, selected }));
  }
  const report = {
    provenance: {
      originalReport: 'docs/evidence/phase2-individual-battery.json',
      projectionSha256: createHash('sha256')
        .update(await readFile(root + 'src/controller/work-history.ts'))
        .digest('hex'),
      node: process.version,
      command: 'node scripts/work-history-study.mjs',
      ticksPerSeed: 1000,
    },
    samples,
  };
  await writeFile(
    root + 'docs/evidence/phase2-work-samples.json',
    JSON.stringify(report, null, 2) + '\n',
  );
} finally {
  await server.close();
}
