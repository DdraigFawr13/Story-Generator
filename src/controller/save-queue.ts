import { prepareSave, type SaveEnvelope, type SaveStore } from '../adapters/local-save';
import type { SettlementSnapshot } from '../sim/state';

export interface TimerClock {
  now(): number;
  set(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
}
export const browserClock: TimerClock = {
  now: () => performance.now(),
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (timer) => clearTimeout(timer),
};
export const SAVE_POLICY = Object.freeze({ interval: 20, throttleMs: 5_000, retryMs: 30_000 });
type Request = { snapshot: SettlementSnapshot; manual: boolean };

export class SaveQueue {
  #pendingAuto: Request | null = null;
  #pendingManual: Request | null = null;
  #flight: Promise<void> | null = null;
  #activeManual = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastAutomaticStart = -Infinity;
  #retryAt = -Infinity;
  #stopped = false;
  #session = '';
  #generation = 0;
  #savedTick: number | null = null;
  #error = '';

  constructor(
    readonly store: SaveStore,
    readonly clock: TimerClock,
    readonly changed: () => void,
    readonly committed: (envelope: SaveEnvelope) => void,
  ) {}

  get status() {
    return {
      saving: this.#flight !== null,
      manualPending: this.#activeManual || this.#pendingManual !== null,
      automaticPending: this.#pendingAuto !== null,
      savedTick: this.#savedTick,
      error: this.#error,
    };
  }
  begin(session: string, generation: number, savedTick: number | null) {
    if (this.#flight) throw new Error('A previous save is still in flight.');
    this.#session = session;
    this.#generation = generation;
    this.#savedTick = savedTick;
    this.#error = '';
    this.#retryAt = -Infinity;
    this.#lastAutomaticStart = -Infinity;
    this.#stopped = false;
  }
  automatic(snapshot: SettlementSnapshot, initial = false) {
    if (
      this.#stopped ||
      (!initial && snapshot.tick - (this.#savedTick ?? 0) < SAVE_POLICY.interval)
    )
      return;
    this.#pendingAuto = { snapshot, manual: false };
    this.#pump();
    this.changed();
  }
  manual(snapshot: SettlementSnapshot) {
    if (this.#stopped || this.status.manualPending) return;
    this.#pendingManual = { snapshot, manual: true };
    if (this.#pendingAuto && this.#pendingAuto.snapshot.tick <= snapshot.tick)
      this.#pendingAuto = null;
    this.#pump();
    this.changed();
  }
  async settle() {
    this.#stopped = true;
    this.#pendingAuto = this.#pendingManual = null;
    if (this.#timer !== null) this.clock.clear(this.#timer);
    this.#timer = null;
    await this.#flight;
  }
  #pump() {
    if (this.#stopped || this.#flight) return;
    if (this.#timer !== null) this.clock.clear(this.#timer);
    this.#timer = null;
    if (
      this.#savedTick !== null &&
      this.#pendingAuto &&
      this.#pendingAuto.snapshot.tick <= this.#savedTick
    )
      this.#pendingAuto = null;
    const request = this.#pendingManual ?? this.#pendingAuto;
    if (!request) return;
    const delay =
      Math.max(this.#lastAutomaticStart + SAVE_POLICY.throttleMs, this.#retryAt) - this.clock.now();
    if (!request.manual && delay > 0) {
      this.#timer = this.clock.set(() => {
        this.#timer = null;
        this.#pump();
      }, delay);
      return;
    }
    if (request.manual) this.#pendingManual = null;
    else {
      this.#pendingAuto = null;
      this.#lastAutomaticStart = this.clock.now();
    }
    this.#activeManual = request.manual;
    this.#error = '';
    const session = this.#session;
    this.#flight = Promise.resolve().then(async () => {
      try {
        if (this.#generation === Number.MAX_SAFE_INTEGER)
          throw new Error('Local save generation exhausted.');
        const envelope = await prepareSave(request.snapshot, session, this.#generation + 1);
        await this.store.write(envelope);
        this.#generation = envelope.generation;
        this.#savedTick = envelope.payload.tick;
        this.#retryAt = -Infinity;
        this.committed(envelope);
      } catch (error) {
        this.#error = error instanceof Error ? error.message : 'Local save failed.';
        this.#retryAt = this.clock.now() + SAVE_POLICY.retryMs;
        if (!this.#stopped && !this.#pendingAuto)
          this.#pendingAuto = { snapshot: request.snapshot, manual: false };
      } finally {
        this.#flight = null;
        this.#activeManual = false;
        this.changed();
        this.#pump();
      }
    });
    this.changed();
  }
}
