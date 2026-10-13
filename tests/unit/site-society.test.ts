import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  bandOfAge,
  embark,
  killPerson,
  leaveSite,
  runSocietyMorning,
  serveSentences,
  stepSite,
  voiceOf,
  type Id,
  type Person,
  type Punishment,
  type SiteContent,
} from '../../src/engine';
import { biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;

/** Content where every hungry adult pilfers and every theft is found out. */
const thievingContent = (punish: Punishment | null): SiteContent => ({
  ...C,
  society: {
    ...C.society,
    crime: { ...C.society.crime, pilferChance: 1, foundOut: 1, pilferTraits: {}, orderDiv: 1e9 },
    laws:
      punish === null
        ? C.society.laws
        : C.society.laws.map((l) => ({
            ...l,
            punish: { ...l.punish, theft: punish },
            max: punish,
          })),
  },
});

/** A watched site with one hungry adult on short meals, ready to steal. */
function hungryThief(content: SiteContent) {
  const world = copy();
  const site = biggest(world);
  const active = embark(world, content, site.id);
  const { emit, label } = voiceOf(world, content, active);
  const thief = active.residents
    .map((id) => world.people.get(id)!)
    .find((p) => {
      const race = content.races.find((r) => r.id === p.raceId)!;
      return bandOfAge(race, world.params.historyYears - p.born) === 'adult' && !p.detail!.abed;
    })!;
  active.mealShare = 0.5;
  // Everyone else is fed; only the thief is hungry.
  for (const id of active.residents) world.people.get(id)!.detail!.needs.food = 100;
  thief.detail!.needs.food = 5;
  const morning = () => runSocietyMorning(world, content, active, emit, label);
  const of = (type: string) =>
    world.events.filter((e) => e.type === type && e.actors[0] === thief.id);
  return { world, site, active, thief, morning, of };
}

describe('society', () => {
  it("a hungry thief is punished by the culture's rule", () => {
    const run = hungryThief(thievingContent(null));
    const { world, active, thief } = run;
    run.morning();
    expect(run.of(C.society.events.pilfered)).toHaveLength(1);
    expect(active.society.cases.map((c) => c.offender)).toContain(thief.id);
    // Judged the next morning, never the day of the crime.
    expect(run.of(C.society.events.judged)).toHaveLength(0);
    thief.detail!.status = 0;
    world.day += 1;
    run.morning();
    const judged = run.of(C.society.events.judged)[0]!;
    const culture = world.civs.get(run.site.civId!)!.cultureId;
    const law = C.society.laws.find((l) => l.cultureId === culture)!;
    expect(judged.data.punishment).toBe(C.society.justice.words[law.punish.theft]);
    expect(judged.data.law).toBe(law.phrase);
    expect(judged.causes).toEqual([run.of(C.society.events.pilfered)[0]!.id]);
    expect(thief.detail!.sentence?.kind).toBe(law.punish.theft);
    // A sentence puts the offender on the sentence's job for the day.
    serveSentences(world, C, [{ person: thief, band: 'adult' }]);
    expect(thief.detail!.jobId).toBe(C.society.justice.labourJob);
  });

  it("an exile leaves and appears in the world's site list", () => {
    const content = thievingContent('exile');
    const run = hungryThief(content);
    const { world, active, thief } = run;
    const populations = (id: Id) => world.sites.get(id)!.pop.reduce((n, b) => n + b.count, 0);
    const before = new Map([...world.sites].map(([id]) => [id, populations(id)]));
    run.morning();
    thief.detail!.status = 0;
    world.day += 1;
    run.morning();
    const destId = thief.siteId!;
    expect(active.residents).not.toContain(thief.id);
    expect(active.promoted).not.toContain(thief.id);
    expect(destId).not.toBe(active.siteId);
    expect(world.sites.get(destId)!.ruinedYear).toBeUndefined();
    expect(populations(destId)).toBeGreaterThan(before.get(destId)!);
    expect(active.society.exiles).toContainEqual([thief.id, destId]);
    expect(thief.detail).toBeUndefined();
    const event = run.of(content.society.events.exiled)[0]!;
    expect(event.data.dest).toBe(world.sites.get(destId)!.name);
    leaveSite(world, content);
    expect(world.people.get(thief.id)).toBe(thief);
    expect(thief.siteId).toBe(destId);
  });

  it('a death schedules a funeral the next day, mourned at least by the household', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const { emit, label } = voiceOf(world, C, active);
    const house = [...active.households.values()].find((h) => h.members.length >= 3)!;
    const dead: Person = world.people.get(house.members[house.members.length - 1]!)!;
    const death = killPerson(world, C, active, dead, 'illness', undefined, emit, label);
    expect(active.society.funerals).toEqual([
      { dead: dead.id, day: world.day + C.society.funeral.afterDays, deathEvent: death.id },
    ]);
    const household = [...house.members];
    world.day += C.society.funeral.afterDays;
    runSocietyMorning(world, C, active, emit, label);
    const funeral = world.events.find((e) => e.type === C.society.events.funeral)!;
    expect(funeral.actors).toEqual([dead.id]);
    expect(funeral.causes).toEqual([death.id]);
    expect(Number(funeral.data.mourners)).toBeGreaterThanOrEqual(household.length);
    expect(active.society.funerals).toHaveLength(0);
    for (const id of household) {
      const memories = world.people.get(id)!.detail!.memories;
      expect(
        memories.some((m) => m.type === C.society.memoryOf.mourned && m.about === dead.id),
      ).toBe(true);
    }
  });

  it('starving people open the seed corn, and the chronicle says so', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    stepSite(world, C);
    expect(active.harvest.seedKept).toBeGreaterThan(0);
    const p = world.people.get(active.residents[0]!)!;
    p.detail!.conditions.push({ defId: 'starving', severity: 10, sinceDay: world.day });
    stepSite(world, C);
    expect(active.harvest.seedKept).toBe(0);
    const opened = world.events.filter((e) => e.type === C.environment.events.seedOpened);
    expect(opened).toHaveLength(1);
  });
});
