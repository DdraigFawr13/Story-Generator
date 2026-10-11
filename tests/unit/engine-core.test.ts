import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DEFAULT_SYSTEMS,
  advance,
  createWorld,
  dateOf,
  deserializeWorld,
  serializeWorld,
  templateNarrator,
  validateContent,
  worldDigest,
  type Simulation,
} from '../../src/engine';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };

describe('engine core', () => {
  it('ships valid default content', () => {
    expect(validateContent(DEFAULT_CONTENT)).toEqual([]);
  });

  it('is deterministic for the same seed (R-03)', () => {
    const a = createWorld('RIVERSIDE');
    const b = createWorld('RIVERSIDE');
    advance(a, SIM, 336 * 5);
    advance(b, SIM, 336 * 5);
    expect(worldDigest(a)).toBe(worldDigest(b));
    expect(worldDigest(a)).not.toBe(worldDigest(advanceNew('OTHER', 336 * 5)));
  });

  it('continues identically after save and load', () => {
    const straight = createWorld('SAVETEST');
    advance(straight, SIM, 900);
    const split = createWorld('SAVETEST');
    advance(split, SIM, 400);
    const restored = deserializeWorld(serializeWorld(split));
    advance(restored, SIM, 500);
    expect(worldDigest(restored)).toBe(worldDigest(straight));
  });

  it('keeps the calendar readable', () => {
    expect(dateOf(0)).toEqual({ year: 1, month: 0, dayOfMonth: 1, season: 'spring' });
    expect(dateOf(336 + 28 * 9).season).toBe('winter');
  });

  it('renders every emitted event and links causes', () => {
    const world = advanceNew('CHRONICLE', 336 * 10);
    const narrator = templateNarrator(DEFAULT_CONTENT, (id) => `#${id}`);
    for (const event of world.events) expect(narrator.renderEvent(event)).not.toMatch(/[{}[\]]/);
    const snap = world.events.find((event) => event.type === 'cold_snap');
    if (snap) expect(snap.causes.length).toBe(1);
  });

  it('rejects unhandled commands so hybrid input is never silently dropped', () => {
    const world = createWorld('CMD');
    world.commands.push({ day: 0, kind: 'build', payload: {} });
    expect(() => advance(world, SIM, 1)).toThrow(/No handler/);
  });
});

function advanceNew(seed: string, days: number) {
  const world = createWorld(seed);
  advance(world, SIM, days);
  return world;
}
