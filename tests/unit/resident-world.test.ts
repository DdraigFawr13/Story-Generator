import { describe, expect, it } from 'vitest';
import { digestCanonical } from '../../src/adapters/crypto';
import { decodeSave, prepareSave } from '../../src/adapters/local-save';
import { decodeResidentSave, prepareResidentSave } from '../../src/adapters/resident-save';
import { canonicalJson } from '../../src/sim/canonical';
import { createFounderRoster } from '../../src/sim/residents';
import { createSettlement } from '../../src/sim/settlement-initial';
import { advanceSettlement } from '../../src/sim/settlement';
import {
  createResidentWorld,
  validateResidentWorld,
  worldResidentAgeWeeks,
} from '../../src/sim/resident-world';

describe('P2 world and save foundation', () => {
  it.each(['RIVERSIDE', 'THIMBLE', 'PEOPLE_7'])(
    'registers the real founder identities for %s',
    (seed) => {
      const founding = createSettlement(seed);
      const before = canonicalJson(founding);
      const roster = createFounderRoster(founding);
      const world = createResidentWorld(seed);
      expect(canonicalJson(founding)).toBe(before);
      expect(world.world.residents).toHaveLength(world.world.settlement.population);
      expect(world.world.households).toHaveLength(world.world.settlement.households);
      expect(world.allocators.entity).toBe(roster.nextEntityId);
      expect(world.world.entities.map((entity) => entity.id)).toEqual(
        Array.from({ length: world.allocators.entity - 1 }, (_, index) => index + 1),
      );
      expect(world.events[0]!.entityIds).toEqual(world.world.entities.map((entity) => entity.id));
      expect(world.rng.residents).toEqual(roster.rng);
      for (const resident of world.world.residents) {
        const source = roster.residents.find((person) => person.id === resident.id)!;
        expect(resident.givenName).toBe(source.givenName);
        expect(worldResidentAgeWeeks(resident, 48)).toBe(source.ageWeeksAtFounding + 48);
        expect(resident.birthEventId).toBeNull();
        expect(resident.parentIds).toEqual([]);
        expect(resident.creationEventId).toBe(1);
        expect(world.world.entities[resident.id - 1]!.kind).toBe('resident');
        expect(world.world.entities[resident.homeId! - 1]!.kind).toBe('hut');
        expect(world.world.entities[resident.householdId - 1]!.kind).toBe('household');
      }
      expect(Object.isFrozen(world.world.residents[0]!.traits)).toBe(true);
      expect(() => validateResidentWorld(JSON.parse(canonicalJson(world)))).not.toThrow();
    },
  );

  it('round-trips the complete P2 payload without exposing it as a P1 save', async () => {
    const world = createResidentWorld('RIVERSIDE');
    const envelope = await prepareResidentSave(world, 'p2-session', 1);
    const decoded = await decodeResidentSave(structuredClone(envelope));
    expect(canonicalJson(decoded.payload)).toBe(canonicalJson(world));
    expect(Object.isFrozen(decoded.payload.world.residents[0]!.parentIds)).toBe(true);
    await expect(decodeSave(envelope)).rejects.toThrow();
    for (const version of ['p1-settlement-v1', 'p1-settlement-v2']) {
      const p1 = advanceSettlement(createSettlement('RIVERSIDE', version), 13).state;
      const legacy = await prepareSave(p1, 'p1-session', 1);
      expect((await decodeSave(legacy)).payload).toEqual(p1);
      await expect(decodeResidentSave(legacy)).rejects.toThrow();
    }
  });

  it('rejects independently checksummed broken references, IDs, census, RNG and versions', async () => {
    const original = await prepareResidentSave(createResidentWorld('RIVERSIDE'), 'p2-session', 1);
    const originalBytes = canonicalJson(original.payload);
    const mutations = [
      (s: typeof original.payload) => {
        (s.world.residents[0] as { homeId: number }).homeId = 999;
      },
      (s: typeof original.payload) => {
        (s.world.residents[0] as { householdId: number }).householdId = 1;
      },
      (s: typeof original.payload) => {
        (s.world.residents[0] as { id: number }).id = 18;
      },
      (s: typeof original.payload) => {
        (s.world.settlement as { population: number }).population = 23;
      },
      (s: typeof original.payload) => {
        (s.rng.residents as { state: number }).state = 0;
      },
      (s: typeof original.payload) => {
        (s.allocators as { entity: number }).entity = 11;
      },
      (s: typeof original.payload) => {
        (s as { simulationVersion: string }).simulationVersion = 'p2-future';
      },
      (s: typeof original.payload) => {
        (s as { tick: number }).tick = 1;
      },
      (s: typeof original.payload) => {
        (s.world.residents[0] as { birthEventId: number }).birthEventId = 1;
      },
    ];
    for (const mutate of mutations) {
      const damaged = structuredClone(original);
      mutate(damaged.payload);
      damaged.digest = await digestCanonical(damaged.payload);
      await expect(decodeResidentSave(damaged)).rejects.toThrow('P2 founding world');
    }
    expect(canonicalJson(original.payload)).toBe(originalBytes);
  });

  it('retains checksum and metadata protections for P2', async () => {
    const envelope = await prepareResidentSave(createResidentWorld('THIMBLE'), 'p2-session', 1);
    const damaged = structuredClone(envelope);
    (damaged.payload.world.residents[0] as { givenName: string }).givenName = 'Altered';
    await expect(decodeResidentSave(damaged)).rejects.toThrow('checksum');
    await expect(decodeResidentSave({ ...envelope, generation: 0 })).rejects.toThrow('metadata');
    await expect(decodeResidentSave({ ...envelope, envelopeVersion: 2 })).rejects.toThrow(
      'unsupported',
    );
    await expect(decodeResidentSave({ ...envelope, extra: true })).rejects.toThrow('metadata');
    await expect(decodeResidentSave(null)).rejects.toThrow('complete envelope');
  });

  it('rejects unsafe age calculations and dates before entry', () => {
    const resident = createResidentWorld('RIVERSIDE').world.residents[0]!;
    for (const tick of [-1, 0.5, Number.MAX_SAFE_INTEGER])
      expect(() => worldResidentAgeWeeks(resident, tick)).toThrow();
    expect(worldResidentAgeWeeks({ ...resident, entryTick: 20, ageWeeksAtEntry: 0 }, 20)).toBe(0);
    expect(() => worldResidentAgeWeeks({ ...resident, entryTick: 20 }, 19)).toThrow();
    expect(() => worldResidentAgeWeeks({ ...resident, ageWeeksAtEntry: -1 }, 10)).toThrow();
  });
});
