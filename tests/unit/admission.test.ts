import { describe, expect, it } from 'vitest';
import {
  admitTick,
  advanceTicks,
  historyLimitReason,
  validateArchive,
} from '../../src/sim/admission';
import { canonicalBytes } from '../../src/sim/canonical';
import { capture, type Immutable } from '../../src/sim/immutable';
import { uniform } from '../../src/sim/rng';

const initial = {
  tick: 0,
  rng: 1,
  nextId: 2,
  text: 'é𐍈',
  events: [{ id: 1, tick: 0, causes: [] as number[] }],
};
type Fixture = typeof initial;
function reduce(state: Immutable<Fixture>): Fixture {
  const draw = uniform(state.rng, 1000);
  return {
    ...state,
    tick: state.tick + 1,
    rng: draw.state,
    nextId: state.nextId + 1,
    events: [
      ...state.events.map((event) => ({ ...event, causes: [...event.causes] })),
      { id: state.nextId, tick: state.tick + 1, causes: [state.nextId - 1] },
    ],
  };
}

describe('candidate admission in every runner', () => {
  it('admits inclusive event and UTF-8 byte boundaries', () => {
    const committed = capture(initial),
      candidate = reduce(committed);
    const bytes = canonicalBytes(candidate).byteLength;
    expect(bytes).toBeGreaterThan(new TextDecoder().decode(canonicalBytes(candidate)).length);
    expect(admitTick(committed, candidate, { maxEvents: 2, maxBytes: bytes }).rejected).toBeNull();
    expect(admitTick(committed, candidate, { maxEvents: 2, maxBytes: bytes - 1 })).toEqual({
      state: committed,
      rejected: 'payload-limit',
    });
    expect(admitTick(committed, candidate, { maxEvents: 1, maxBytes: bytes })).toEqual({
      state: committed,
      rejected: 'event-limit',
    });
    expect(committed.rng).toBe(1);
    expect(committed.nextId).toBe(2);
    expect(committed.events).toHaveLength(1);
  });
  it('halts the headless runner at the last complete state', () => {
    const result = advanceTicks(initial, 100, reduce, { maxEvents: 3, maxBytes: 10_000 });
    expect(result.advanced).toBe(2);
    expect(result.state.tick).toBe(2);
    expect(result.state.events).toHaveLength(3);
    expect(result.halted).toBe('event-limit');
    expect(result.state).toEqual(advanceTicks(initial, 2, reduce).state);
    expect(initial.rng).toBe(1);
    expect(initial.events).toHaveLength(1);
  });
  it('agrees across uninterrupted and captured continuation runs', () => {
    const whole = advanceTicks(initial, 137, reduce);
    const first = advanceTicks(initial, 57, reduce);
    const second = advanceTicks(JSON.parse(JSON.stringify(first.state)) as Fixture, 80, reduce);
    expect(canonicalBytes(second.state)).toEqual(canonicalBytes(whole.state));
  });
  it('prevents a reducer mutating the committed input', () => {
    expect(() =>
      advanceTicks(initial, 1, (state) => {
        (state as Fixture).rng = 42;
        return reduce(state);
      }),
    ).toThrow(TypeError);
    expect(initial.rng).toBe(1);
  });
  it('rejects rewrites, forward causes, duplicates and partial ticks', () => {
    const committed = capture(initial),
      candidate = reduce(committed);
    expect(() => admitTick(committed, { ...candidate, tick: 2 })).toThrow();
    expect(() =>
      admitTick<Fixture>(committed, { ...candidate, events: [{ id: 1, tick: 0, causes: [] }] }),
    ).not.toThrow();
    expect(() => admitTick<Fixture>(committed, { ...candidate, events: [] })).toThrow('truncate');
    expect(() =>
      admitTick(committed, { ...candidate, events: [{ id: 1, tick: 0, causes: [1] }] }),
    ).toThrow();
    expect(() => validateArchive({ tick: 1, events: [{ id: 1, tick: 2, causes: [] }] })).toThrow();
    expect(() => validateArchive({ tick: 1, events: [{ id: 2, tick: 1, causes: [] }] })).toThrow();
    expect(() =>
      validateArchive({
        tick: 1,
        events: [
          { id: 1, tick: 0, causes: [] },
          { id: 2, tick: 1, causes: [1, 1] },
        ],
      }),
    ).toThrow();
    expect(() => historyLimitReason(initial, { maxEvents: -1, maxBytes: 1000 })).toThrow();
    expect(() => advanceTicks(initial, -1, reduce)).toThrow();
  });
});
