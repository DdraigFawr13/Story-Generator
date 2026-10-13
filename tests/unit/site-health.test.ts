import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  beginChildbirth,
  embark,
  leaveSite,
  rollChildbirth,
  RngStream,
  runHealthDay,
  sitePopulation,
  stepSite,
  voiceOf,
  type Condition,
  type Id,
  type WorldState,
} from '../../src/engine';
import { base, biggest } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;

function fresh() {
  const world = structuredClone(base());
  const active = embark(world, C, biggest(world).id);
  const { emit, label } = voiceOf(world, C, active);
  // Nobody has a job unless a test gives one; no herbs unless asked.
  for (const id of active.residents) world.people.get(id)!.detail!.jobId = undefined;
  const day = () => {
    world.day += 1;
    runHealthDay(world, C, active, emit, label);
  };
  return { world, active, emit, label, day };
}
const detailOf = (world: WorldState, id: Id) => world.people.get(id)!.detail!;
const householdOf = (world: WorldState, id: Id) => world.people.get(id)!.family.householdId;
const wound = (world: WorldState, defId: string, severity: number): Condition => ({
  defId,
  severity,
  sinceDay: world.day,
  peak: severity,
});

describe('health', () => {
  it('passes illness only between people in the same household or on the same job', () => {
    const { world, active } = fresh();
    // One sure-fire ailment with no other source, so only contact can spread it.
    const chill = { ...C.ailments[0]!, infectivity: 0.5, sources: {} };
    const content = { ...C, ailments: [chill], diseases: [] };
    const { emit, label } = voiceOf(world, content, active);
    const run = () => {
      world.day += 1;
      runHealthDay(world, content, active, emit, label);
    };
    const families = [...active.households.values()].filter((h) => h.members.length >= 2);
    const home = families[0]!;
    const [a, b] = home.members as [Id, Id];
    const others = active.residents.filter((id) => householdOf(world, id) !== home.id);
    const z = others[0]!;
    const x = others.find((id) => householdOf(world, id) !== householdOf(world, z))!;
    detailOf(world, a).jobId = 'farm';
    detailOf(world, z).jobId = 'farm';
    detailOf(world, x).jobId = 'fell';
    detailOf(world, a).conditions.push({
      defId: 'chill',
      ailment: 'chill',
      severity: 20,
      sinceDay: world.day - 3,
      stage: 'sick',
      onsetDay: world.day - 3,
      untilDay: world.day + 400,
      peak: 20,
    });
    // Everyone who is ever ill, over 40 days (a case lasts under 11 days).
    const sick = new Set<Id>();
    for (let d = 0; d < 40; d += 1) {
      run();
      for (const id of active.residents) {
        if (detailOf(world, id).conditions.some((c) => c.ailment === 'chill')) sick.add(id);
      }
    }
    expect(sick.has(a)).toBe(true);
    expect(sick.has(b)).toBe(true); // household
    expect(sick.has(z)).toBe(true); // same job
    expect(sick.has(x)).toBe(false); // neither
    // Everyone sick lives with the first case or with the co-worker.
    const near = new Set([home.id, householdOf(world, z)]);
    expect(x === undefined || !near.has(householdOf(world, x))).toBe(true);
    for (const id of sick) expect(near.has(householdOf(world, id))).toBe(true);
  });

  it('a healer lowers deaths from wounds and in childbirth', () => {
    const run = (healers: boolean) => {
      const { world, active, day } = fresh();
      active.stock.set('herbs', 1e6);
      const ids = [...active.residents];
      const hurt = ids.slice(0, Math.floor(ids.length * 0.4));
      const tenders = ids.slice(hurt.length, hurt.length + Math.ceil(ids.length * 0.15));
      for (const id of hurt)
        detailOf(world, id).conditions.push(wound(world, 'critical-wound', 70));
      if (healers) for (const id of tenders) detailOf(world, id).jobId = C.steward.roles.heal;
      for (let d = 0; d < 40; d += 1) day();
      return hurt.filter((id) => world.people.get(id)!.died !== undefined).length;
    };
    const untended = run(false);
    const tended = run(true);
    expect(untended).toBeGreaterThan(0);
    expect(tended).toBeLessThan(untended);

    // The same 5000 births with and without a healer.
    const births = (tendedBirth: boolean) => {
      const rng = RngStream.detached('birth', 'births');
      let died = 0;
      for (let i = 0; i < 5000; i += 1) if (rollChildbirth(C, tendedBirth, rng)) died += 1;
      return died;
    };
    expect(births(true)).toBeLessThan(births(false));

    // A mother in labour is tended exactly when a healer is on her feet.
    for (const healer of [false, true]) {
      const { world, active, emit, label } = fresh();
      const [mother, nurse] = active.residents.slice(0, 2) as [Id, Id];
      if (healer) detailOf(world, nurse).jobId = C.steward.roles.heal;
      const died = beginChildbirth(world, C, active, world.people.get(mother)!, emit, label);
      if (!died) {
        const cond = detailOf(world, mother).conditions.find((c) => c.defId === 'childbirth')!;
        expect(cond.tended).toBe(healer);
      }
    }
  });

  it('keeps the dead dead and takes them out of the site counts', () => {
    // A site that has a notable living in it, so one of the dead keeps a record.
    const world = structuredClone(base());
    const home = [...world.people.values()].find(
      (p) =>
        p.died === undefined && p.siteId != null && sitePopulation(world.sites.get(p.siteId)!) > 20,
    )!;
    const active = embark(world, C, home.siteId!);
    const { emit, label } = voiceOf(world, C, active);
    const day = () => {
      world.day += 1;
      runHealthDay(world, C, active, emit, label);
    };
    const before = sitePopulation(world.sites.get(active.siteId)!);
    const promoted = active.residents.find((id) => active.promoted.includes(id))!;
    const notable = active.residents.find((id) => !active.promoted.includes(id));
    expect(notable).toBeDefined();
    const killed = [promoted, notable!];
    for (const id of killed) detailOf(world, id).conditions.push(wound(world, 'bad-heart', 100));
    day();
    for (const id of killed) {
      const p = world.people.get(id)!;
      expect(active.residents).not.toContain(id);
      expect(active.dead).toContain(id);
      expect(p.died).toBe(world.params.historyYears);
      expect(p.causeOfDeath).toBe('illness');
      expect(world.events.find((e) => e.id === p.deathEvent)!.type).toBe(C.health.events.died);
      // They leave their household, whose head is always someone living.
      for (const h of active.households.values()) {
        expect(h.members).not.toContain(id);
        expect(active.residents).toContain(h.head);
      }
    }
    const firstAfter = world.events.length;
    const where = killed.map((id) => detailOf(world, id).pos);
    for (let d = 0; d < 30; d += 1) stepSite(world, C);
    for (const id of killed) {
      expect(active.residents).not.toContain(id);
      // Only their funeral (M3.7) may name them.
      const named = world.events.slice(firstAfter).filter((e) => e.actors.includes(id));
      expect(named.filter((e) => e.type !== C.society.events.funeral)).toEqual([]);
    }
    expect(killed.map((id) => detailOf(world, id).pos)).toEqual(where);
    leaveSite(world, C);
    expect(sitePopulation(world.sites.get(active.siteId)!)).toBeLessThan(before);
    expect(world.people.has(promoted)).toBe(false);
    const record = world.people.get(notable!)!;
    expect(record.died).toBeDefined();
    expect(record.causeOfDeath).toBe('illness');
    expect(record.detail).toBeUndefined();
  });
});
