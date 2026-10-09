import { randomSeed } from '../adapters/crypto';
import { DEFAULT_HISTORY_LIMITS, historyLimitReason, type HistoryLimits } from '../sim/admission';
import { FOUNDATION_CONFIG } from '../sim/config';
import { createFoundingSnapshot, type FoundingSnapshot } from '../sim/founding';
import { capture } from '../sim/immutable';

function present(snapshot: FoundingSnapshot) {
  return capture({
    seed: snapshot.seed,
    settlement: snapshot.world.settlement,
    width: snapshot.world.map.width,
    height: snapshot.world.map.height,
    tiles: snapshot.world.map.tiles,
    buildings: snapshot.world.buildings,
    housing:
      snapshot.world.buildings.filter((building) => building.kind === 'hut').length *
      FOUNDATION_CONFIG.hutCapacity,
    foodCapacity:
      FOUNDATION_CONFIG.baseFoodCapacity +
      snapshot.world.buildings.filter((building) => building.kind === 'store').length *
        FOUNDATION_CONFIG.storeCapacity,
    clearedTimber: snapshot.events[0]!.facts.clearedTimber,
    fallback: snapshot.events[0]!.facts.fallback,
  });
}

export type FoundingView = ReturnType<typeof present>;

export class FoundingController {
  #snapshot: FoundingSnapshot;
  #view: FoundingView;
  readonly #limits: HistoryLimits;

  constructor(seed = 'RIVERSIDE', limits: HistoryLimits = DEFAULT_HISTORY_LIMITS) {
    this.#limits = capture(limits);
    this.#snapshot = this.#build(seed);
    this.#view = present(this.#snapshot);
  }

  #build(seed: string): FoundingSnapshot {
    const candidate = createFoundingSnapshot(seed);
    const rejected = historyLimitReason(candidate, this.#limits);
    if (rejected) throw new Error(`Founding world exceeds ${rejected}.`);
    return candidate;
  }

  get view(): FoundingView {
    return this.#view;
  }
  get snapshot(): FoundingSnapshot {
    return this.#snapshot;
  }

  generate(seed: string): FoundingView {
    const candidate = this.#build(seed);
    const view = present(candidate);
    // Publish only after generation, validation and admission have succeeded.
    this.#snapshot = candidate;
    this.#view = view;
    return view;
  }

  generateRandom(): FoundingView {
    return this.generate(randomSeed());
  }
}
