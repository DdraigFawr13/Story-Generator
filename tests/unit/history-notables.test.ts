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

  it('is rejected by content checks when a culture has no dynasty pattern', () => {
    const broken: ContentBundle = {
      ...DEFAULT_CONTENT,
      notables: { ...DEFAULT_CONTENT.notables, dynastyNames: {} },
    };
    expect(validateContent(broken).join('\n')).toMatch(/dynastyNames/);
  });
});
