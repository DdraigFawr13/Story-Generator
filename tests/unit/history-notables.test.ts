import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DAYS_PER_YEAR,
  LEGEND_CAP,
  decodeTerritory,
  encodeTerritory,
  generateWorld,
  validateContent,
  worldDigest,
  type ContentBundle,
  type Id,
  type SimEvent,
  type WorldState,
} from '../../src/engine';

const YEARS = 250;
const SIZE = { width: 64, height: 64 };

const generate = (seed: string, years = YEARS, content: ContentBundle = DEFAULT_CONTENT) =>
  generateWorld(seed, { ...SIZE, historyYears: years }, content);

/** One 250-year world, built once for the invariant checks. */
let shared: WorldState | undefined;
const base = () => (shared ??= generate('NOT-A'));
/** Seed whose default world has a razing death; its quarrelsome variant settles a dispute. */
const RAZED_SEED = 'NOT-B';

const yearOf = (event: SimEvent) => Math.floor(event.day / DAYS_PER_YEAR);

describe('notables', () => {
  it('make some people, dynasties and succession in 250 years', () => {
    const world = base();
    expect(world.people.size).toBeGreaterThan(50);
    expect(world.dynasties.size).toBeGreaterThan(0);
    expect(world.events.some((e) => e.type === 'ruler_succeeded')).toBe(true);
  });

  it('keep family links symmetric: parents, children, spouses and rivals', () => {
    const { people } = base();
    for (const person of people.values()) {
      for (const parent of person.family.parents) {
        expect(people.get(parent)?.family.children).toContain(person.id);
      }
      for (const child of person.family.children) {
        expect(people.get(child)?.family.parents).toContain(person.id);
      }
      for (const spouse of person.family.spouses) {
        expect(people.get(spouse)?.family.spouses).toContain(person.id);
      }
      for (const rival of person.rivals ?? []) {
        expect(people.get(rival)?.rivals).toContain(person.id);
      }
    }
  });

  it('never act after death, and never bear children after the mother dies', () => {
    const { people, events } = base();
    for (const event of events) {
      for (const id of event.actors) {
        const person = people.get(id);
        if (!person || person.died === undefined) continue;
        // Death, inheritance and succession happen in the year of the death.
        expect(yearOf(event)).toBeLessThanOrEqual(person.died);
      }
    }
    for (const person of people.values()) {
      for (const parentId of person.family.parents) {
        const parent = people.get(parentId)!;
        if (parent.sex === 'f' && parent.died !== undefined) {
          expect(person.born).toBeLessThanOrEqual(parent.died);
        }
      }
    }
  });

  it('give every living civ a living ruler and every succession a cause', () => {
    const world = base();
    for (const civ of world.civs.values()) {
      if (civ.fell !== undefined) continue;
      const ruler = world.people.get(civ.rulerId ?? -1);
      expect(ruler?.died).toBeUndefined();
      expect(ruler?.civId).toBe(civ.id);
    }
    const successions = world.events.filter((e) => e.type === 'ruler_succeeded');
    expect(successions.length).toBeGreaterThan(0);
    for (const event of successions) expect(event.causes.length).toBeGreaterThan(0);
  });

  it('hold every item with a living person or lost on the map', () => {
    const { items, people } = base();
    expect(items.size).toBeGreaterThan(0);
    for (const item of items.values()) {
      if (item.holder === null) {
        expect(item.lostAt).toBeDefined();
      } else {
        expect(people.get(item.holder)?.died).toBeUndefined();
        expect(item.lostAt).toBeUndefined();
      }
    }
  });

  it('never leave a deed pointing at a pruned event', () => {
    const world = base();
    const ids = new Set<Id>(world.events.map((e) => e.id));
    for (const person of world.people.values())
      for (const d of person.deeds) expect(ids).toContain(d);
    for (const item of world.items.values()) for (const d of item.deeds) expect(ids).toContain(d);
    for (const beast of world.creatures.values())
      for (const d of beast.deeds) expect(ids).toContain(d);
  });

  it('note a figure killed by a beast in both histories', () => {
    // Playtest: every beast can kill heroes, and the death shows on the hero's and the beast's page.
    let deaths = 0;
    for (const seed of ['NOT-A', 'NOT-BEAST']) {
      const world = seed === 'NOT-A' ? base() : generate(seed);
      for (const beast of world.creatures.values()) {
        for (const id of beast.kills ?? []) {
          const death = world.events.find(
            (e) => e.type === 'notable_died' && e.actors[0] === id && e.data.beast === beast.name,
          );
          expect(death, `${beast.name} killed #${id}`).toBeDefined();
          expect(beast.deeds).toContain(death!.id);
          expect(world.people.get(id)?.deeds).toContain(death!.id);
          expect(String(death!.data.cause)).toContain(beast.name);
          deaths += 1;
        }
      }
    }
    expect(deaths).toBeGreaterThan(0);
  });

  it('keep at most three legends alive, even when legends come easily', () => {
    const easy: ContentBundle = {
      ...DEFAULT_CONTENT,
      notables: { ...DEFAULT_CONTENT.notables, legendChance: 1, mageNotice: 4 },
    };
    const world = generate('NOT-LEGEND', YEARS, easy);
    const rises = world.events.filter((e) => e.type === 'legend_risen');
    expect(rises.length).toBeGreaterThan(0);
    for (let year = 0; year <= YEARS; year += 1) {
      const alive = rises.filter((e) => {
        const person = world.people.get(e.actors[0]!)!;
        return yearOf(e) <= year && (person.died === undefined || person.died > year);
      });
      expect(alive.length).toBeLessThanOrEqual(LEGEND_CAP);
    }
  });

  it('give every item its own name, even when names come from few patterns', () => {
    const forms = Object.fromEntries(
      Object.keys(DEFAULT_CONTENT.notables.bookForms).map((school) => [school, ['ledger']]),
    );
    const notables = {
      ...DEFAULT_CONTENT.notables,
      bookChance: 0.5,
      artifactChance: 1,
      artifactForms: ['sword'],
      artifactEpithets: ['Grey'],
      bookForms: forms,
    };
    const world = generate('NOT-A', YEARS, { ...DEFAULT_CONTENT, notables });
    const names = [...world.items.values()].map((item) => item.name);
    expect(names.length).toBeGreaterThan(10);
    expect(new Set(names).size).toBe(names.length);
  });

  it('name a razing death after the kind of place burned', () => {
    const world = generate(RAZED_SEED);
    const sites = [...world.sites.values()];
    const burnings = world.events.filter(
      (e) => e.type === 'notable_died' && String(e.data.cause).includes('burning'),
    );
    expect(burnings.length).toBeGreaterThan(0);
    for (const e of burnings) {
      const site = sites.find((s) => s.name === e.data.site)!;
      expect(e.data.cause).toContain(`the burning of the ${site.kind}`);
    }
  });

  it('say who lost when a disputed succession is settled', () => {
    const quarrelsome: ContentBundle = {
      ...DEFAULT_CONTENT,
      notables: { ...DEFAULT_CONTENT.notables, disputeChance: 1, disputeMargin: 100 },
    };
    const world = generate(RAZED_SEED, YEARS, quarrelsome);
    const byId = new Map(world.events.map((e) => [e.id, e]));
    const settled = world.events.filter((e) => e.type === 'ruler_succeeded');
    let disputed = 0;
    for (const e of settled) {
      const dispute = e.causes
        .map((id) => byId.get(id))
        .find((c) => c?.type === 'succession_disputed');
      if (!dispute) continue;
      disputed += 1;
      const loser = dispute.data.a === e.data.ruler ? dispute.data.b : dispute.data.a;
      expect(e.data.rule).toContain(String(loser));
    }
    expect(disputed).toBeGreaterThan(0);
  });

  it('gives the same world digest for the same seed', () => {
    expect(worldDigest(generate('NOT-DET', 80))).toBe(worldDigest(generate('NOT-DET', 80)));
  });

  it('keeps ten-year snapshots whose territory round-trips', () => {
    const world = base();
    expect(world.snapshots.map((s) => s.year)).toEqual(
      Array.from({ length: YEARS / 10 + 1 }, (_, n) => n * 10),
    );
    const cells = world.cells!;
    const size = cells.width * cells.height;
    const territory = Uint16Array.from({ length: size }, (_, i) => (i % 97 < 40 ? 0 : (i % 5) + 1));
    expect(decodeTerritory(encodeTerritory(territory), size)).toEqual(territory);
    const last = world.snapshots[world.snapshots.length - 1]!;
    expect(decodeTerritory(last.territory, size)).toEqual(cells.territory);
  });

  it('keeps a yearly playback log whose borders match the rules at each decade', () => {
    const world = base();
    const log = world.playback!;
    expect(log.years.map((y) => y.year)).toEqual(Array.from({ length: YEARS + 1 }, (_, n) => n));
    const size = world.cells!.width * world.cells!.height;
    let shown: Uint16Array | undefined;
    for (const entry of log.years) {
      if (entry.territory) shown = decodeTerritory(entry.territory, size);
      const snap = world.snapshots.find((s) => s.year === entry.year);
      if (snap) expect(shown).toEqual(decodeTerritory(snap.territory, size));
      for (let k = 0; k + 1 < entry.seats.length; k += 2) {
        expect(world.sites.has(entry.seats[k + 1]!)).toBe(true);
      }
    }
    expect(log.trade.length % 4).toBe(0);
    for (let k = 0; k < log.trade.length; k += 4) expect(log.trade[k]! % 10).toBe(0);
  });

  it('is rejected by content checks when a culture has no dynasty pattern', () => {
    const broken: ContentBundle = {
      ...DEFAULT_CONTENT,
      notables: { ...DEFAULT_CONTENT.notables, dynastyNames: {} },
    };
    expect(validateContent(broken).join('\n')).toMatch(/dynastyNames/);
  });

  it('is rejected by content checks when a deed chance is out of range', () => {
    const broken: ContentBundle = {
      ...DEFAULT_CONTENT,
      notables: {
        ...DEFAULT_CONTENT.notables,
        deeds: { ...DEFAULT_CONTENT.notables.deeds, vengeanceChance: 2 },
      },
    };
    expect(validateContent(broken).join('\n')).toMatch(/deeds\.vengeanceChance/);
  });
});
