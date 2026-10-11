import { describe, expect, it } from 'vitest';
import { residentWorkHistory } from '../../src/controller/work-history';
import { createLivingSettlement } from '../../src/sim/living-initial';
import { advanceLivingSettlement } from '../../src/sim/living';
import type { ResidentActivity } from '../../src/sim/living-state';
import { createSettlement } from '../../src/sim/settlement-initial';
import { canonicalJson } from '../../src/sim/canonical';
import { prepareLivingSave, decodeLivingSave } from '../../src/adapters/living-save';

// Independent oracle: observe the actual assignment of every opening person each week,
// rather than reconstructing it from archive change records as the reader does.
type Observed = { activity: ResidentActivity; startTick: number; throughTick: number };
const observed = new Map<number, Observed[]>();
let world = createLivingSettlement('TERRAIN_005');
for (let tick = 1; tick <= 1000; tick++) {
  world = advanceLivingSettlement(world, 1).state;
  for (const id of world.lastTick!.people.openingIds) {
    const activity = world.world.residents.find((person) => person.id === id)!.activity!;
    const rows = observed.get(id) ?? [];
    const last = rows.at(-1);
    if (
      last &&
      last.activity.role === activity.role &&
      last.activity.targetId === activity.targetId
    )
      last.throughTick = tick;
    else rows.push({ activity: { ...activity }, startTick: tick, throughTick: tick });
    observed.set(id, rows);
  }
}

describe('recorded weekly assignment histories', () => {
  it('matches the independent weekly ledger for every retained resident over 1,000 weeks', () => {
    for (const person of world.world.residents) {
      const history = residentWorkHistory(world, person.id)!;
      const oracle = observed.get(person.id) ?? [];
      expect(
        history.spans.map((span) => ({
          activity: span.activity,
          startTick: span.start.tick,
          throughTick: span.throughTick,
        })),
      ).toEqual(oracle);
      for (const [role, total] of Object.entries(history.totals))
        expect(total).toBe(
          oracle
            .filter((row) => row.activity.role === role)
            .reduce((sum, row) => sum + row.throughTick - row.startTick + 1, 0),
        );
      const longest = oracle.reduce<Observed | null>(
        (best, row) =>
          !best || row.throughTick - row.startTick > best.throughTick - best.startTick ? row : best,
        null,
      );
      expect(history.longest?.start.tick).toBe(longest?.startTick);
      for (let index = 0; index < history.spans.length; index++) {
        const span = history.spans[index]!;
        expect(span.start.type).toBe('work_changed');
        expect(span.start.facts.assignments).toContainEqual(
          expect.objectContaining({ id: person.id, after: span.activity }),
        );
        expect(span.weeks).toBe(span.throughTick - span.start.tick + 1);
        expect(span.end?.id ?? null).toBe(
          history.spans[index + 1]?.start.id ?? person.deathEventId,
        );
      }
    }
  });

  it('starts founders in week one and newborns after their actual birth week', () => {
    const founder = world.world.residents.find((person) => person.birthEventId === null)!;
    expect(residentWorkHistory(world, founder.id)!.spans[0]!.start.tick).toBe(1);
    const child = world.world.residents.find((person) => person.birthEventId !== null)!;
    const birth = world.events[child.birthEventId! - 1]!;
    expect(residentWorkHistory(world, child.id)!.spans[0]!.start.tick).toBe(birth.tick + 1);
  });

  it('keeps target changes separate even when the weekly role is unchanged', () => {
    const pair = [...observed.entries()].find(([, rows]) =>
      rows.some(
        (row, index) =>
          index > 0 &&
          rows[index - 1]!.activity.role === row.activity.role &&
          rows[index - 1]!.activity.targetId !== row.activity.targetId,
      ),
    );
    expect(pair).toBeDefined();
    const [id, rows] = pair!;
    expect(residentWorkHistory(world, id)!.spans).toHaveLength(rows.length);
    const tied = residentWorkHistory(
      advanceLivingSettlement(createLivingSettlement('RIVERSIDE'), 6).state,
      25,
    )!;
    expect(tied.spans.map((span) => span.weeks)).toEqual([2, 2, 2]);
    expect(tied.longest!.start.tick).toBe(1);
  });

  it('includes assignment in the death week and freezes the history after death', () => {
    const deceased = world.world.residents.filter((person) => person.deathEventId !== null);
    expect(deceased.length).toBeGreaterThan(0);
    const future = advanceLivingSettlement(world, 3).state;
    for (const person of deceased) {
      const history = residentWorkHistory(world, person.id)!;
      const last = history.spans.at(-1)!;
      expect(last.throughTick).toBe(history.death!.tick);
      expect(last.end).toEqual(history.death);
      expect(residentWorkHistory(future, person.id)).toEqual(history);
    }
  });

  it('leaves canonical state and complete saved continuation unchanged', async () => {
    const before = canonicalJson(world);
    for (const person of world.world.residents) residentWorkHistory(world, person.id);
    expect(canonicalJson(world)).toBe(before);
    const restored = (
      await decodeLivingSave(
        JSON.parse(JSON.stringify(await prepareLivingSave(world, 'assignment-reader', 1))),
      )
    ).payload;
    expect(canonicalJson(restored)).toBe(before);
    const continued = advanceLivingSettlement(world, 4).state;
    const resumed = advanceLivingSettlement(restored, 4).state;
    expect(canonicalJson(resumed)).toBe(canonicalJson(continued));
    for (const person of continued.world.residents)
      expect(residentWorkHistory(resumed, person.id)).toEqual(
        residentWorkHistory(continued, person.id),
      );
  });

  it('keeps unrecorded opening work, missing subjects and aggregate P1 worlds explicit', () => {
    expect(residentWorkHistory(createLivingSettlement('RIVERSIDE'), 17)!.spans).toEqual([]);
    expect(residentWorkHistory(world, 999999)).toBeNull();
    for (const version of ['p1-settlement-v1', 'p1-settlement-v2'])
      expect(residentWorkHistory(createSettlement('RIVERSIDE', version), 17)).toBeNull();
  });
});
