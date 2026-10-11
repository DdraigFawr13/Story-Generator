import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true } });
try {
  const { simulateLivingSettlement } = await server.ssrLoadModule('/src/sim/living.ts');
  const { residentLineage } = await server.ssrLoadModule('/src/controller/family.ts');
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
    const original = baseline.outcomes.find((row) => row.seed === seed);
    assert.ok(original, `Missing original complete-world baseline for ${seed}`);
    const world = simulateLivingSettlement(seed, 1000).state;
    const before = canonicalJson(world);
    const families = world.world.residents.map((person) => residentLineage(world, person.id));
    for (const family of families) {
      for (const direction of ['ancestors', 'descendants']) {
        assert.equal(
          new Set(family[direction].map((row) => row.person.id)).size,
          family[direction].length,
        );
        for (const row of family[direction]) {
          assert.ok(row.child.parentIds.includes(row.parent.id));
          assert.equal(row.birth.id, row.child.birthEventId);
          assert.equal(row.birth.type, 'births');
          assert.ok(row.birth.entityIds.includes(row.child.id));
          assert.ok(row.birth.entityIds.includes(row.parent.id));
        }
      }
    }
    const selected =
      families.find((family) => family.ancestors.length >= 2) ??
      families.reduce((best, family) =>
        family.descendants.length > best.descendants.length ? family : best,
      );
    const digest = await digestCanonical(world);
    assert.equal(digest, original.digest);
    assert.equal(canonicalJson(world), before);
    const rows = (direction) =>
      selected[direction].map((row) => ({
        id: row.person.id,
        name: residentName(row.person),
        generation: row.generation,
        status: row.person.deathEventId === null ? 'living' : 'deceased',
        parentId: row.parent.id,
        childId: row.child.id,
        birthEventId: row.birth.id,
        birthTick: row.birth.tick,
      }));
    const sample = {
      seed,
      tick: world.tick,
      digest,
      subject: {
        id: selected.subject.id,
        name: residentName(selected.subject),
        status: selected.subject.deathEventId === null ? 'living' : 'deceased',
      },
      ancestors: rows('ancestors'),
      descendants: rows('descendants'),
    };
    samples.push(sample);
    console.info(JSON.stringify(sample));
  }
  const report = {
    provenance: {
      originalReport: 'docs/evidence/phase2-individual-battery.json',
      projectionSha256: createHash('sha256')
        .update(await readFile(root + 'src/controller/family.ts'))
        .digest('hex'),
      node: process.version,
      command: 'node scripts/family-lineage-study.mjs',
      ticksPerSeed: 1000,
    },
    samples,
  };
  await writeFile(
    root + 'docs/evidence/phase2-lineage-samples.json',
    JSON.stringify(report, null, 2) + '\n',
  );
} finally {
  await server.close();
}
