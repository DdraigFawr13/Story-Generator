import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { digestCanonical } from '../../src/adapters/crypto';
import { prepareLivingSave, decodeLivingSave } from '../../src/adapters/living-save';
import { canonicalBytes, canonicalJson } from '../../src/sim/canonical';
import { simulateLivingSettlement, advanceLivingSettlement } from '../../src/sim/living';
import { validateLivingSettlement } from '../../src/sim/living-validation';
import { LIVING_SETTLEMENT_VERSION } from '../../src/sim/living-config';
import { residentDossier, residentName } from '../../src/controller/residents';
import { batteryPartition } from '../fixtures/seed-battery';

describe('complete individual seed battery', () => {
  it('preserves actual lives, references, histories and full save continuation across 100 seeded 1,000-week worlds', async () => {
    const shard = batteryPartition(process.env.STORY_GENERATOR_BATTERY_SHARD);
    const outcomes = [];
    const started = performance.now();
    for (const seed of shard.seeds) {
      const before = performance.now();
      const result = simulateLivingSettlement(seed, 1000);
      expect(result.advanced).toBe(1000);
      expect(result.halted).toBeNull();
      const world = result.state;
      expect(() => validateLivingSettlement(world)).not.toThrow();
      const original = canonicalJson(world);
      const envelope = await prepareLivingSave(world, 'individual-battery', 1);
      const restored = (await decodeLivingSave(envelope)).payload;
      expect(canonicalJson(restored)).toBe(original);
      const continued = advanceLivingSettlement(world, 12);
      const resumed = advanceLivingSettlement(restored, 12);
      expect(continued.advanced).toBe(12);
      expect(resumed.advanced).toBe(12);
      expect(continued.halted).toBeNull();
      expect(resumed.halted).toBeNull();
      expect(canonicalJson(resumed.state)).toBe(canonicalJson(continued.state));
      const people = new Map(world.world.residents.map((person) => [person.id, person]));
      const depths = new Map<number, number>();
      for (const person of world.world.residents) {
        expect(world.world.entities[person.id - 1]!.kind).toBe('resident');
        expect(world.world.entities[person.id - 1]!.retired).toBe(person.deathEventId !== null);
        expect(world.events[person.creationEventId - 1]!.entityIds).toContain(person.id);
        expect(person.entryTick).toBeLessThanOrEqual(1000);
        if (person.birthEventId !== null) {
          expect(person.parentIds).toHaveLength(1);
          const parent = people.get(person.parentIds[0]!)!;
          expect(parent.id).toBeLessThan(person.id);
          expect(parent.entryTick).toBeLessThanOrEqual(person.entryTick);
          if (parent.deathEventId !== null)
            expect(world.events[parent.deathEventId - 1]!.tick).toBeGreaterThanOrEqual(
              person.entryTick,
            );
          expect(world.events[person.birthEventId - 1]!.tick).toBe(person.entryTick);
        }
        depths.set(person.id, person.parentIds.length ? depths.get(person.parentIds[0]!)! + 1 : 0);
      }
      for (const household of world.world.households) {
        const living = world.world.residents.filter(
          (person) => person.householdId === household.id && person.deathEventId === null,
        );
        expect(world.world.entities[household.id - 1]!.retired).toBe(living.length === 0);
      }
      expect(world.world.settlement.population).toBe(
        world.world.residents.filter((person) => person.deathEventId === null).length,
      );
      const subject =
        world.world.residents.find((person) => person.birthEventId !== null) ??
        world.world.residents[0]!;
      const dossier = residentDossier(world, subject.id)!;
      const prose = dossier.paragraphs
        .map((paragraph) => paragraph.tokens.map((token) => token.text).join(''))
        .join('\n');
      expect(
        dossier.paragraphs
          .flatMap((paragraph) => paragraph.sourceIds)
          .every((id) => world.events[id - 1]?.id === id),
      ).toBe(true);
      expect(canonicalJson(world)).toBe(original);
      outcomes.push({
        seed,
        digest: await digestCanonical(world),
        continuedDigest: await digestCanonical(continued.state),
        population: world.world.settlement.population,
        identities: people.size,
        births: world.world.residents.filter((person) => person.birthEventId !== null).length,
        deaths: world.world.residents.filter((person) => person.deathEventId !== null).length,
        deepestKnownGeneration: Math.max(...depths.values()),
        retiredHouseholds: world.world.households.filter(
          (household) => world.world.entities[household.id - 1]!.retired,
        ).length,
        shortages: world.events.filter((event) => event.type === 'shortage_started').length,
        extinctionTick: world.events.find((event) => event.type === 'extinction')?.tick ?? null,
        events: world.events.length,
        bytes: canonicalBytes(world).length,
        sample: { personId: subject.id, name: residentName(subject), prose },
        elapsedMs: Math.round(performance.now() - before),
      });
    }
    expect(new Set(outcomes.map((outcome) => outcome.digest)).size).toBe(shard.seeds.length);
    const report = {
      version: LIVING_SETTLEMENT_VERSION,
      shard: { index: shard.index, total: shard.total },
      seeds: shard.seeds.length,
      ticksPerSeed: 1000,
      continuationWeeks: 12,
      elapsedMs: Math.round(performance.now() - started),
      outcomes,
    };
    if (process.env.STORY_GENERATOR_LIVING_REPORT)
      writeFileSync(
        process.env.STORY_GENERATOR_LIVING_REPORT,
        JSON.stringify(report, null, 2) + '\n',
      );
  }, 1_800_000);
});
