import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/canonical';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { advanceLivingSettlement, simulateLivingSettlement } from '../../src/sim/living';
import { validateLivingSettlement } from '../../src/sim/living-validation';
import { decodeLivingSave, prepareLivingSave } from '../../src/adapters/living-save';
import { decodeSave, prepareSave } from '../../src/adapters/local-save';
import { decodeResidentSave, prepareResidentSave } from '../../src/adapters/resident-save';
import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalBytes } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import {
  eligibleParent,
  individualDeathThreshold,
  planPersonWeek,
} from '../../src/sim/living-people';
import { createResidentWorld } from '../../src/sim/resident-world';
import { createSettlement } from '../../src/sim/settlement-initial';
import { uniform } from '../../src/sim/rng';
import type { LivingSettlementSnapshot } from '../../src/sim/living-state';

function forcedBoundary(kind: 'births' | 'deaths'): LivingSettlementSnapshot {
  const state = structuredClone(
    advanceLivingSettlement(createLivingSettlement('RIVERSIDE'), 11).state,
  );
  const parents = state.world.residents.filter((resident) => eligibleParent(resident, 12));
  for (let start = 1; start <= 10000; start++) {
    let rng = start,
      deaths = 0,
      births = 0;
    for (const resident of state.world.residents) {
      const result = uniform(rng, 1000);
      rng = result.state;
      if (result.value < individualDeathThreshold(resident.ageWeeksAtEntry + 12, resident.health))
        deaths++;
    }
    if ((kind === 'deaths' && deaths >= 2) || (kind === 'births' && deaths === 0)) {
      for (const _parent of parents) {
        const result = uniform(rng, 1000);
        rng = result.state;
        if (result.value < 15) births++;
      }
      if (kind === 'deaths' || births >= 2) {
        (state.rng.demographics as { state: number }).state = start;
        validateLivingSettlement(state);
        return capture(state);
      }
    }
  }
  throw new Error('No controlled demographic fixture found.');
}

describe('actual individual weeks', () => {
  it('keeps the first yearly run, identities and saved continuation coherent', async () => {
    const initial = createLivingSettlement('RIVERSIDE');
    const before = canonicalJson(initial);
    const first = advanceLivingSettlement(initial, 24).state;
    expect(canonicalJson(initial)).toBe(before);
    const restored = (await decodeLivingSave(await prepareLivingSave(first, 'p2-life', 1))).payload;
    const continued = advanceLivingSettlement(restored, 24).state;
    expect(canonicalJson(continued)).toBe(
      canonicalJson(simulateLivingSettlement('RIVERSIDE', 48).state),
    );
    expect(continued.world.settlement.population).toBe(
      continued.world.residents.filter((person) => person.deathEventId === null).length,
    );
    expect(() => validateLivingSettlement(JSON.parse(canonicalJson(continued)))).not.toThrow();
    expect(Object.isFrozen(continued.world.residents[0]!.activity)).toBe(true);
  }, 30_000);

  it('assigns real births, parentage, identity draws and spare housing to actual people', () => {
    const opening = forcedBoundary('births');
    const before = canonicalJson(opening);
    const state = advanceLivingSettlement(opening, 1).state;
    const children = state.world.residents.filter((resident) => resident.entryTick === 12);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(canonicalJson(opening)).toBe(before);
    expect(state.rng.residents).not.toEqual(opening.rng.residents);
    for (const child of children) {
      expect(child.id).toBeGreaterThanOrEqual(opening.allocators.entity);
      expect(child.ageWeeksAtEntry).toBe(0);
      expect(child.health).toBe(100);
      expect(child.parentIds).toHaveLength(1);
      const parent = state.world.residents.find((resident) => resident.id === child.parentIds[0])!;
      expect(parent.lastBirthTick).toBe(12);
      expect(child.householdId).toBe(parent.householdId);
      expect(child.homeId).not.toBeNull();
      expect(child.activity).toBeNull();
      expect(state.events[child.birthEventId! - 1]!.entityIds).toContain(child.id);
    }
    const next = advanceLivingSettlement(state, 1).state;
    expect(next.lastTick!.people.openingIds).toEqual(
      next.world.residents
        .filter((resident) => resident.deathEventId === null)
        .map((resident) => resident.id),
    );
    expect(next.lastTick!.people.caretakers.flatMap((person) => person.childIds)).toEqual(
      expect.arrayContaining(children.map((child) => child.id)),
    );
    expect(children.every((child) => !next.lastTick!.people.workers.includes(child.id))).toBe(true);
    expect(next.world.settlement.households).toBe(6);
    const season = advanceLivingSettlement(state, 12).state;
    const recentParents = children.map((child) => child.parentIds[0]!);
    expect(
      season.lastTick!.people.birthTrials.some((trial) => recentParents.includes(trial.parentId)),
    ).toBe(false);
  });

  it('shares a limited ration pool in rotating order and accounts for each health outcome', () => {
    const opening = structuredClone(simulateLivingSettlement('RIVERSIDE', 10).state);
    // Controlled, balanced opening-stock input; no production UI can inject it.
    const ledger = opening.lastTick as unknown as {
      opening: { food: number };
      closing: { food: number };
    };
    ledger.opening.food -= ledger.closing.food;
    ledger.closing.food = 0;
    (opening.world.settlement as { food: number }).food = 0;
    validateLivingSettlement(opening);
    const state = advanceLivingSettlement(capture(opening), 1).state;
    expect(state.lastTick!.food.consumed).toBe(12);
    expect(state.lastTick!.food.deficit).toBe(12);
    expect(
      state.lastTick!.people.health.filter((entry) => entry.ration).map((entry) => entry.id),
    ).toEqual(Array.from({ length: 12 }, (_, index) => index + 27));
    expect(state.world.settlement.health).toBe(90);
    expect(
      state
        .lastTick!.people.health.filter((entry) => !entry.ration)
        .every((entry) => entry.before === 100 && entry.after === 80),
    ).toBe(true);
    expect(
      state
        .lastTick!.people.health.filter((entry) => entry.ration)
        .every((entry) => entry.after === 100),
    ).toBe(true);
  });

  it('retains the actual victims, age/health risk and history after deaths', () => {
    const initial = forcedBoundary('deaths');
    const state = advanceLivingSettlement(initial, 1).state;
    const dead = state.world.residents.filter((resident) => resident.deathEventId !== null);
    expect(dead.length).toBeGreaterThanOrEqual(2);
    for (const person of dead) {
      expect(state.world.entities[person.id - 1]!.retired).toBe(true);
      expect(state.events[person.deathEventId! - 1]!.entityIds).toContain(person.id);
      expect(
        state.lastTick!.people.deathTrials.find((trial) => trial.id === person.id)!.draw,
      ).toBeLessThan(5);
    }
    const after = advanceLivingSettlement(state, 1).state;
    expect(
      after.lastTick!.people.openingIds.every((id) => !dead.some((person) => person.id === id)),
    ).toBe(true);
    expect(after.world.residents.filter((resident) => resident.deathEventId !== null)).toEqual(
      dead,
    );
  });

  it('rejects independently checksummed corruption in older death evidence', async () => {
    const original = await prepareLivingSave(
      advanceLivingSettlement(forcedBoundary('deaths'), 2).state,
      'historic-life',
      1,
    );
    const changes: Array<(row: Record<string, unknown>) => void> = [
      (row) => {
        row.homeId = 999999;
      },
      (row) => {
        row.ration = 'yes';
      },
      (row) => {
        row.before = 0;
      },
      (row) => {
        row.caregiverId = 999999;
      },
    ];
    for (const change of changes) {
      const altered = structuredClone(original);
      const death = altered.payload.events.find((event) => event.type === 'deaths')!;
      expect(death.tick).toBeLessThan(altered.payload.tick);
      change((death.facts.residents as Record<string, unknown>[])[0]!);
      altered.digest = await digestCanonical(altered.payload);
      await expect(decodeLivingSave(altered)).rejects.toThrow();
    }
  });

  it('admits or rejects a whole person/economic week including all RNG and IDs', () => {
    const initial = createLivingSettlement('RIVERSIDE');
    const candidate = advanceLivingSettlement(initial, 1).state;
    const result = advanceLivingSettlement(initial, 1, {
      maxEvents: initial.events.length,
      maxBytes: 16777216,
    });
    expect(result.state).toBe(initial);
    expect(result.advanced).toBe(0);
    expect(result.halted).toBe('event-limit');
    expect(result.state.rng).toEqual(initial.rng);
    expect(result.state.allocators).toEqual(initial.allocators);
    const bytes = advanceLivingSettlement(initial, 1, {
      maxEvents: 50000,
      maxBytes: canonicalBytes(candidate).length - 1,
    });
    expect(bytes.state).toBe(initial);
    expect(bytes.halted).toBe('payload-limit');
  });

  it('rejects altered identity, reference and ledger facts even with a valid checksum', async () => {
    const original = await prepareLivingSave(
      advanceLivingSettlement(forcedBoundary('births'), 1).state,
      'p2-life',
      1,
    );
    const changes = [
      (s: typeof original.payload) => {
        (s.world.residents[0]!.traits as { caution: number }).caution++;
      },
      (s: typeof original.payload) => {
        (s.world.residents[0] as { householdId: number }).householdId = 999;
      },
      (s: typeof original.payload) => {
        (s.world.residents[0] as { homeId: number }).homeId = 999;
      },
      (s: typeof original.payload) => {
        (s.rng.residents as { state: number }).state = 0;
      },
      (s: typeof original.payload) => {
        (s.lastTick!.people.health[0] as { ration: boolean }).ration = false;
      },
      (s: typeof original.payload) => {
        (s.lastTick!.people.workers as number[])[0] = s.world.residents.at(-1)!.id;
      },
      (s: typeof original.payload) => {
        (s.world.residents.at(-1)!.parentIds as number[])[0] = 999;
      },
      (s: typeof original.payload) => {
        (s.events[0]!.facts.householdRecords as { homeId: number }[])[0]!.homeId = 999;
      },
      (s: typeof original.payload) => {
        (s.world.residents.at(-1) as { birthEventId: number }).birthEventId = 1;
      },
    ];
    for (const change of changes) {
      const altered = structuredClone(original);
      change(altered.payload);
      altered.digest = await digestCanonical(altered.payload);
      await expect(decodeLivingSave(altered)).rejects.toThrow();
    }
    expect(await decodeLivingSave(original)).toEqual(original);
  });

  it('keeps all three original codecs separate from the evolving world', async () => {
    const current = await prepareLivingSave(createLivingSettlement('RIVERSIDE'), 'life', 1);
    await expect(decodeSave(current)).rejects.toThrow();
    await expect(decodeResidentSave(current)).rejects.toThrow();
    for (const version of ['p1-settlement-v1', 'p1-settlement-v2'])
      await expect(
        decodeLivingSave(await prepareSave(createSettlement('RIVERSIDE', version), 'p1', 1)),
      ).rejects.toThrow();
    await expect(
      decodeLivingSave(await prepareResidentSave(createResidentWorld('RIVERSIDE'), 'founding', 1)),
    ).rejects.toThrow();
  });

  it('reserves care before economic work and excludes children, frail adults and seniors', () => {
    const state = structuredClone(createLivingSettlement('RIVERSIDE'));
    const people = state.world.residents as unknown as {
      id: number;
      ageWeeksAtEntry: number;
      health: number;
      parentIds: number[];
    }[];
    people[0]!.ageWeeksAtEntry = 2 * 48;
    people[0]!.parentIds = [people[1]!.id];
    people[2]!.health = 10;
    people[3]!.ageWeeksAtEntry = 60 * 48;
    const plan = planPersonWeek(state);
    expect(plan.caretakers[0]).toEqual({ id: people[1]!.id, childIds: [people[0]!.id] });
    expect(plan.workers.some((id) => people.slice(0, 4).some((person) => person.id === id))).toBe(
      false,
    );
    expect(individualDeathThreshold(100 * 48, 100)).toBe(1000);
    expect(individualDeathThreshold(70 * 48, 100)).toBeGreaterThan(
      individualDeathThreshold(30 * 48, 100),
    );
  });

  it('keeps 100 seeded first years and real known-parent birth intervals coherent', () => {
    for (let index = 0; index < 100; index++) {
      const state = simulateLivingSettlement(`LIFE_${index}`, 48).state;
      expect(state.tick).toBe(48);
      expect(state.allocators.entity).toBe(state.world.entities.length + 1);
      expect(state.world.settlement.population).toBeGreaterThan(0);
      expect(state.world.residents.length).toBeGreaterThanOrEqual(24);
      expect(
        state.world.residents
          .filter((person) => person.birthEventId !== null)
          .every((person) => person.parentIds.length === 1 && person.parentIds[0]! < person.id),
      ).toBe(true);
    }
  }, 120000);
});
