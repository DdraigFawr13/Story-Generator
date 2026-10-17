import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { TIERS, generateWorld, type Order, type WorldState } from '../../src/engine';
import { findWorld } from './helpers/find-world';

// Each test searches a short fixed seed list for a world with the example it checks (first match
// wins); worlds are generated once per seed and shared.
const SEEDS = ['OR-9', 'OR-1', 'OR-2', 'OR-3', 'OR-4', 'OR-5', 'OR-6', 'OR-7', 'OR-8'];
const make = (seed: string) =>
  generateWorld(seed, { width: 128, height: 128, historyYears: 250 }, DEFAULT_CONTENT);
const find = (what: string, has: (w: WorldState) => boolean) =>
  findWorld(what, 'orders', SEEDS, make, has).world;
const ofType = (w: WorldState, type: string) => w.events.filter((e) => e.type === type);
const orders = (w: WorldState): Order[] => [...w.orders.values()];

describe('orders and academies', () => {
  it('are founded by legends (orders also by heroes and captains), with a unique name, the founder as first head and every head a member', () => {
    const world = find('an order or academy', (w) => w.orders.size > 0);
    const names = new Set<string>();
    for (const order of orders(world)) {
      const founder = world.people.get(order.founderId)!;
      const legend = founder.magic.power >= TIERS.legendary.minPower;
      if (order.kind === 'academy' || !legend)
        // A hero or captain who founded an order may have taken a seat since.
        expect(
          legend || ['hero', 'captain', 'ruler'].includes(founder.title ?? ''),
          order.name,
        ).toBe(true);
      if (order.kind === 'academy') expect(legend, order.name).toBe(true);
      expect(names.has(order.name), `${order.name} repeats`).toBe(false);
      names.add(order.name);
      expect(order.heads[0]).toBe(order.founderId);
      expect(order.members[0]).toBe(order.founderId);
      for (const head of order.heads) expect(order.members, order.name).toContain(head);
      expect(world.events.some((e) => e.id === order.event)).toBe(true);
    }
  }, 30_000);

  it('never put a college or an academy in a people that hunts mages, and a burned mage dies of the hunt', () => {
    const world = find('a burned mage', (w) =>
      ofType(w, 'mage_hunted').some((e) => String(e.data.outcome) === 'was burned'),
    );
    const rules = DEFAULT_CONTENT.history.orders;
    const persecutes = (civName: string) => {
      const civ = [...world.civs.values()].find((c) => c.name === civName)!;
      const culture = DEFAULT_CONTENT.cultures.find((c) => c.id === civ.cultureId)!;
      let score = 0;
      for (const [value, weight] of Object.entries(rules.attitude.weights))
        score += (weight ?? 0) * culture.values[value as keyof typeof culture.values];
      return score <= rules.attitude.persecuteAt;
    };
    for (const type of ['academy_founded', 'college_founded'])
      for (const event of ofType(world, type))
        expect(persecutes(String(event.data.civ)), `${type} of ${event.data.civ}`).toBe(false);
    const burned = ofType(world, 'mage_hunted').filter((e) => e.data.outcome === 'was burned');
    for (const hunt of burned) {
      const death = ofType(world, 'notable_died').find((e) => e.actors[0] === hunt.actors[0]);
      expect(death?.causes, String(hunt.data.name)).toContain(hunt.id);
      expect(world.people.get(hunt.actors[0]!)?.causeOfDeath).toBe('execution');
    }
  }, 30_000);

  it('only lose spells that were in the lore, once each', () => {
    const world = find('an academy that lost a spell', (w) =>
      orders(w).some((o) => o.lost.length > 0),
    );
    for (const academy of orders(world).filter((o) => o.kind === 'academy')) {
      for (const spell of academy.lost) expect(academy.lore, academy.name).toContain(spell);
      expect(new Set(academy.lost).size).toBe(academy.lost.length);
    }
  }, 30_000);
});
