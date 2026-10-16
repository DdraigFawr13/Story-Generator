import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { DAYS_PER_YEAR, generateWorld, type SimEvent, type WorldState } from '../../src/engine';

/** Free cities break away and swear pacts often on a 64x64 world; the seed has a break-away, a pact and an ally's aid. */
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

// Compact continents (2026-10-13) moved CS-16's sworn-ally aid (ally_aided) to CS-18; roaming beasts
// (2026-10-13) moved it again; CS-20 had it until religion (faiths and holy wars) moved it; CS-21 has it.
let shared: WorldState | undefined;
const world = () =>
  (shared ??= generateWorld('CS-21', { width: 64, height: 64, historyYears: 250 }, BUSY));
const ofType = (type: string) => world().events.filter((e) => e.type === type);
const byId = (id: number) => world().events.find((e) => e.id === id);
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);
const civNamed = (name: unknown) => [...world().civs.values()].find((c) => c.name === name);

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
    expect(ofType('city_freed').length).toBeGreaterThan(0);
    for (const e of ofType('city_freed')) {
      const civ = civNamed(e.data.civ)!;
      expect(civ.free).toBe(true);
      expect(world().people.get(e.actors[0]!)?.deeds).toContain(e.id);
      const war = ofType('war_declared').find(
        (w) => w.data.civ === e.data.from && w.data.enemy === e.data.civ && w.causes.includes(e.id),
      );
      if (war) expect(yearOf(war) - yearOf(e)).toBeGreaterThanOrEqual(cs.secede.graceYears);
    }
  });

  it('send aid only to a sworn ally', () => {
    expect(ofType('ally_aided').length).toBeGreaterThan(0);
    for (const e of ofType('ally_aided')) {
      const pact = e.causes.map(byId).find((c) => c?.type === 'pact_sworn')!;
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
  // Compact continents (2026-10-13) moved DH-21's spell casting and college founding; DH-22 had both until M5.6 dragons (history drift); DH-1 had both until expeditions (M4.7, history drift); re-pinned: DH-3 has both.
  let magical: WorldState | undefined;
  const w = () =>
    (magical ??= generateWorld('DH-3', { width: 64, height: 64, historyYears: 250 }, MAGICAL));

  it('are worked only by Exceptional casters, against the trouble they name', () => {
    const spells = w().events.filter((e) => e.type === 'spell_cast');
    expect(spells.length).toBeGreaterThan(0);
    const troubles = new Set([
      'dry_years_began',
      'cold_years_began',
      'famine',
      ...D.diseases.map((d) => d.event),
    ]);
    for (const e of spells) {
      expect(w().people.get(e.actors[0]!)!.magic.power).toBeGreaterThanOrEqual(
        D.history.colleges.spellPower,
      );
      const cause = w().events.find((x) => x.id === e.causes[0]);
      expect(troubles.has(cause!.type)).toBe(true);
    }
  });

  it('open in a town of their people, never more than the cap at once', () => {
    const opened = w().events.filter((e) => e.type === 'college_founded');
    expect(opened.length).toBeGreaterThan(0);
    let open = 0;
    for (const e of w().events) {
      if (e.type === 'college_founded') open += 1;
      if (e.type === 'college_closed') open -= 1;
      expect(open).toBeLessThanOrEqual(D.history.colleges.maxOpen);
    }
  });
});

describe('succession wars', () => {
  const D = DEFAULT_CONTENT;
  const cw = D.history.civilWar;
  // Every beaten claimant rises; re-pinned for M5.6 dragons: history drift; CW-43 had a throne seized, a revolt crushed and a split until expeditions (M4.7, history drift: no civil war at all); re-pinned: CW-2 has all three (CW-13 lost its ending); CW-2 lost its endings to religion (faiths and holy wars), CW-24 had all three until spellbooks and lineages (M5.2, history drift); M5.2 lineages: CW-37 lost its endings to history drift; CW-116 has all three.
  const RESTLESS = {
    ...D,
    history: { ...D.history, civilWar: { ...cw, chance: 1, minSites: 2 } },
  };
  let restless: WorldState | undefined;
  const w = () =>
    (restless ??= generateWorld('CW-116', { width: 64, height: 64, historyYears: 250 }, RESTLESS));
  const of = (type: string) => w().events.filter((e) => e.type === type);
  const find = (id: number) => w().events.find((e) => e.id === id);
  const named = (name: unknown) => [...w().civs.values()].find((c) => c.name === name);
  const endings = () => [...of('throne_seized'), ...of('revolt_crushed'), ...of('realm_split')];

  it('start from a disputed succession, with the claimant ruling the towns that rose', () => {
    expect(of('civil_war_began').length).toBeGreaterThan(0);
    for (const e of of('civil_war_began')) {
      expect(e.causes.map(find).some((c) => c?.type === 'succession_disputed')).toBe(true);
      const rebel = named(e.data.civ)!;
      expect(rebel.rebelOf).toBe(named(e.data.from)!.id);
      expect(w().people.get(e.actors[0]!)?.deeds).toContain(e.id);
    }
  });

  it('end with the throne seized, the revolt crushed or the realm split, within the limit', () => {
    expect(of('throne_seized').length).toBeGreaterThan(0);
    expect(of('revolt_crushed').length).toBeGreaterThan(0);
    expect(of('realm_split').length).toBeGreaterThan(0);
    for (const e of of('civil_war_began')) {
      const rebels = e.data.civ;
      const end = endings().find((x) => (x.data.rebels ?? x.data.civ) === rebels && x.id > e.id);
      if (!end) {
        expect(yearOf(e)).toBeGreaterThan(250 - cw.maxYears);
        continue;
      }
      expect(yearOf(end) - yearOf(e)).toBeLessThanOrEqual(cw.maxYears);
      const rebel = named(rebels)!;
      // A reunited realm folds the claimant's back in; a split leaves it standing (until a later war).
      if (end.type === 'realm_split') expect(rebel.fell ?? Infinity).toBeGreaterThan(yearOf(end));
      else expect(rebel.fell).toBe(yearOf(end));
    }
  });

  it('never burn a town, and hand a seized throne to the claimant', () => {
    const civilBattles = new Set(
      of('battle')
        .filter((b) => b.data.civil === 1)
        .map((b) => b.id),
    );
    expect(civilBattles.size).toBeGreaterThan(0);
    expect(of('site_razed').filter((r) => r.causes.some((c) => civilBattles.has(c)))).toEqual([]);
    for (const e of of('throne_seized')) {
      const victor = w().people.get(e.actors[0]!)!;
      expect(victor.name).toBe(e.data.name);
      expect(victor.deeds).toContain(e.id);
    }
  });

  it('end a ruling house only when another house takes the seat', () => {
    expect(of('dynasty_ended').length).toBeGreaterThan(0);
    for (const e of of('dynasty_ended')) {
      expect(e.data.house).not.toBe(e.data.dynasty);
      const held = Number(e.data.years) >= cw.houseYears || Number(e.data.rulers) >= cw.houseRulers;
      expect(held).toBe(true);
    }
  });
});
