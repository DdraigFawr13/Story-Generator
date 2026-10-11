import { describe, expect, it } from 'vitest';
import { residentLineage, lineageLabel } from '../../src/controller/family';
import { simulateLivingSettlement } from '../../src/sim/living';
import { createSettlement } from '../../src/sim/settlement-initial';
import { canonicalJson } from '../../src/sim/canonical';

const world = simulateLivingSettlement('TERRAIN_005', 1000).state;
const riverside = simulateLivingSettlement('RIVERSIDE', 1000).state;
const grandchild = world.world.residents.find((person) =>
  person.parentIds.some(
    (id) => world.world.residents.find((parent) => parent.id === id)!.parentIds.length,
  ),
)!;
const parent = world.world.residents.find((person) => person.id === grandchild.parentIds[0])!;
const grandparent = world.world.residents.find((person) => person.id === parent.parentIds[0])!;

describe('source-grounded family lineages', () => {
  it('connects an actual three-generation chain to the birth that proves each edge', () => {
    expect(grandchild).toBeDefined();
    const family = residentLineage(world, grandchild.id)!;
    expect(family.ancestors.map((row) => [row.person.id, row.generation, row.birth.id])).toEqual([
      [parent.id, 1, grandchild.birthEventId],
      [grandparent.id, 2, parent.birthEventId],
    ]);
    for (const row of family.ancestors) {
      expect(row.child.parentIds).toContain(row.parent.id);
      expect(row.birth.type).toBe('births');
      expect(row.birth.entityIds).toContain(row.child.id);
      expect(row.birth.entityIds).toContain(row.parent.id);
    }
    expect(lineageLabel('ancestors', 2)).toBe('Known grandparent');
    expect(lineageLabel('descendants', 2)).toBe('Known grandchild');
  });

  it('retains every known descendant, deceased identities and the intermediate parent', () => {
    const family = residentLineage(world, grandparent.id)!;
    expect(family.descendants.find((row) => row.person.id === grandchild.id)).toMatchObject({
      generation: 2,
      parent: { id: parent.id },
      child: { id: grandchild.id },
      birth: { id: grandchild.birthEventId },
    });
    const deceasedChild = riverside.world.residents.find((person) => person.id === 72)!;
    expect(deceasedChild.deathEventId).not.toBeNull();
    expect(
      residentLineage(riverside, deceasedChild.parentIds[0]!)!.descendants.find(
        (row) => row.person.id === deceasedChild.id,
      )!.person,
    ).toEqual(deceasedChild);
    expect(family.descendants.some((row) => row.person.id === grandparent.id)).toBe(false);
    expect(new Set(family.descendants.map((row) => row.person.id)).size).toBe(
      family.descendants.length,
    );
    for (const row of family.descendants) {
      let person = row.person;
      for (let generation = 0; generation < row.generation; generation++)
        person = world.world.residents.find((item) => item.id === person.parentIds[0])!;
      expect(person.id).toBe(grandparent.id);
      expect(row.child.parentIds).toContain(row.parent.id);
    }
  });

  it('does not infer ancestors or relatives from shared household names', () => {
    const family = residentLineage(world, grandparent.id)!;
    expect(family.ancestors).toEqual([]);
    const peers = world.world.residents.filter(
      (person) =>
        person.id !== grandparent.id &&
        person.householdName === grandparent.householdName &&
        person.birthEventId === null,
    );
    expect(peers.length).toBeGreaterThan(0);
    for (const person of peers)
      expect(family.descendants.some((row) => row.person.id === person.id)).toBe(false);
  });

  it('uses stable generation/ID order without mutating the authoritative world', () => {
    const before = canonicalJson(world);
    const rows = residentLineage(world, grandparent.id)!.descendants;
    const reordered = {
      ...world,
      world: { ...world.world, residents: [...world.world.residents].reverse() },
    };
    expect(residentLineage(reordered, grandparent.id)!.descendants).toEqual(rows);
    expect(canonicalJson(world)).toBe(before);
  });

  it('keeps missing subjects and both aggregate world versions out of named lineages', () => {
    expect(residentLineage(world, 999999)).toBeNull();
    for (const version of ['p1-settlement-v1', 'p1-settlement-v2'])
      expect(residentLineage(createSettlement('RIVERSIDE', version), 17)).toBeNull();
  });
});
