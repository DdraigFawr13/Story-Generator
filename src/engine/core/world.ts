// World creation, saves and digests. Saves are plain JSON of the whole state;
// there is no cross-version compatibility (R-02/R-03).

import { hashString } from './rng';
import { ENTITY_KINDS, type EntityKind, type Id, type WorldParams, type WorldState } from './types';

export const DEFAULT_PARAMS: WorldParams = { width: 256, height: 256, historyYears: 250 };

export function validateSeed(seed: string): string {
  if (seed.length < 1 || seed.length > 64 || /[^A-Za-z0-9_-]/.test(seed)) {
    throw new Error('Use 1–64 letters, numbers, underscores or hyphens for the seed.');
  }
  return seed;
}

export function createWorld(seed: string, params: Partial<WorldParams> = {}): WorldState {
  const nextId = {} as Record<EntityKind, Id>;
  for (const kind of ENTITY_KINDS) nextId[kind] = 1;
  return {
    seed: validateSeed(seed),
    day: 0,
    params: { ...DEFAULT_PARAMS, ...params },
    rng: {},
    nextId,
    people: new Map(),
    events: [],
    commands: [],
    weather: { current: 'mild', sinceDay: 0, causeEvent: null },
  };
}

// Maps become tagged arrays so JSON round-trips exactly.
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Map ? { $map: [...value.entries()] } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '$map' in value) {
    return new Map((value as { $map: [unknown, unknown][] }).$map);
  }
  return value;
}

export function serializeWorld(state: WorldState): string {
  return JSON.stringify(state, replacer);
}

export function deserializeWorld(text: string): WorldState {
  return JSON.parse(text, reviver) as WorldState;
}

/** Cheap state fingerprint for the determinism test and debugging. */
export function worldDigest(state: WorldState): string {
  return hashString(serializeWorld(state)).toString(16).padStart(8, '0');
}
