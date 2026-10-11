import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DEFAULT_SYSTEMS,
  RngStream,
  advance,
  createWorld,
  dateOf,
  deserializeWorld,
  nextUint32,
  serializeWorld,
  streamFor,
  templateNarrator,
  validateContent,
  worldDigest,
  type RngState,
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

describe('rng streams (sfc32)', () => {
  it('matches an independent sfc32 reference vector', () => {
    // Computed with a separate Python implementation of sfc32 from state (1, 2, 3, 4).
    const state: RngState = [1, 2, 3, 4];
    const outputs = Array.from({ length: 6 }, () => nextUint32(state));
    expect(outputs).toEqual([7, 34, 56623200, 188882296, 3431242869, 399395954]);
    expect(state).toEqual([1394743453, 3685998991, 1926089571, 10]);
  });

  it('keeps named streams independent and reproducible', () => {
    const draw = (seed: string, name: string) => {
      const rng = RngStream.detached(seed, name);
      return Array.from({ length: 8 }, () => rng.int(1000));
    };
    expect(draw('A', 'x')).toEqual(draw('A', 'x'));
    expect(draw('A', 'x')).not.toEqual(draw('A', 'y'));
    expect(draw('A', 'x')).not.toEqual(draw('B', 'x'));

    // Using a new stream must not change an existing one.
    const plain = createWorld('STREAMS');
    const mixed = createWorld('STREAMS');
    streamFor(mixed, 'other').int(10);
    expect(streamFor(plain, 'main').int(1_000_000)).toBe(streamFor(mixed, 'main').int(1_000_000));
  });

  it('spreads draws evenly, including across similar seeds', () => {
    const counts = new Array<number>(10).fill(0);
    for (let s = 0; s < 2000; s += 1) {
      const rng = RngStream.detached(`seed${s}`, 'even');
      for (let i = 0; i < 5; i += 1) counts[rng.int(10)]! += 1;
    }
    // 10,000 draws: each bucket expects 1,000; ±150 is far outside normal variation.
    for (const count of counts) expect(Math.abs(count - 1000)).toBeLessThan(150);
  });
});
