import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  GOODS,
  deserializeWorld,
  embark,
  foundOutpost,
  generateWorld,
  householdLabel,
  leaveSite,
  localMapDigest,
  outpostCheck,
  residentNames,
  serializeWorld,
  sitePopulation,
  validateContent,
  type ActiveSite,
  type Id,
  type Site,
  type WorldState,
} from '../../src/engine';

import smokeMap from '../fixtures/smoke-localmap-digest.json';
import { base, biggest, copy } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
/** A small cap makes the biggest 64x64 site a "big" one without a huge world. */
const SMALL_CAP = { ...C, site: { ...C.site, followCap: 30 } };

const liveSites = (world: WorldState): Site[] =>
  [...world.sites.values()].filter((s) => s.ruinedYear === undefined && sitePopulation(s) > 0);
const smallest = (world: WorldState) =>
  liveSites(world).sort((a, b) => sitePopulation(a) - sitePopulation(b) || a.id - b.id)[0]!;

describe('site content', () => {
  it('validates', () => {
    expect(validateContent(C)).toEqual([]);
  });
});

describe('embark', () => {
  it('gives the same map and residents for the same seed and site', () => {
    const site = biggest(base());
    const a = copy();
    const b = copy();
    const left = embark(a, SMALL_CAP, site.id);
    const right = embark(b, SMALL_CAP, site.id);
    expect(localMapDigest(left.map)).toBe(localMapDigest(right.map));
    expect(left.residents).toEqual(right.residents);
    expect([...left.residents].map((id) => a.people.get(id)!.name)).toEqual(
      right.residents.map((id) => b.people.get(id)!.name),
    );
  });

  function checkInvariants(world: WorldState, active: ActiveSite) {
    const residents = new Set(active.residents);
    const seen = new Set<Id>();
    for (const household of active.households.values()) {
      const adults = household.members.filter((id) => {
        const p = world.people.get(id)!;
        const race = C.races.find((r) => r.id === p.raceId)!;
        return world.params.historyYears - p.born >= race.maturityYears;
      });
      expect(adults.length).toBeGreaterThan(0);
      expect(household.members).toContain(household.head);
      for (const id of household.members) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        expect(world.people.get(id)!.family.householdId).toBe(household.id);
      }
    }
    expect(seen).toEqual(residents);
    for (const id of residents) {
      const p = world.people.get(id)!;
      expect(p.detail?.pos).toBeDefined();
      for (const child of p.family.children.filter((c) => residents.has(c))) {
        expect(world.people.get(child)!.family.parents).toContain(id);
      }
      for (const parent of p.family.parents.filter((x) => residents.has(x))) {
        expect(world.people.get(parent)!.family.children).toContain(id);
      }
      for (const spouse of p.family.spouses.filter((x) => residents.has(x))) {
        expect(world.people.get(spouse)!.family.spouses).toContain(id);
      }
    }
    const names = active.promoted.map((id) => world.people.get(id)!.name);
    const notableNames = new Set(
      active.residents
        .filter((id) => !active.promoted.includes(id))
        .map((id) => world.people.get(id)!.name),
    );
    // Re-rolls make repeats rare, not impossible: allow a few.
    const repeats =
      names.length - new Set(names).size + names.filter((n) => notableNames.has(n)).length;
    expect(repeats).toBeLessThanOrEqual(Math.ceil(names.length / 10));
    // Homes: followed households have a home; counted homes belong to nobody.
    for (const b of active.buildings.values()) {
      if (b.defId === 'home' && !b.followed) expect(b.owner).toBeNull();
    }
  }

  it('keeps invariants for a big site that follows a share', () => {
    const world = copy();
    const site = biggest(world);
    const active = embark(world, SMALL_CAP, site.id);
    expect(sitePopulation(site)).toBeGreaterThan(30);
    expect(Math.abs(active.residents.length - 30)).toBeLessThanOrEqual(5);
    expect(active.share).toBeLessThan(1);
    checkInvariants(world, active);
  });

  it('follows everyone at a small site', () => {
    const world = copy();
    const site = smallest(world);
    const active = embark(world, C, site.id);
    expect(active.residents.length).toBe(sitePopulation(site));
    expect(active.share).toBe(1);
    checkInvariants(world, active);
  });

  it('gives shared names a display name each', () => {
    const world = copy();
    const active = embark(world, SMALL_CAP, biggest(world).id);
    const names = residentNames(world, active.residents);
    expect(names.size).toBe(active.residents.length);
    const labels = [...active.households.values()].map((h) => householdLabel(world, h, names));
    expect(labels.every((l) => l.includes("'s household") || l.includes('lives alone'))).toBe(true);
  });
});

describe('leaving', () => {
  it('keeps counts, notables and goods exactly', () => {
    const world = copy();
    const before = copy();
    const site = biggest(world);
    const active = embark(world, SMALL_CAP, site.id);
    const notables = active.residents.filter((id) => !active.promoted.includes(id));
    leaveSite(world, SMALL_CAP);
    expect(world.activeSite).toBeNull();
    for (const [id, s] of before.sites) expect(world.sites.get(id)!.pop).toEqual(s.pop);
    for (const [id, s] of before.sites) expect(world.sites.get(id)!.goods).toEqual(s.goods);
    expect([...world.people.keys()]).toEqual([...before.people.keys()]);
    // Notables keep the traits they gained at the site; everything else is as it was.
    for (const [id, person] of before.people) {
      const { traits, skills, ...rest } = world.people.get(id)!;
      const { traits: oldTraits, skills: oldSkills, ...oldRest } = person;
      expect(rest).toEqual(oldRest);
      if (notables.includes(id)) {
        // Notables keep the skills they were given too.
        for (const [k, v] of Object.entries(oldSkills)) expect(skills[k]).toBe(v);
        expect(oldTraits).toEqual([]);
        expect(traits.length).toBeGreaterThanOrEqual(1);
        expect(traits.length).toBeLessThanOrEqual(2);
      } else {
        expect(traits).toEqual(oldTraits);
        expect(skills).toEqual(oldSkills);
      }
    }
  });

  it('carries the stock change back into goods', () => {
    const world = copy();
    const site = smallest(world);
    const goods = { ...site.goods };
    const active = embark(world, C, site.id);
    active.stock.set('grain', active.stock.get('grain')! + 336);
    leaveSite(world, C);
    for (const good of GOODS) {
      if (good === 'food') expect(site.goods.food).toBeCloseTo(goods.food + 1, 9);
      else expect(site.goods[good]).toBe(goods[good]);
    }
  });
});

describe('outposts', () => {
  it('explains why a cell cannot be settled', () => {
    const world = copy();
    const cells = world.cells!;
    const sea = cells.water.findIndex((w) => w === 3);
    expect(outpostCheck(world, C, sea)).toEqual({ ok: false, reason: 'Water' });
    const site = biggest(world);
    expect(outpostCheck(world, C, site.cell)).toEqual({
      ok: false,
      reason: 'A site is already here',
    });
    const sited = new Set([...world.sites.values()].map((s) => s.cell));
    const poor = cells.fertility.findIndex(
      (f, i) => f < 40 && cells.water[i] === 0 && !sited.has(i),
    );
    const result = outpostCheck(world, C, poor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^Too poor to farm \(fertility \d+\)$/);
  });

  it('founds a hamlet with 8-14 settlers taken from the origin', () => {
    const world = copy();
    const cells = world.cells!;
    let cell = -1;
    let check = outpostCheck(world, C, 0);
    for (let i = 0; i < cells.water.length && cell < 0; i += 1) {
      check = outpostCheck(world, C, i);
      if (check.ok) cell = i;
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    if (!check.ok) return;
    const origin = world.sites.get(check.fromSiteId)!;
    const before = sitePopulation(origin);
    const id = foundOutpost(world, C, cell, null);
    const outpost = world.sites.get(id)!;
    expect(outpost.kind).toBe('hamlet');
    expect(outpost.civId).toBe(origin.civId);
    expect(before - sitePopulation(origin)).toBe(check.settlers);
    expect(sitePopulation(outpost)).toBe(check.settlers);
    expect(check.settlers).toBeGreaterThanOrEqual(8);
    expect(check.settlers).toBeLessThanOrEqual(14);
    expect(check.travelDays).toBeGreaterThanOrEqual(1);
    const event = world.events[world.events.length - 1]!;
    expect(event.type).toBe('outpost_founded');
    expect(event.data.site).toBe(outpost.name);
    // The caller may now embark on it.
    expect(embark(world, C, id).residents.length).toBe(check.settlers);
  });
});

describe('saves', () => {
  it('round-trips a world with an active site', () => {
    const world = copy();
    embark(world, C, smallest(world).id);
    const back = deserializeWorld(serializeWorld(world));
    expect(back.activeSite).toEqual(world.activeSite);
    expect(back.activeSite!.map.terrain).toBeInstanceOf(Uint8Array);
    expect(back.activeSite!.households).toBeInstanceOf(Map);
  });
});

describe('smoke local map', () => {
  it('matches the committed digest of the first standing site of seed SMOKE at 128 (the browser smoke compares the same)', () => {
    const world = generateWorld(smokeMap.seed, { width: smokeMap.size, height: smokeMap.size }, C);
    // The Sites list in Legends sorts by peak population, then id; the smoke opens the first standing one.
    const first = [...world.sites.values()]
      .filter((s) => s.ruinedYear === undefined)
      .sort((a, b) => b.peakPop - a.peakPop || a.id - b.id)[0]!;
    expect(first.id).toBe(smokeMap.site);
    expect(localMapDigest(embark(world, C, first.id).map)).toBe(smokeMap.digest);
  });
});
