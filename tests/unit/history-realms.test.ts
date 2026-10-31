import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent, type WorldState } from '../../src/engine';
import { findWorld } from './helpers/find-world';

/** Free cities break away and swear pacts often on a 64x64 world. */
const cs = DEFAULT_CONTENT.history.cityStates;
const BUSY = {
  ...DEFAULT_CONTENT,
  history: {
    ...DEFAULT_CONTENT.history,
    cityStates: {
      ...cs,
      secede: { ...cs.secede, chance: 0.5, minSites: 2, minDistance: 6 },
      pact: { ...cs.pact, chance: 1 },
    },
  },
};

// Tests search this fixed list for a world with the event they check (first match wins).
const CS_SEEDS = ['CS-21', 'CS-20', 'CS-18', 'CS-16', 'CS-17', 'CS-19', 'CS-22', 'CS-23'];
const makeFree = (seed: string) =>
  generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, BUSY);
const freeWith = (type: string) =>
  findWorld(`a ${type} event`, 'busy64', CS_SEEDS, makeFree, (w) =>
    w.events.some((e) => e.type === type),
  ).world;
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);
const civNamed = (w: WorldState, name: unknown) =>
  [...w.civs.values()].find((c) => c.name === name);

describe('free cities', () => {
  it('start as one-town realms away from every capital', () => {
    const settled = generateWorld('CS-16', { width: 64, height: 64, historyYears: 0 }, BUSY);
    const start = [...settled.civs.values()].filter((c) => c.free);
    expect(start.length).toBeGreaterThan(0);
    const width = settled.cells!.width;
    for (const civ of start) {
      expect([...settled.sites.values()].filter((s) => s.civId === civ.id)).toHaveLength(1);
      const seat = settled.sites.get(civ.capital)!;
      for (const other of settled.civs.values()) {
        if (other.id === civ.id) continue;
        const cell = settled.sites.get(other.capital)!.cell;
        const gap = Math.max(
          Math.abs((cell % width) - (seat.cell % width)),
          Math.abs(Math.floor(cell / width) - Math.floor(seat.cell / width)),
        );
        expect(gap).toBeGreaterThanOrEqual(DEFAULT_CONTENT.settlement.freeCities.capitalSpacing);
      }
    }
  });

  it('break away as a new free realm, and the old one waits out the grace years', () => {
    const w = freeWith('city_freed');
    for (const e of ofType(w, 'city_freed')) {
      const civ = civNamed(w, e.data.civ)!;
      expect(civ.free).toBe(true);
      expect(w.people.get(e.actors[0]!)?.deeds).toContain(e.id);
      const war = ofType(w, 'war_declared').find(
        (w) => w.data.civ === e.data.from && w.data.enemy === e.data.civ && w.causes.includes(e.id),
      );
      if (war) expect(yearOf(war) - yearOf(e)).toBeGreaterThanOrEqual(cs.secede.graceYears);
    }
  });

  it('send aid only to a sworn ally', () => {
    const w = freeWith('ally_aided');
    for (const e of ofType(w, 'ally_aided')) {
      const pact = e.causes
        .map((id) => w.events.find((x) => x.id === id))
        .find((c) => c?.type === 'pact_sworn')!;
      expect([pact.data.civ, pact.data.other].sort()).toEqual([e.data.civ, e.data.friend].sort());
    }
  });
});

describe('colleges and spells', () => {
  const D = DEFAULT_CONTENT;
  const MAGICAL = {
    ...D,
    notables: { ...D.notables, legendChance: 1 },
  };
  // DH-22 holds both examples (surveyed 2026-10-31), so it leads.
  const DH_SEEDS = ['DH-22', 'DH-3', 'DH-21', 'DH-1', 'DH-2', 'DH-4', 'DH-5', 'DH-6'];
  const makeMagic = (seed: string) =>
    generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, MAGICAL);
  const magicWith = (type: string, seeds = DH_SEEDS) =>
    findWorld(`a ${type} event`, 'magical64', seeds, makeMagic, (x) =>
      x.events.some((e) => e.type === type),
    ).world;

  it('are worked only by Exceptional casters, against the trouble they name', () => {
    // DH-8 leads since the 2026-10-17 feuds change left the others without a spell cast.
    const w = magicWith('spell_cast', [...DH_SEEDS, 'DH-8']);
    const spells = ofType(w, 'spell_cast');
    const troubles = new Set([
      'dry_years_began',
      'cold_years_began',
      'famine',
      ...D.diseases.map((d) => d.event),
    ]);
    for (const e of spells) {
      expect(w.people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(
        D.history.colleges.spellPower,
      );
      const cause = w.events.find((x) => x.id === e.causes[0]);
      expect(troubles.has(cause!.type)).toBe(true);
    }
  });

  it('open in a town of their people, never more than the cap at once', () => {
    const w = magicWith('college_founded');
    let open = 0;
    for (const e of w.events) {
      if (e.type === 'college_founded') open += 1;
      if (e.type === 'college_closed') open -= 1;
      expect(open).toBeLessThanOrEqual(D.history.colleges.maxOpen);
    }
  });
});

describe('succession wars', () => {
  const D = DEFAULT_CONTENT;
  const cw = D.history.civilWar;
  const RESTLESS = {
    ...D,
    history: { ...D.history, civilWar: { ...cw, chance: 1, minSites: 2 } },
  };
  // CW-2 and CW-24 hold every example between them (surveyed 2026-10-31), so they lead.
  const CW_SEEDS = ['CW-2', 'CW-24', 'CW-116', 'CW-37', 'CW-43', 'CW-13', 'CW-117', 'CW-118'];
  const makeWar = (seed: string) =>
    generateWorld(seed, { width: 64, height: 64, historyYears: 250 }, RESTLESS);
  const warWith = (type: string) =>
    findWorld(`a ${type} event`, 'restless64', CW_SEEDS, makeWar, (x) =>
      x.events.some((e) => e.type === type),
    ).world;
  const find = (w: WorldState, id: number) => w.events.find((e) => e.id === id);

  it('start from a disputed succession or a returned claimant, with the claimant ruling the towns that rose', () => {
    const w = warWith('civil_war_began');
    for (const e of ofType(w, 'civil_war_began')) {
      // The claim is a disputed succession, or an exile come home to claim the seat (feuds.ts).
      const claim = (c: SimEvent | undefined) =>
        c?.type === 'succession_disputed' ||
        (c?.type === 'exile_returned' && c.data.kind === 'claim');
      expect(e.causes.map((id) => find(w, id)).some(claim)).toBe(true);
      const rebel = civNamed(w, e.data.civ)!;
      expect(rebel.rebelOf).toBe(civNamed(w, e.data.from)!.id);
      expect(w.people.get(e.actors[0]!)?.deeds).toContain(e.id);
    }
  });

  // Each ending kind is found in its own world; every one must follow a war of its rebels, within the limit.
  for (const kind of ['throne_seized', 'revolt_crushed', 'realm_split']) {
    it(`end with ${kind} within the limit`, () => {
      const w = warWith(kind);
      for (const end of ofType(w, kind)) {
        const rebels = end.data.rebels ?? end.data.civ;
        const e = ofType(w, 'civil_war_began').find((x) => x.data.civ === rebels && x.id < end.id)!;
        expect(e, `war before ${kind} of ${rebels}`).toBeDefined();
        expect(yearOf(end) - yearOf(e)).toBeLessThanOrEqual(cw.maxYears);
        const rebel = civNamed(w, rebels)!;
        // A reunited realm folds the claimant's back in; a split leaves it standing (until a later war).
        if (kind === 'realm_split') expect(rebel.fell ?? Infinity).toBeGreaterThan(yearOf(end));
        else expect(rebel.fell).toBe(yearOf(end));
      }
    });
  }

  it('leave a war unended only in the last years', () => {
    const w = warWith('civil_war_began');
    const endings = ['throne_seized', 'revolt_crushed', 'realm_split'].flatMap((t) => ofType(w, t));
    for (const e of ofType(w, 'civil_war_began')) {
      const end = endings.find((x) => (x.data.rebels ?? x.data.civ) === e.data.civ && x.id > e.id);
      if (!end) expect(yearOf(e)).toBeGreaterThan(250 - cw.maxYears);
    }
  });

  it('never burn a town, and hand a seized throne to the claimant', () => {
    const w = findWorld('a civil battle', 'restless64', CW_SEEDS, makeWar, (x) =>
      ofType(x, 'battle').some((b) => b.data.civil === 1),
    ).world;
    const civilBattles = new Set(
      ofType(w, 'battle')
        .filter((b) => b.data.civil === 1)
        .map((b) => b.id),
    );
    expect(
      ofType(w, 'site_razed').filter((r) => r.causes.some((c) => civilBattles.has(c))),
    ).toEqual([]);
    const t = warWith('throne_seized');
    for (const e of ofType(t, 'throne_seized')) {
      const victor = t.people.get(e.actors[0]!)!;
      expect(victor.name).toBe(e.data.name);
      expect(victor.deeds).toContain(e.id);
    }
  });

  it('end a ruling house only when another house takes the seat', () => {
    const w = warWith('dynasty_ended');
    for (const e of ofType(w, 'dynasty_ended')) {
      expect(e.data.house).not.toBe(e.data.dynasty);
      const held = Number(e.data.years) >= cw.houseYears || Number(e.data.rulers) >= cw.houseRulers;
      expect(held).toBe(true);
    }
  });
});
