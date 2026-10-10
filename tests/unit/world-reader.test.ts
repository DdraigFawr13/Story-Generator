import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/sim/canonical';
import { advanceWorld, createWorld, isIndividualWorld, worldEconomy } from '../../src/sim/world';
import { createSettlement } from '../../src/sim/settlement-initial';
import { simulateLivingSettlement } from '../../src/sim/living';
import { createResidentWorld } from '../../src/sim/resident-world';
import { decodeResidentSave, prepareResidentSave } from '../../src/adapters/resident-save';
import { decodeWorldSave, prepareWorldSave } from '../../src/adapters/world-save';
import { residentDossier, residentAge, ageLabel } from '../../src/controller/residents';
import { buildRecap } from '../../src/controller/recaps';
import { populationMarkers } from '../../src/controller/population-markers';

const sample = simulateLivingSettlement('RIVERSIDE', 1000).state;
describe('playable world versions', () => {
  it.each(['p1-settlement-v1', 'p1-settlement-v2', 'p2-settlement-v1'])(
    'routes complete %s saves and continued weeks without migration',
    async (version) => {
      const initial =
        version === 'p2-settlement-v1'
          ? createWorld('RIVERSIDE')
          : createSettlement('RIVERSIDE', version);
      const first = advanceWorld(initial, 57).state;
      const restored = (
        await decodeWorldSave(
          JSON.parse(JSON.stringify(await prepareWorldSave(first, 'reader', 1))),
        )
      ).payload;
      expect(restored.simulationVersion).toBe(version);
      expect(canonicalJson(restored)).toBe(canonicalJson(first));
      expect(canonicalJson(advanceWorld(restored, 80).state)).toBe(
        canonicalJson(advanceWorld(initial, 137).state),
      );
      expect(worldEconomy(restored).economy.seasonMultipliers[3]).toBe(
        version === 'p1-settlement-v1' ? 400 : 0,
      );
    },
  );
  it('keeps internal founding-only payloads out of playable save routing', async () => {
    const envelope = await prepareResidentSave(createResidentWorld('RIVERSIDE'), 'foundation', 1);
    await expect(decodeResidentSave(envelope)).resolves.toBeDefined();
    await expect(decodeWorldSave(envelope)).rejects.toThrow('unsupported');
    expect(isIndividualWorld(createWorld('RIVERSIDE'))).toBe(true);
    expect(residentDossier(createSettlement('RIVERSIDE'), 17)).toBeNull();
    expect(residentDossier(sample, 999999)).toBeNull();
  });
});

describe('factual resident histories', () => {
  it('begins a founder at the known entry age with unknown birth and parentage', () => {
    const world = createWorld('RIVERSIDE'),
      dossier = residentDossier(world, 17)!;
    expect(dossier.entry.type).toBe('founding');
    expect(dossier.parents).toEqual([]);
    expect(dossier.person.birthEventId).toBeNull();
    expect(dossier.ageWeeks).toBe(dossier.person.ageWeeksAtEntry);
    expect(dossier.records.map((record) => record.eventId)).toEqual([1]);
    expect(dossier.paragraphs[0]!.tokens.map((token) => token.text).join('')).toContain(
      'earlier life are unrecorded',
    );
    expect(ageLabel(49)).toBe('1 year and 1 week');
  });
  it('links only known birth parentage, real children and their retained records', () => {
    const born = sample.world.residents.filter((person) => person.birthEventId !== null);
    expect(born.length).toBeGreaterThan(0);
    for (const child of born) {
      const dossier = residentDossier(sample, child.id)!;
      expect(dossier.entry.type).toBe('births');
      expect(dossier.parents.map((parent) => parent.id)).toEqual(child.parentIds);
      expect(dossier.parents).toHaveLength(1);
      const parent = residentDossier(sample, child.parentIds[0]!)!;
      expect(parent.children.map((person) => person.id)).toContain(child.id);
      expect(
        parent.records.some(
          (record) => record.eventId === child.birthEventId && record.text.includes(`#${child.id}`),
        ),
      ).toBe(true);
      expect(dossier.paragraphs[0]!.tokens.map((token) => token.text).join('')).toContain(
        'further parentage is unknown',
      );
    }
  });
  it('caps deceased age at the real death and reads older risk/health evidence', () => {
    const dead = sample.world.residents.filter((person) => person.deathEventId !== null);
    expect(dead.length).toBeGreaterThan(0);
    const later = advanceWorld(sample, 2).state;
    for (const person of dead) {
      const dossier = residentDossier(sample, person.id)!;
      expect(dossier.ageWeeks).toBe(
        person.ageWeeksAtEntry + dossier.death!.tick - person.entryTick,
      );
      expect(residentAge(later, person)).toBe(dossier.ageWeeks);
      expect(dossier.healthTick).toBe(dossier.death!.tick);
      expect(dossier.deathHealth!.after).toBe(person.health);
      expect(dossier.deathHealth!.draw).toBeLessThan(dossier.deathHealth!.threshold);
      expect(dossier.records.some((record) => record.eventId === person.deathEventId)).toBe(true);
    }
  });
  it('resolves assignment, home and known-relation records to actual retained evidence', () => {
    let relationLosses = 0,
      assignments = 0;
    for (const person of sample.world.residents) {
      const dossier = residentDossier(sample, person.id)!;
      for (const record of dossier.records) {
        const event = sample.events[record.eventId - 1]!;
        expect(record.tick).toBe(event.tick);
        if (record.text.startsWith('Weekly assignment:')) {
          assignments++;
          expect(
            (event.facts.assignments as { id: number }[]).some((row) => row.id === person.id),
          ).toBe(true);
        }
        if (record.text.startsWith('Death recorded for known')) {
          relationLosses++;
          expect(
            [...dossier.parents, ...dossier.children].some(
              (relative) => relative.deathEventId === event.id,
            ),
          ).toBe(true);
        }
      }
      for (const paragraph of dossier.paragraphs)
        for (const id of paragraph.sourceIds) expect(sample.events[id - 1]).toBeDefined();
    }
    expect(assignments).toBeGreaterThan(0);
    expect(relationLosses).toBeGreaterThan(0);
  });
  it('keeps inspection, prose, household projection and home dots completely read-only', () => {
    const before = canonicalJson(sample);
    for (let pass = 0; pass < 2; pass++) {
      for (const person of sample.world.residents) residentDossier(sample, person.id);
      buildRecap(sample, { kind: 'yearly', endTick: 48 });
      const dots = populationMarkers({ ...sample.world.map, ...sample.world });
      expect(dots.markers.map((marker) => marker.tile)).toEqual(
        sample.world.residents
          .filter((person) => person.deathEventId === null)
          .slice(0, 96)
          .map((person) => person.tile),
      );
    }
    expect(canonicalJson(sample)).toBe(before);
  });
});
