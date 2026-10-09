import { describe, expect, it } from 'vitest';
import { WorldController, NORMAL_WEEK_MS, type WorldRuntime } from '../../src/controller/world';
import { SaveQueue, type TimerClock } from '../../src/controller/save-queue';
import {
  decodeSave,
  prepareSave,
  type SaveEnvelope,
  type SaveStore,
} from '../../src/adapters/local-save';
import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalJson } from '../../src/sim/canonical';
import { simulateSettlement } from '../../src/sim/settlement';
import { createSettlement } from '../../src/sim/settlement-initial';
import { headline } from '../../src/controller/chronicle';

class Clock implements TimerClock {
  time = 0;
  next = 0;
  jobs = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  set(callback: () => void, ms: number) {
    const id = ++this.next;
    this.jobs.set(id, { at: this.time + ms, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  }
  clear(id: ReturnType<typeof setTimeout>) {
    this.jobs.delete(id as unknown as number);
  }
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const job = [...this.jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!job || job[1].at > end) break;
      this.time = job[1].at;
      this.jobs.delete(job[0]);
      job[1].callback();
    }
    this.time = end;
  }
}
async function until(predicate: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise<void>((done) => setImmediate(done));
  }
  throw new Error('Async operation did not settle');
}
function memory(value: unknown = undefined) {
  const state = {
    value,
    writes: [] as SaveEnvelope[],
    failure: false,
    hold: false,
    finish: null as (() => void) | null,
  };
  const store: SaveStore = {
    read: async () => state.value,
    close() {},
    write: async (envelope) => {
      if (state.hold)
        await new Promise<void>((done) => {
          state.finish = done;
        });
      if (state.failure) throw new Error('Quota exceeded');
      state.value = envelope;
      state.writes.push(envelope);
    },
  };
  return { state, store };
}
function runtime(store: SaveStore, clock = new Clock()) {
  let visible = true,
    owner = true,
    session = 0;
  const value: WorldRuntime = {
    clock,
    available: () => true,
    open: async () => store,
    acquire: async () => ({ owner, release() {} }),
    visible: () => visible,
    session: () => `session-${++session}`,
  };
  return {
    value,
    clock,
    hide: () => {
      visible = false;
    },
    show: () => {
      visible = true;
    },
    owner: (next: boolean) => {
      owner = next;
    },
  };
}

it('validates full envelopes, checksums and independently checksummed invalid state', async () => {
  const world = simulateSettlement('RIVERSIDE', 57).state;
  const envelope = await prepareSave(world, 'session', 1);
  expect(canonicalJson((await decodeSave(structuredClone(envelope))).payload)).toBe(
    canonicalJson(world),
  );
  const damaged = structuredClone(envelope);
  (damaged.payload as { tick: number }).tick++;
  await expect(decodeSave(damaged)).rejects.toThrow('checksum');
  damaged.digest = await digestCanonical(damaged.payload);
  await expect(decodeSave(damaged)).rejects.toThrow();
  await expect(decodeSave({ ...envelope, envelopeVersion: 2 })).rejects.toThrow('unsupported');
  await expect(decodeSave({ ...envelope, generation: 0 })).rejects.toThrow('metadata');
});

describe('run control and local sessions', () => {
  it.each([1, 4, 16] as const)('same weeks at %ix equal the headless world', async (speed) => {
    const m = memory(),
      r = runtime(m.store);
    r.value.available = () => false;
    const c = new WorldController(r.value);
    await c.initialize();
    await c.newWorld('RIVERSIDE');
    c.speed(speed);
    c.play();
    r.clock.advance((NORMAL_WEEK_MS / speed) * 57);
    expect(c.view.world!.tick).toBe(57);
    expect(canonicalJson(c.view.world)).toBe(
      canonicalJson(simulateSettlement('RIVERSIDE', 57).state),
    );
    c.pause();
    r.clock.advance(100000);
    expect(c.view.world!.tick).toBe(57);
    await c.dispose();
  });
  it('hides before a due tick, clears debt and remains paused after repeated returns', async () => {
    const m = memory(),
      r = runtime(m.store);
    r.value.available = () => false;
    const c = new WorldController(r.value);
    await c.initialize();
    await c.newWorld('RIVERSIDE');
    c.play();
    r.clock.advance(14999);
    r.hide();
    c.visibilityChanged();
    r.clock.advance(100000);
    r.show();
    c.visibilityChanged();
    expect(c.view.world!.tick).toBe(0);
    expect(c.view.playing).toBe(false);
    c.play();
    r.clock.advance(15000);
    expect(c.view.world!.tick).toBe(1);
    for (let i = 0; i < 3; i++) {
      r.hide();
      c.visibilityChanged();
      r.clock.advance(90000);
      r.show();
      c.visibilityChanged();
    }
    expect(c.view.world!.tick).toBe(1);
    c.play();
    r.clock.advance(14999);
    expect(c.view.world!.tick).toBe(1);
    r.clock.advance(1);
    expect(c.view.world!.tick).toBe(2);
    await c.dispose();
  });
  it('checks actual visibility in the due callback and rejects a complete over-limit week', async () => {
    const m = memory(),
      r = runtime(m.store);
    r.value.available = () => false;
    const c = new WorldController(r.value, { maxEvents: 1, maxBytes: 16777216 });
    await c.initialize();
    await c.newWorld('RIVERSIDE');
    c.play();
    r.hide();
    r.clock.advance(15000);
    expect(c.view.world!.tick).toBe(0);
    expect(c.view.playing).toBe(false);
    r.show();
    const before = canonicalJson(c.view.world);
    c.step();
    expect(canonicalJson(c.view.world)).toBe(before);
    expect(c.view.halted).toContain('event-limit');
    await c.dispose();
  });
  it('resumes the stored RNG, IDs and archive paused: 57+80 equals 137', async () => {
    const m = memory(await prepareSave(simulateSettlement('RIVERSIDE', 57).state, 'older', 4));
    const r = runtime(m.store),
      c = new WorldController(r.value);
    await c.initialize();
    expect(c.view.world).toBeNull();
    await c.resume();
    expect(c.view.playing).toBe(false);
    expect(c.view.save.savedTick).toBe(57);
    for (let i = 0; i < 80; i++) c.step();
    expect(canonicalJson(c.view.world)).toBe(
      canonicalJson(simulateSettlement('RIVERSIDE', 137).state),
    );
    await c.dispose();
  });
  it('protects the previous slot while a new candidate advances and replacement fails', async () => {
    const original = await prepareSave(createSettlement('WORLD_A'), 'older', 1),
      m = memory(original),
      r = runtime(m.store),
      c = new WorldController(r.value);
    await c.initialize();
    await c.newWorld('WORLD_B');
    for (let i = 0; i < 25; i++) c.step();
    r.clock.advance(30000);
    expect(m.state.value).toBe(original);
    expect(c.view.replaceRequired).toBe(true);
    c.save();
    expect(m.state.writes).toHaveLength(0);
    m.state.failure = true;
    c.save(true);
    await until(() => !c.view.save.saving);
    expect(c.view.save.error).toContain('Quota');
    expect(m.state.value).toBe(original);
    expect(c.view.replaceRequired).toBe(true);
    m.state.failure = false;
    await c.resume();
    expect(c.view.world!.seed).toBe('WORLD_A');
    expect(c.view.playing).toBe(false);
    await c.dispose();
  });
  it('preserves a running world on failed resume and the corrupt slot until explicit replacement', async () => {
    const m = memory({ envelopeVersion: 99 }),
      r = runtime(m.store),
      c = new WorldController(r.value);
    await c.initialize();
    expect(c.view.loadError).toContain('unsupported');
    await c.newWorld('RIVERSIDE');
    c.step();
    const before = canonicalJson(c.view.world);
    await c.resume();
    expect(canonicalJson(c.view.world)).toBe(before);
    expect(m.state.value).toEqual({ envelopeVersion: 99 });
    expect(c.view.replaceRequired).toBe(true);
    c.save(true);
    await until(() => !c.view.save.saving);
    expect((await decodeSave(m.state.value)).payload.tick).toBe(1);
    await c.dispose();
  });
  it.each([undefined, { envelopeVersion: 99 }])(
    'a denied lock cannot advance even an empty or invalid slot',
    async (slot) => {
      const m = memory(slot),
        r = runtime(m.store);
      r.owner(false);
      const c = new WorldController(r.value);
      await c.initialize();
      await c.newWorld('RIVERSIDE');
      c.step();
      c.play();
      expect(c.view.mode).toBe('read-only');
      expect(c.view.world).toBeNull();
      expect(c.view.playing).toBe(false);
      m.state.value = await prepareSave(simulateSettlement('RIVERSIDE', 12).state, 'owner', 1);
      r.owner(true);
      await c.takeOwnership();
      expect(c.view.world!.tick).toBe(12);
      expect(c.view.save.savedTick).toBe(12);
      expect(c.view.playing).toBe(false);
      await c.dispose();
    },
  );
  it('cannot autosave over an unreadable slot after storage initialization fails', async () => {
    const m = memory({ precious: 'old' }),
      r = runtime(m.store);
    r.value.open = async () => ({
      ...m.store,
      read: async () => {
        throw new Error('Read blocked');
      },
    });
    const c = new WorldController(r.value);
    await c.initialize();
    await c.newWorld('RIVERSIDE');
    for (let i = 0; i < 21; i++) c.step();
    c.save();
    expect(c.view.mode).toBe('unavailable');
    expect(m.state.writes).toHaveLength(0);
    expect(m.state.value).toEqual({ precious: 'old' });
    await c.dispose();
  });
});

describe('save capture, queue and retry boundaries', () => {
  it('captures the clicked manual tick, coalesces autosaves and reports only committed progress', async () => {
    const m = memory(),
      clock = new Clock();
    m.state.hold = true;
    const q = new SaveQueue(
      m.store,
      clock,
      () => {},
      () => {},
    );
    q.begin('one', 0, null);
    const s = simulateSettlement('RIVERSIDE', 48).state;
    q.automatic(simulateSettlement('RIVERSIDE', 20).state);
    await until(() => m.state.finish !== null);
    q.manual(simulateSettlement('RIVERSIDE', 40).state);
    q.manual(s);
    q.automatic(s);
    expect(q.status.savedTick).toBeNull();
    expect(q.status.manualPending).toBe(true);
    m.state.hold = false;
    m.state.finish!();
    await until(() => !q.status.saving);
    expect(m.state.writes.map((e) => e.payload.tick)).toEqual([20, 40]);
    expect(q.status.savedTick).toBe(40);
    clock.advance(5000);
    await until(() => !q.status.saving);
    expect(m.state.writes.map((e) => e.payload.tick)).toEqual([20, 40, 48]);
    await q.settle();
  });
  it('retains a throttled autosave when paused and retries failures after 30 seconds', async () => {
    const m = memory(),
      clock = new Clock(),
      q = new SaveQueue(
        m.store,
        clock,
        () => {},
        () => {},
      );
    q.begin('one', 0, null);
    q.automatic(createSettlement('RIVERSIDE'), true);
    await until(() => !q.status.saving);
    q.automatic(simulateSettlement('RIVERSIDE', 20).state);
    expect(q.status.automaticPending).toBe(true);
    clock.advance(4999);
    expect(m.state.writes).toHaveLength(1);
    m.state.failure = true;
    clock.advance(1);
    await until(() => !q.status.saving);
    expect(q.status.savedTick).toBe(0);
    m.state.failure = false;
    clock.advance(29999);
    expect(m.state.writes).toHaveLength(1);
    clock.advance(1);
    await until(() => !q.status.saving);
    expect(q.status.savedTick).toBe(20);
    await q.settle();
  });
  it('manual retry bypasses backoff and a session switch waits for the old in-flight transaction', async () => {
    const m = memory(),
      clock = new Clock(),
      q = new SaveQueue(
        m.store,
        clock,
        () => {},
        () => {},
      );
    q.begin('one', 0, null);
    m.state.failure = true;
    q.manual(createSettlement('RIVERSIDE'));
    await until(() => !q.status.saving);
    m.state.failure = false;
    q.manual(simulateSettlement('RIVERSIDE', 2).state);
    await until(() => !q.status.saving);
    expect(q.status.savedTick).toBe(2);
    m.state.hold = true;
    q.manual(simulateSettlement('RIVERSIDE', 3).state);
    await until(() => m.state.finish !== null);
    q.automatic(simulateSettlement('RIVERSIDE', 24).state);
    let settled = false;
    const settling = q.settle().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(() => q.begin('two', 2, null)).toThrow('flight');
    m.state.hold = false;
    m.state.finish!();
    await settling;
    q.begin('two', 3, null);
    q.manual(createSettlement('WORLD_B'));
    await until(() => !q.status.saving);
    expect(m.state.writes.map((e) => [e.session, e.payload.tick])).toEqual([
      ['one', 2],
      ['one', 3],
      ['two', 0],
    ]);
    expect(q.status.savedTick).toBe(0);
    await q.settle();
  });
});

it('headlines use immutable event facts, including an actual harvest total', () => {
  const world = simulateSettlement('RIVERSIDE', 12).state;
  const event = world.events.find((e) => e.type === 'harvest')!;
  const before = canonicalJson(world);
  expect(headline(event)).toContain(String(event.facts.total));
  expect(canonicalJson(world)).toBe(before);
});
