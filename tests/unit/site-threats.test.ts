import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  RngStream,
  combatRound,
  embark,
  raidBand,
  runThreatsDay,
  stepBlock,
  voiceOf,
  type SiteContent,
} from '../../src/engine';
import { biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;

describe('threats', () => {
  it('opens no threat without a lair or a grievance; a grievance brings a raid linked to its cause', () => {
    const world = copy();
    const site = biggest(world);
    world.creatures.clear();
    for (const civ of world.civs.values()) civ.grievances.clear();
    const active = embark(world, C, site.id);
    const { emit, label } = voiceOf(world, C, active);
    for (let i = 0; i < 1008; i += 1) {
      world.day += 1;
      runThreatsDay(world, C, active, emit, label);
    }
    expect(active.threat).toBeNull();
    expect(world.events.filter((e) => e.type === C.threats.events.raidArrived)).toHaveLength(0);

    // A civ with a live home in reach holds a grievance against the site's civ.
    const mine = world.civs.get(site.civId!)!;
    const home = [...world.sites.values()].find(
      (s) =>
        s.civId !== null &&
        s.civId !== mine.id &&
        s.ruinedYear === undefined &&
        s.pop.some((b) => b.band === 'adult' && b.count > 0),
    )!;
    const theirs = world.civs.get(home.civId!)!;
    theirs.grievances.set(mine.id, 1);
    const wrong = emit({
      type: 'insult',
      data: { civ: mine.name, victim: theirs.name },
    });
    // Sure to roll, and no warning: they come the same day.
    const content: SiteContent = {
      ...C,
      threats: {
        ...C.threats,
        raids: { ...C.threats.raids, reach: 1000, perYear: 1e6, warnChance: 0 },
      },
    };
    world.day += 1;
    runThreatsDay(world, content, active, emit, label);
    expect(active.threat?.kind).toBe('raid');
    expect(active.threat?.civId).toBe(theirs.id);
    const arrival = world.events.find((e) => e.type === C.threats.events.raidArrived)!;
    expect(arrival.causes).toContain(wrong.id);
    expect(arrival.data.count).toBe(active.threat!.came);
  });

  it('one block of blows never passes the round cap or the death cap', () => {
    const rng = RngStream.detached('threats', 'site.threats');
    const rules = C.threats.combat;
    const residents = 150;
    const killCap = Math.floor(C.history.raidKillCap * residents);
    for (let i = 0; i < 200; i += 1) {
      // A dragon (danger 700) against forty militia.
      const r = combatRound(rules, rng, {
        tier: 'legendary',
        attack: 700,
        defence: 40,
        defenders: 40,
        killCap,
      });
      expect(r.struck.length).toBeLessThanOrEqual(rules.roundCap.legendary);
      expect(r.struck.filter((s) => s.killed).length).toBeLessThanOrEqual(killCap);
      expect(new Set(r.struck.map((s) => s.who)).size).toBe(r.struck.length);
    }
    // A thousand adults at home send no more than the band clamp, whose blows are capped too.
    const band = raidBand(C.threats, 1000, 1, 1000);
    expect(band).toBe(C.threats.raids.band[1]);
    // A hamlet of 30 able adults faces at most a third of that many.
    expect(raidBand(C.threats, 1000, 1, 30)).toBe(Math.floor(30 * C.threats.raids.targetShare));
    const raid = combatRound(rules, rng, {
      tier: 'raid',
      attack: band * C.threats.raids.perHead,
      defence: 10,
      defenders: 40,
      killCap: 0,
    });
    expect(raid.struck.length).toBeLessThanOrEqual(rules.roundCap.raid);
    expect(raid.struck.some((s) => s.killed)).toBe(false);
  });

  it('a dragon sign over a town of weak defenders sends everyone to the camp', () => {
    const world = copy();
    const site = biggest(world);
    const content: SiteContent = {
      ...C,
      creatures: C.creatures.map((d) => ({ ...d, raidChance: d.id === 'draig' ? 1000 : 0 })),
    };
    const id = world.nextId.creature;
    world.nextId.creature += 1;
    world.creatures.set(id, {
      id,
      defId: 'draig',
      name: 'Ysgythr',
      lair: site.cell + 1,
      born: 1,
      lifespan: 500,
      deeds: [],
    });
    const active = embark(world, content, site.id);
    stepBlock(world, content);
    const t = active.threat!;
    expect(t.stage).toBe('warned');
    // The sign comes with everyone still at home; they judge the day before it arrives.
    expect(t.fled).toBe(false);
    for (let i = 0; i < 4 * C.threats.beasts.warnDays[1] && !t.fled; i += 1)
      stepBlock(world, content);
    expect(t.fled).toBe(true);
    expect(t.stage).toBe('warned');
    expect(t.camp).toBeGreaterThanOrEqual(0);
    const sign = world.events.find((e) => e.type === C.threats.events.sign)!;
    expect(world.events.find((e) => e.type === C.threats.events.flight)!.causes).toEqual([sign.id]);
    const width = active.map.width;
    for (let block = 0; block < 3; block += 1) {
      stepBlock(world, content);
      for (const rid of active.residents) {
        const d = world.people.get(rid)!.detail!;
        const at = d.pos![1] * width + d.pos![0];
        // The bedridden stay; everyone else is on the road or at the camp.
        expect(d.abed ? d.activity === 'shelter' : d.activity === 'flee' || at === t.camp).toBe(
          true,
        );
      }
    }
    expect(active.threats.stats.flights).toBe(1);
  });
});
