// World creation, saves and digests. Saves are plain JSON of the whole state;
// there is no cross-version compatibility (R-02/R-03).

import { hashString } from './rng';
import { ENTITY_KINDS, type EntityKind, type Id, type WorldParams, type WorldState } from './types';

export const DEFAULT_PARAMS: WorldParams = {
  width: 256,
  height: 256,
  historyYears: 250,
  continents: 4,
  landFraction: 0.35,
};

export function validateSeed(seed: string): string {
  if (seed.length < 1 || seed.length > 64 || /[^A-Za-z0-9_-]/.test(seed)) {
    throw new Error('Use 1–64 letters, numbers, underscores or hyphens for the seed.');
  }
  return seed;
}

export function validateParams(params: WorldParams): WorldParams {
  const { width, height, continents, landFraction } = params;
  if (![width, height].every((size) => Number.isInteger(size) && size >= 32 && size <= 512)) {
    throw new Error('World size must be 32–512 cells per side.');
  }
  if (!Number.isInteger(continents) || continents < 1 || continents > 8) {
    throw new Error('Use 1–8 continents.');
  }
  if (!(landFraction >= 0.1 && landFraction <= 0.8)) {
    throw new Error('The land fraction must be between 0.1 and 0.8.');
  }
  return params;
}

export function createWorld(seed: string, params: Partial<WorldParams> = {}): WorldState {
  const nextId = {} as Record<EntityKind, Id>;
  for (const kind of ENTITY_KINDS) nextId[kind] = 1;
  return {
    seed: validateSeed(seed),
    day: 0,
    params: validateParams({ ...DEFAULT_PARAMS, ...params }),
    rng: {},
    nextId,
    cells: null,
    people: new Map(),
    events: [],
    commands: [],
    weather: { current: 'mild', sinceDay: 0, causeEvent: null },
  };
}

// Maps and typed arrays become tagged arrays so JSON round-trips exactly.
const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
} as const;
type TypedArrayName = keyof typeof TYPED_ARRAYS;

function typedName(value: unknown): TypedArrayName | null {
  for (const name of Object.keys(TYPED_ARRAYS) as TypedArrayName[]) {
    if (value instanceof TYPED_ARRAYS[name]) return name;
  }
  return null;
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { $map: [...value.entries()] };
  const typed = typedName(value);
  if (typed) return { $typed: typed, data: Array.from(value as ArrayLike<number>) };
  return value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    if ('$map' in value) return new Map((value as { $map: [unknown, unknown][] }).$map);
    if ('$typed' in value) {
      const { $typed, data } = value as { $typed: TypedArrayName; data: number[] };
      const Constructor = TYPED_ARRAYS[$typed];
      if (!Constructor) throw new Error(`Unknown typed array "${$typed}" in save.`);
      return Constructor.from(data);
    }
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
