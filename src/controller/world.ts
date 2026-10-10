import { randomSeed } from '../adapters/crypto';
import {
  acquireWriter,
  decodeSave,
  openLocalStore,
  persistenceAvailable,
  type SaveEnvelope,
  type SaveStore,
  type WriterLease,
} from '../adapters/local-save';
import { DEFAULT_HISTORY_LIMITS, historyLimitReason, type HistoryLimits } from '../sim/admission';
import { calendarAtTick } from '../sim/clock';
import { capture } from '../sim/immutable';
import { createSettlement } from '../sim/settlement-initial';
import { foodCapacity, shelter } from '../sim/settlement-math';
import { advanceSettlement } from '../sim/settlement';
import type { SettlementSnapshot } from '../sim/state';
import { browserClock, SaveQueue, type TimerClock } from './save-queue';

export const NORMAL_WEEK_MS = 15_000;
export type Speed = 1 | 4 | 16;
export interface WorldRuntime {
  clock: TimerClock;
  available(): boolean;
  acquire(): Promise<WriterLease>;
  open(): Promise<SaveStore>;
  visible(): boolean;
  session(): string;
}
const browserRuntime: WorldRuntime = {
  clock: browserClock,
  available: persistenceAvailable,
  acquire: acquireWriter,
  open: openLocalStore,
  visible: () => document.visibilityState !== 'hidden',
  session: () => crypto.randomUUID(),
};

export class WorldController {
  #world: SettlementSnapshot | null = null;
  #worldSession = 0;
  #saved: SaveEnvelope | null = null;
  #slotExists = false;
  #loadError = '';
  #error = '';
  #mode: 'loading' | 'owner' | 'read-only' | 'unavailable' = 'loading';
  #playing = false;
  #speed: Speed = 1;
  #halted = '';
  #busy = false;
  #replaceRequired = false;
  #queue: SaveQueue | null = null;
  #store: SaveStore | null = null;
  #lease: WriterLease | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  #listeners = new Set<() => void>();
  #view = this.#present();

  constructor(
    readonly runtime: WorldRuntime = browserRuntime,
    readonly limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
  ) {}
  get view() {
    return this.#view;
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getView = () => this.#view;
  #present() {
    const world = this.#world;
    return Object.freeze({
      world,
      worldSession: this.#worldSession,
      mode: this.#mode,
      saved: this.#saved,
      slotExists: this.#slotExists,
      loadError: this.#loadError,
      error: this.#error,
      playing: this.#playing,
      speed: this.#speed,
      halted: this.#halted,
      busy: this.#busy,
      replaceRequired: this.#replaceRequired,
      save: this.#queue?.status ?? {
        saving: false,
        manualPending: false,
        automaticPending: false,
        savedTick: null,
        error: '',
      },
      calendar: world ? calendarAtTick(world.tick) : null,
      housing: world ? shelter(world.world.buildings) : 0,
      foodCapacity: world ? foodCapacity(world.world.buildings) : 0,
      seasonalCropPercent: world
        ? world.config.economy.seasonMultipliers[
            Math.floor((Math.max(1, world.tick) - 1) / world.config.weeksPerSeason) % 4
          ]! / 10
        : 100,
    });
  }
  #publish = () => {
    if (this.#disposed) return;
    this.#view = this.#present();
    this.#listeners.forEach((listener) => listener());
  };

  async initialize() {
    try {
      if (!this.runtime.available()) {
        this.#mode = 'unavailable';
        this.#loadError =
          'Local saves are unavailable in this browser. You can start an unsaved world.';
        return;
      }
      this.#lease = await this.runtime.acquire();
      if (this.#disposed) {
        this.#lease.release();
        return;
      }
      this.#mode = this.#lease.owner ? 'owner' : 'read-only';
      this.#store = await this.runtime.open();
      if (this.#disposed) {
        this.#store.close();
        this.#lease.release();
        return;
      }
      if (this.#lease.owner) {
        this.#queue = new SaveQueue(this.#store, this.runtime.clock, this.#publish, (envelope) => {
          this.#saved = envelope;
          this.#slotExists = true;
          this.#loadError = '';
          this.#replaceRequired = false;
          this.#publish();
        });
      }
      await this.#readSlot();
      if (this.#mode === 'read-only') this.#replaceWorld(this.#saved?.payload ?? null);
    } catch (error) {
      this.#loadError = message(error);
      // A denied writer lock must never enable unsaved advancement.
      if (this.#mode !== 'read-only') {
        await this.#queue?.settle();
        this.#queue = null;
        this.#store?.close();
        this.#lease?.release();
        this.#mode = 'unavailable';
      }
    } finally {
      this.#publish();
    }
  }
  async #readSlot() {
    const value = await this.#store!.read();
    this.#slotExists = value !== undefined;
    this.#saved = null;
    this.#loadError = '';
    if (this.#slotExists) {
      try {
        this.#saved = await decodeSave(value);
      } catch (error) {
        this.#loadError = message(error);
      }
    }
  }
  async takeOwnership() {
    if (this.#mode !== 'read-only' || this.#busy) return;
    this.#busy = true;
    this.#publish();
    try {
      const lease = await this.runtime.acquire();
      if (this.#disposed) {
        lease.release();
        return;
      }
      if (!lease.owner) {
        this.#error = 'Another tab still owns this world. Close it before taking over.';
        return;
      }
      this.#lease = lease;
      await this.#readSlot();
      this.#replaceWorld(this.#saved?.payload ?? null);
      this.#mode = 'owner';
      this.#error = '';
      this.#queue = new SaveQueue(this.#store!, this.runtime.clock, this.#publish, (envelope) => {
        this.#saved = envelope;
        this.#slotExists = true;
        this.#loadError = '';
        this.#replaceRequired = false;
        this.#publish();
      });
      if (this.#world) this.#beginSession(this.#world.tick);
    } catch (error) {
      this.#lease?.release();
      this.#error = message(error);
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }
  #canControl() {
    return (
      !this.#disposed && !this.#busy && (this.#mode === 'owner' || this.#mode === 'unavailable')
    );
  }
  #beginSession(savedTick: number | null) {
    this.#queue?.begin(this.runtime.session(), this.#saved?.generation ?? 0, savedTick);
  }
  #replaceWorld(world: SettlementSnapshot | null) {
    this.#world = world;
    this.#worldSession++;
  }
  async newWorld(seed: string) {
    if (!this.#canControl()) return;
    try {
      const candidate = createSettlement(seed);
      const limit = historyLimitReason(candidate, this.limits);
      if (limit) throw new Error(`Founding world exceeds ${limit}.`);
      this.pause();
      this.#busy = true;
      this.#publish();
      await this.#queue?.settle();
      if (this.#disposed) return;
      this.#replaceWorld(candidate);
      this.#replaceRequired = this.#slotExists;
      this.#halted = this.#error = '';
      this.#beginSession(null);
      if (!this.#replaceRequired) this.#queue?.automatic(candidate, true);
    } catch (error) {
      this.#error = message(error);
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }
  randomWorld() {
    return this.newWorld(randomSeed());
  }
  async resume() {
    if (!this.#canControl() || this.#mode !== 'owner') return;
    this.pause();
    this.#busy = true;
    this.#publish();
    try {
      await this.#queue?.settle();
      const value = await this.#store!.read();
      const candidate = await decodeSave(value);
      if (this.#disposed) return;
      const limit = historyLimitReason(candidate.payload, this.limits);
      if (limit) throw new Error(`Saved world exceeds ${limit}.`);
      this.#saved = candidate;
      this.#slotExists = true;
      this.#replaceWorld(capture(candidate.payload));
      this.#replaceRequired = false;
      this.#halted = this.#error = this.#loadError = '';
      this.#beginSession(candidate.payload.tick);
    } catch (error) {
      this.#error = message(error);
      // Keep the current world and re-enable its save queue after a rejected load.
      this.#beginSession(this.#queue?.status.savedTick ?? null);
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }
  save(replace = false) {
    if (!this.#canControl() || !this.#world || !this.#queue || (this.#replaceRequired && !replace))
      return;
    this.#queue.manual(this.#world);
  }
  step() {
    if (!this.#canControl() || !this.#world || this.#playing || this.#halted) return;
    this.#advance();
  }
  #advance() {
    try {
      const next = advanceSettlement(this.#world!, 1, this.limits);
      this.#world = next.state;
      if (next.halted) {
        this.#halted = `History limit reached (${next.halted}). The last complete week can still be inspected and saved.`;
        this.pause();
      }
      if (!this.#replaceRequired) this.#queue?.automatic(this.#world);
    } catch (error) {
      this.#error = message(error);
      this.pause();
    }
    this.#publish();
  }
  play() {
    if (!this.#canControl() || !this.#world || this.#halted || !this.runtime.visible()) return;
    this.#playing = true;
    this.#schedule();
    this.#publish();
  }
  pause() {
    if (!this.#playing && this.#timer === null) return;
    this.#playing = false;
    if (this.#timer !== null) this.runtime.clock.clear(this.#timer);
    this.#timer = null;
    this.#publish();
  }
  speed(speed: Speed) {
    if (![1, 4, 16].includes(speed)) throw new Error('Unsupported speed.');
    this.#speed = speed;
    if (this.#playing) this.#schedule();
    this.#publish();
  }
  visibilityChanged() {
    if (!this.runtime.visible()) this.pause();
  }
  #schedule() {
    if (this.#timer !== null) this.runtime.clock.clear(this.#timer);
    this.#timer = this.runtime.clock.set(() => {
      this.#timer = null;
      if (!this.#playing || !this.runtime.visible()) {
        this.pause();
        return;
      }
      this.#advance();
      if (this.#playing) this.#schedule();
    }, NORMAL_WEEK_MS / this.#speed);
  }
  async dispose() {
    this.pause();
    this.#disposed = true;
    this.#listeners.clear();
    await this.#queue?.settle();
    this.#store?.close();
    this.#lease?.release();
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'The operation failed.';
}
export type WorldView = WorldController['view'];
export type { SettlementSnapshot, SaveEnvelope };
