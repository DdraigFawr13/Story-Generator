import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  embark,
  keepLeader,
  killPerson,
  leaderOf,
  runPoliticsDay,
  siteHeir,
  tradePartners,
  voiceOf,
  type Person,
} from '../../src/engine';
import { biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;

/** Site ids that traded with `siteId` in the playback's rows. */
function tradedWith(rows: Uint32Array, siteId: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i + 3 < rows.length; i += 4) {
    if (rows[i + 1] === siteId) out.add(rows[i + 2]!);
    if (rows[i + 2] === siteId) out.add(rows[i + 1]!);
  }
  return out;
}

describe('politics', () => {
  it('sends caravans only along the trade routes history used, and none without them', () => {
    const world = copy();
    const site = biggest(world);
    const routes = tradedWith(world.playback!.trade, site.id);
    expect(routes.size).toBeGreaterThan(0);
    const active = embark(world, C, site.id);
    const partners = active.politics.partners;
    expect(partners.length).toBeGreaterThan(0);
    for (const id of partners) expect(routes.has(id)).toBe(true);
    const { emit, label } = voiceOf(world, C, active);
    keepLeader(world, C, active, emit, label);
    for (let day = 0; day < 672; day += 1) {
      world.day += 1;
      runPoliticsDay(world, C, active, emit, label);
    }
    const names = new Set(partners.map((id) => world.sites.get(id)!.name));
    const arrivals = world.events.filter(
      (e) =>
        e.type === C.politics.events.caravanArrived || e.type === C.politics.events.caravanQuiet,
    );
    expect(arrivals.length).toBeGreaterThan(0);
    for (const e of arrivals) expect(names.has(String(e.data['from']))).toBe(true);

    // No trade rows: no partners, so no caravan ever comes.
    const lonely = copy();
    lonely.playback!.trade = new Uint32Array(0);
    const there = biggest(lonely);
    expect(tradePartners(lonely, C, there, 250)).toEqual([]);
    const quiet = embark(lonely, C, there.id);
    const voice = voiceOf(lonely, C, quiet);
    for (let day = 0; day < 336; day += 1) {
      lonely.day += 1;
      runPoliticsDay(lonely, C, quiet, voice.emit, voice.label);
    }
    expect(quiet.politics.stats.caravans).toBe(0);
  });

  it('never leaves the site leaderless, however often the leader dies', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const { emit, label } = voiceOf(world, C, active);
    keepLeader(world, C, active, emit, label);
    expect(leaderOf(world, active)).toBeDefined();
    for (let round = 0; round < 12; round += 1) {
      const leader = leaderOf(world, active)!;
      killPerson(world, C, active, leader, 'old-age', undefined, emit, label);
      keepLeader(world, C, active, emit, label);
      const next = leaderOf(world, active);
      expect(next).toBeDefined();
      expect(next!.id).not.toBe(leader.id);
      expect(next!.died).toBeUndefined();
      expect(active.residents).toContain(next!.id);
    }
    expect(active.politics.stats.successions).toBe(12);
  });

  it('picks the heir by the culture rule: the eldest grown child', () => {
    const world = copy();
    const active = embark(world, C, biggest(world).id);
    const people = active.residents.map((id) => world.people.get(id)!);
    const year = world.params.historyYears;
    const grown = people
      .filter((p) => year - p.born >= 30)
      .sort((a, b) => a.born - b.born || a.id - b.id);
    const [dead, elder, younger] = grown as [Person, Person, Person];
    dead.family.children = [younger.id, elder.id];
    expect(siteHeir(world, C, active, dead, 'eldest-child').heir?.id).toBe(elder.id);
    // A culture that elects among kin weighs fame and charisma, not age.
    younger.fame = elder.fame + 100;
    expect(siteHeir(world, C, active, dead, 'kin-elected').heir?.id).toBe(younger.id);
  });
});
