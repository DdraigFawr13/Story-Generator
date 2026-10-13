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

let shared: WorldState | undefined;
const world = () =>
  (shared ??= generateWorld('CS-4', { width: 64, height: 64, historyYears: 250 }, BUSY));
const ofType = (type: string) => world().events.filter((e) => e.type === type);
const byId = (id: number) => world().events.find((e) => e.id === id);
const yearOf = (e: SimEvent) => Math.floor(e.day / DAYS_PER_YEAR);
const civNamed = (name: unknown) => [...world().civs.values()].find((c) => c.name === name);

describe('free cities', () => {
  it('start as one-town realms away from every capital', () => {
    const settled = generateWorld('CS-4', { width: 64, height: 64, historyYears: 0 }, BUSY);
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
  let magical: WorldState | undefined;
  const w = () =>
    (magical ??= generateWorld('DH-21', { width: 64, height: 64, historyYears: 250 }, MAGICAL));

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
