import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/canonical';
import { simulateLivingSettlement } from '../../src/sim/living';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { createSettlement } from '../../src/sim/settlement-initial';
import { householdDossier } from '../../src/controller/households';
import { ALL_RECORDS, filterChronicle } from '../../src/controller/chronicle-filters';

let sample: ReturnType<typeof simulateLivingSettlement>['state'];
beforeAll(() => {
  sample = simulateLivingSettlement('LIVES_4', 1000).state;
}, 60000);

describe('factual household history', () => {
  it('keeps P1 aggregates and unknown household identities out of personal projections', () => {
    expect(householdDossier(createSettlement('RIVERSIDE'), 11)).toBeNull();
    expect(householdDossier(sample, 99999)).toBeNull();
  });
  it('records founders and shared homes without inventing kinship', () => {
    const world = createLivingSettlement('RIVERSIDE');
    const dossier = householdDossier(world, 11)!;
    expect(dossier.founders).toHaveLength(4);
    expect(dossier.born).toEqual([]);
    expect(dossier.relations).toEqual([]);
    expect(dossier.homes).toHaveLength(1);
    expect(dossier.homes[0]!.members.map((person) => person.id)).toEqual([17, 18, 19, 20]);
    expect(dossier.records.map((record) => record.eventId)).toEqual([1]);
    expect(dossier.paragraphs[0]!.tokens.map((token) => token.text).join('')).toContain(
      'do not establish earlier kinship',
    );
  });
  it('retains deceased members, real births, known relations and a naturally retired household', () => {
    const retired = sample.world.households.find(
      (household) => sample.world.entities[household.id - 1]!.retired,
    )!;
    expect(retired).toBeDefined();
    const dossier = householdDossier(sample, retired.id)!;
    expect(dossier.living).toEqual([]);
    expect(dossier.members.length).toBeGreaterThan(0);
    expect(dossier.deceased).toHaveLength(dossier.members.length);
    expect(dossier.homes).toEqual([]);
    for (const household of sample.world.households) {
      const current = householdDossier(sample, household.id)!;
      for (const relation of current.relations) {
        expect(relation.child.parentIds).toContain(relation.parent.id);
        expect(relation.child.birthEventId).not.toBeNull();
      }
      for (const person of current.born)
        expect(
          current.records.some(
            (record) =>
              record.eventId === person.birthEventId && record.text.includes(`(#${person.id})`),
          ),
        ).toBe(true);
      for (const person of current.deceased)
        expect(
          current.records.some(
            (record) =>
              record.eventId === person.deathEventId && record.text.includes(`(#${person.id})`),
          ),
        ).toBe(true);
    }
  });
  it('projects only actual household participants from grouped evidence', () => {
    let grouped = 0;
    for (const household of sample.world.households) {
      const dossier = householdDossier(sample, household.id)!;
      const memberIds = new Set(dossier.members.map((person) => person.id));
      for (const record of dossier.records) {
        const event = sample.events[record.eventId - 1]!;
        expect(record.tick).toBe(event.tick);
        const ids = [...record.text.matchAll(/\(#(\d+)\)/g)].map((match) => Number(match[1]));
        for (const id of ids) expect(memberIds.has(id)).toBe(true);
        if (event.type === 'work_changed' || event.type === 'home_changed') {
          const expected = (event.facts.assignments as { id: number }[])
            .filter((row) => memberIds.has(row.id))
            .map((row) => row.id);
          expect(ids).toEqual(expected);
          if (expected.length < (event.facts.assignments as unknown[]).length) grouped++;
        }
      }
      for (const paragraph of dossier.paragraphs)
        for (const id of paragraph.sourceIds) expect(sample.events[id - 1]).toBeDefined();
    }
    expect(grouped).toBeGreaterThan(0);
  });
});

describe('complete archive filtering', () => {
  it('combines actual actors, households, categories and canonical importance', () => {
    expect(filterChronicle(sample, ALL_RECORDS)).toEqual(sample.events);
    const person = sample.world.residents.find((person) => person.birthEventId !== null)!;
    const results = filterChronicle(sample, {
      personId: person.id,
      householdId: person.householdId,
      category: 'births',
      importance: 'major',
    });
    expect(results.length).toBeGreaterThan(0);
    for (const event of results) {
      expect(event.entityIds).toContain(person.id);
      expect(event.type).toBe('births');
      expect(event.importance).toBe('major');
    }
    expect(results.some((event) => event.id < sample.events.length - 200)).toBe(true);
  });
  it('rejects invalid/nonresident subject IDs and leaves unrelated sources available in the archive', () => {
    expect(
      filterChronicle(sample, { ...ALL_RECORDS, personId: sample.world.households[0]!.id }),
    ).toEqual([]);
    expect(filterChronicle(sample, { ...ALL_RECORDS, householdId: 99999 })).toEqual([]);
    expect(
      filterChronicle(createSettlement('RIVERSIDE'), { ...ALL_RECORDS, personId: 17 }),
    ).toEqual([]);
    const person = sample.world.residents.find((person) => person.birthEventId !== null)!;
    const results = filterChronicle(sample, {
      ...ALL_RECORDS,
      personId: person.id,
      category: 'births',
    });
    const causes = results.flatMap((event) => event.causes);
    expect(causes.length).toBeGreaterThan(0);
    for (const id of causes) expect(sample.events[id - 1]).toBeDefined();
  });
  it('keeps household reading and all filter combinations wholly non-mutating', () => {
    const before = canonicalJson(sample);
    for (const household of sample.world.households) {
      householdDossier(sample, household.id);
      filterChronicle(sample, { ...ALL_RECORDS, householdId: household.id });
    }
    for (const person of sample.world.residents)
      filterChronicle(sample, { ...ALL_RECORDS, personId: person.id });
    expect(canonicalJson(sample)).toBe(before);
  });
});
