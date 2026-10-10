import { afterEach, expect, it, vi } from 'vitest';
import { buildRecap, completedPeriods, periodTitle } from '../../src/controller/recaps';
import { WorldController, NORMAL_WEEK_MS, type WorldRuntime } from '../../src/controller/world';
import { browserClock } from '../../src/controller/save-queue';
import { canonicalJson } from '../../src/sim/canonical';
import { capture } from '../../src/sim/immutable';
import { createSettlement } from '../../src/sim/settlement-initial';
import { simulateSettlement } from '../../src/sim/settlement';
import type { SettlementEvent, SettlementState } from '../../src/sim/state';
import type { RecapCadence } from '../../src/adapters/reader-preferences';

const prose = (recap: ReturnType<typeof buildRecap>) =>
  recap.paragraphs
    .map((paragraph) => paragraph.tokens.map((token) => token.text).join(''))
    .join('\n\n');

// Controlled archive projections exercise rare writing cases; these are not seed trajectories.
function projection(
  entries: Array<Pick<SettlementEvent, 'type' | 'tick' | 'facts'> & Partial<SettlementEvent>>,
  tick = 48,
) {
  const state = structuredClone(createSettlement('RIVERSIDE')) as SettlementState;
  state.tick = tick;
  state.events = [
    state.events[0]!,
    ...entries.map((entry, index) => ({
      ...state.events[0]!,
      id: index + 2,
      phase: 1,
      entityIds: [],
      causes: [],
      effects: {},
      ...entry,
    })),
  ];
  return capture(state);
}

it('uses completed calendar periods and rejects future, partial and unsafe periods', () => {
  expect(completedPeriods(47, 'yearly')).toBe(0);
  expect(completedPeriods(48, 'yearly')).toBe(1);
  expect(completedPeriods(11, 'seasonal')).toBe(0);
  expect(completedPeriods(12, 'seasonal')).toBe(1);
  expect(periodTitle({ kind: 'seasonal', endTick: 48 })).toBe('Winter · Year 1');
  expect(periodTitle({ kind: 'seasonal', endTick: 60 })).toBe('Spring · Year 2');
  const world = simulateSettlement('RIVERSIDE', 48).state;
  for (const endTick of [0, 47, 96, -48, Number.MAX_SAFE_INTEGER + 1])
    expect(() => buildRecap(world, { kind: 'yearly', endTick })).toThrow();
});

it.each(['RIVERSIDE', 'THIMBLE'])(
  'keeps %s history unchanged and earlier recaps independent of future events and current stocks',
  (seed) => {
    const early = simulateSettlement(seed, 48).state;
    const later = simulateSettlement(seed, 96).state;
    const before = canonicalJson(later);
    const recap = buildRecap(later, { kind: 'yearly', endTick: 48 });
    expect(recap).toEqual(buildRecap(early, { kind: 'yearly', endTick: 48 }));
    expect(recap.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(recap.paragraphs.length).toBeLessThanOrEqual(4);
    for (const paragraph of recap.paragraphs) {
      for (const id of paragraph.sourceIds)
        expect(later.events[id - 1]!.tick).toBeLessThanOrEqual(48);
      for (const token of paragraph.tokens)
        if (token.kind === 'record') expect(paragraph.sourceIds).toContain(token.eventId);
    }
    const seasonal = buildRecap(later, { kind: 'seasonal', endTick: 48 });
    expect(seasonal.startTick).toBe(37);
    expect(seasonal.paragraphs.length).toBeLessThanOrEqual(2);
    expect(prose(seasonal)).toContain('dormant crops and no crop food');
    expect(canonicalJson(later)).toBe(before);
  },
);

it('combines demographic counts without assigning lives or making co-occurrence a cause', () => {
  const world = projection([
    { type: 'shortage_started', tick: 12, facts: { shortfall: 6 } },
    { type: 'births', tick: 12, facts: { count: 2 } },
    { type: 'deaths', tick: 24, facts: { count: 1 } },
    { type: 'shortage_recovered', tick: 25, facts: {} },
    { type: 'births', tick: 36, facts: { count: 3 } },
  ]);
  const recap = buildRecap(world, { kind: 'yearly', endTick: 48 });
  expect(prose(recap)).toContain('5 births and 1 death were recorded');
  expect(prose(recap)).toContain('full rations were restored');
  expect(prose(recap)).not.toMatch(/because|starved|mourned|felt|married/);
  expect(recap.sourceIds).toEqual([2, 3, 4, 5, 6]);
});

it('links a field contribution only when its harvest records both the field and its completion cause', () => {
  const entries: Parameters<typeof projection>[0] = [
    { type: 'construction_completed', tick: 13, facts: { kind: 'field' }, entityIds: [11] },
    {
      type: 'harvest',
      tick: 24,
      facts: {
        season: 'summer',
        seasonMultiplier: 1000,
        total: 50,
        fields: [{ id: 11, yield: 7 }],
      },
      causes: [2],
    },
  ];
  expect(prose(buildRecap(projection(entries), { kind: 'yearly', endTick: 48 }))).toContain(
    'that field contributed 7 food',
  );
  entries[1]!.causes = [];
  expect(prose(buildRecap(projection(entries), { kind: 'yearly', endTick: 48 }))).not.toContain(
    'that field contributed',
  );
});

it('retains historical building and decay links after removal and gives extinction its own conclusion', () => {
  const world = projection([
    { type: 'building_decay', tick: 36, facts: {} },
    { type: 'building_removed', tick: 36, facts: { kind: 'store' }, entityIds: [10], causes: [2] },
    { type: 'deaths', tick: 48, facts: { count: 1 } },
    { type: 'extinction', tick: 48, facts: {} },
  ]);
  const recap = buildRecap(world, { kind: 'yearly', endTick: 48 });
  expect(prose(recap)).toContain('store #10');
  expect(prose(recap)).toContain('season-end decay');
  expect(prose(recap)).toContain('when no residents remained');
  expect(recap.sourceIds).toEqual([2, 3, 4, 5]);
});

it('leaves empty intervals quiet and rejects unsupported numerical evidence', () => {
  const quiet = buildRecap(projection([]), { kind: 'yearly', endTick: 48 });
  expect(quiet.paragraphs).toHaveLength(1);
  expect(quiet.sourceIds).toEqual([]);
  expect(prose(quiet)).toContain('No new events were recorded');
  expect(() =>
    buildRecap(projection([{ type: 'births', tick: 48, facts: { count: 'many' } }]), {
      kind: 'yearly',
      endTick: 48,
    }),
  ).toThrow('supported count');
});

afterEach(() => vi.useRealTimers());
function runtime(preference: RecapCadence = 'yearly') {
  let savedPreference = preference;
  const value: WorldRuntime = {
    clock: browserClock,
    available: () => false,
    acquire: async () => {
      throw new Error('No writer in this fixture');
    },
    open: async () => {
      throw new Error('No storage in this fixture');
    },
    visible: () => true,
    session: () => 'recap-session',
    recapPreference: () => savedPreference,
    storeRecapPreference: (next) => {
      savedPreference = next;
    },
  };
  return { value, preference: () => savedPreference };
}

it.each([1, 4, 16] as const)(
  'pauses exactly after a complete year at %ix without changing history',
  async (speed) => {
    vi.useFakeTimers();
    const r = runtime();
    const c = new WorldController(r.value);
    await c.initialize();
    await c.newWorld('RIVERSIDE');
    c.speed(speed);
    c.play();
    vi.advanceTimersByTime((NORMAL_WEEK_MS * 47) / speed);
    expect(c.view.world!.tick).toBe(47);
    expect(c.view.recapRequest).toBeNull();
    vi.advanceTimersByTime((NORMAL_WEEK_MS * 2) / speed);
    expect(c.view.world!.tick).toBe(48);
    expect(c.view.playing).toBe(false);
    expect(c.view.recapRequest).toMatchObject({ kind: 'yearly', endTick: 48 });
    expect(canonicalJson(c.view.world)).toBe(
      canonicalJson(simulateSettlement('RIVERSIDE', 48).state),
    );
    vi.advanceTimersByTime(NORMAL_WEEK_MS * 100);
    expect(c.view.world!.tick).toBe(48);
    c.play();
    vi.advanceTimersByTime(NORMAL_WEEK_MS / speed);
    expect(c.view.world!.tick).toBe(49);
    expect(c.view.playing).toBe(true);
    await c.dispose();
  },
);

it('supports seasonal/off preferences, manual reading, Step, and cadence changes without old interruptions', async () => {
  vi.useFakeTimers();
  const r = runtime('off'),
    c = new WorldController(r.value);
  await c.initialize();
  await c.newWorld('RIVERSIDE');
  for (let i = 0; i < 12; i++) c.step();
  expect(c.view.recapRequest).toBeNull();
  const before = canonicalJson(c.view.world);
  c.readRecap({ kind: 'seasonal', endTick: 12 });
  expect(canonicalJson(c.view.world)).toBe(before);
  c.recapCadence('seasonal');
  expect(r.preference()).toBe('seasonal');
  c.play();
  vi.advanceTimersByTime(NORMAL_WEEK_MS * 13);
  expect(c.view.world!.tick).toBe(24);
  expect(c.view.recapRequest).toMatchObject({ kind: 'seasonal', endTick: 24 });
  c.recapCadence('off');
  c.play();
  vi.advanceTimersByTime(NORMAL_WEEK_MS * 26);
  expect(c.view.world!.tick).toBe(50);
  c.recapCadence('seasonal');
  vi.advanceTimersByTime(NORMAL_WEEK_MS * 11);
  expect(c.view.world!.tick).toBe(60);
  expect(c.view.recapRequest).toMatchObject({ kind: 'seasonal', endTick: 60 });
  const request = c.view.recapRequest;
  await c.newWorld('bad seed');
  expect(c.view.recapRequest).toBe(request);
  await c.newWorld('RIVERSIDE');
  expect(c.view.recapRequest).toBeNull();
  expect(c.view.playing).toBe(false);
  await c.dispose();
});
