import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { generateWorld, type WorldState } from '../../src/engine';
import { findWorld, seedsFrom128 } from './helpers/find-world';

// Each test searches a short fixed seed list for a world with the example it checks (first match
// wins); worlds are generated once per seed and shared.
const SEEDS = seedsFrom128('GB-1', ['GB-2', 'GB-3', 'GB-4', 'GB-5', 'GB-6', 'GB-7', 'GB-8']);
const make = (seed: string) =>
  generateWorld(seed, { width: 128, height: 128, historyYears: 250 }, DEFAULT_CONTENT);
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'd128', SEEDS, make, has).world;
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const great = (w: WorldState) => [...w.creatures.values()].filter((c) => c.great);
const hosts = (w: WorldState) => [...w.creatures.values()].filter((c) => c.dead);

describe('great beasts as individuals', () => {
  it('names a great beast for its given name, with a temper and a lair', () => {
    const world = find('a great beast', (w) => great(w).length > 0);
    const temperIds = new Set(DEFAULT_CONTENT.greatBeasts.tempers.map((t) => t.id));
    const names = new Set<string>();
    for (const beast of great(world)) {
      expect(beast.name.startsWith(beast.great!.given), beast.name).toBe(true);
      expect(temperIds.has(beast.great!.temper)).toBe(true);
      expect(beast.great!.lairName).toContain(beast.great!.given);
      expect(names.has(beast.name), `${beast.name} repeats`).toBe(false);
      names.add(beast.name);
    }
    expect(ofType(world, 'great_beast_appeared').length).toBe(great(world).length);
  });

  it('only takes tolls from sites that exist', () => {
    const world = find('a toll paid', (w) => ofType(w, 'great_beast_toll').length > 0);
    const sites = new Set([...world.sites.values()].map((s) => s.name));
    for (const toll of ofType(world, 'great_beast_toll')) {
      expect(sites.has(String(toll.data.site)), String(toll.data.site)).toBe(true);
      expect(toll.data.toll).toBeTruthy();
    }
    for (const beast of great(world))
      for (const id of beast.great!.tollFrom) expect(world.sites.has(id)).toBe(true);
  });
});

describe('the restless dead as individuals', () => {
  it('names a woken host for the ruler buried in the barrow', () => {
    const world = find('a host woken from a ruler barrow', (w) =>
      hosts(w).some((h) => h.dead!.rulerId !== undefined),
    );
    const host = hosts(world).find((h) => h.dead!.rulerId !== undefined)!;
    const ruler = world.people.get(host.dead!.rulerId!)!;
    expect(host.name).toContain(ruler.name);
    expect(world.places.get(host.dead!.placeId)?.personId).toBe(ruler.id);
    expect(world.civs.has(host.dead!.robbers!)).toBe(true);
  });

  it('ends a host that rests or is laid down with no slayer', () => {
    const world = find(
      'a host that rested or was laid to rest',
      (w) => ofType(w, 'dead_rested').length + ofType(w, 'dead_laid_to_rest').length > 0,
    );
    const ended = [...ofType(world, 'dead_rested'), ...ofType(world, 'dead_laid_to_rest')];
    for (const event of ended) {
      const host = [...world.creatures.values()].find((c) => c.name === event.data.beast)!;
      expect(host.died, host.name).toBeDefined();
      expect(host.slainBy).toBeUndefined();
      expect(host.slayerId).toBeUndefined();
    }
  });
});
