// World creation, saves and digests. Saves are plain JSON of the whole state;
// there is no cross-version compatibility (R-02/R-03).

import { hashString } from './rng';
import {
  ENTITY_KINDS,
  type EntityKind,
  type Id,
  type LocalMap,
  type WorldCells,
  type WorldParams,
  type WorldState,
} from './types';

export const DEFAULT_PARAMS: WorldParams = {
  width: 256,
  height: 256,
  historyYears: 250,
  continents: 4,
  landFraction: 0.35,
  temperatureShift: 0,
  rainfallScale: 1,
};

export function validateSeed(seed: string): string {
  if (seed.length < 1 || seed.length > 64 || /[^A-Za-z0-9_-]/.test(seed)) {
    throw new Error('Use 1–64 letters, numbers, underscores or hyphens for the seed.');
  }
  return seed;
}

export function validateParams(params: WorldParams): WorldParams {
  const { width, height, continents, landFraction, temperatureShift, rainfallScale } = params;
  if (![width, height].every((size) => Number.isInteger(size) && size >= 32 && size <= 512)) {
    throw new Error('World size must be 32–512 cells per side.');
  }
  if (!Number.isInteger(continents) || continents < 1 || continents > 8) {
    throw new Error('Use 1–8 continents.');
  }
  if (!(landFraction >= 0.1 && landFraction <= 0.8)) {
    throw new Error('The land fraction must be between 0.1 and 0.8.');
  }
  if (!(temperatureShift >= -15 && temperatureShift <= 15)) {
    throw new Error('The temperature shift must be between -15 and 15 degrees.');
  }
  if (!(rainfallScale >= 0.25 && rainfallScale <= 2)) {
    throw new Error('The rainfall scale must be between 0.25 and 2.');
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
    regions: new Map(),
    routes: { nodes: [], edges: [] },
    civs: new Map(),
    sites: new Map(),
    creatures: new Map(),
    people: new Map(),
    dynasties: new Map(),
    items: new Map(),
    snapshots: [],
    playback: null,
    climateEpochs: [],
    events: [],
    commands: [],
    weather: { current: 'mild', sinceDay: 0, causeEvent: null },
    activeSite: null,
  };
}

// Maps, Sets and typed arrays become tagged values so JSON round-trips exactly.
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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Uint8Array(128);
for (let i = 0; i < B64.length; i += 1) B64_INDEX[B64.charCodeAt(i)] = i;

/** The array's bytes as base64 (M3.12): a 256x256 world saves and loads several times faster than as JSON numbers. */
function toBase64(value: ArrayBufferView): string {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    chunk +=
      B64[a >> 2]! +
      B64[((a & 3) << 4) | (b >> 4)]! +
      (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)]! : '=') +
      (i + 2 < bytes.length ? B64[c & 63]! : '=');
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

function fromBase64(text: string): Uint8Array {
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = B64_INDEX[text.charCodeAt(i)]!;
    const b = B64_INDEX[text.charCodeAt(i + 1)]!;
    const c = B64_INDEX[text.charCodeAt(i + 2)]!;
    const d = B64_INDEX[text.charCodeAt(i + 3)]!;
    bytes[o++] = (a << 2) | (b >> 4);
    if (o < bytes.length) bytes[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < bytes.length) bytes[o++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) return { $map: [...value.entries()] };
  if (value instanceof Set) return { $set: [...value] };
  const typed = typedName(value);
  if (typed) return { $typed: typed, b64: toBase64(value as ArrayBufferView) };
  return value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object') {
    if ('$map' in value) return new Map((value as { $map: [unknown, unknown][] }).$map);
    if ('$set' in value) return new Set((value as { $set: unknown[] }).$set);
    if ('$typed' in value) {
      const { $typed, data, b64 } = value as {
        $typed: TypedArrayName;
        data?: number[];
        b64?: string;
      };
      const Constructor = TYPED_ARRAYS[$typed];
      if (!Constructor) throw new Error(`Unknown typed array "${$typed}" in save.`);
      if (b64 === undefined) return Constructor.from(data ?? []);
      const bytes = fromBase64(b64);
      return new Constructor(
        bytes.buffer as ArrayBuffer,
        0,
        bytes.byteLength / Constructor.BYTES_PER_ELEMENT,
      );
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

/** FNV-1a 32-bit offset basis and prime. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * An 8-hex-digit hash over the bytes of every typed array in the cells (nested ones too, such as
 * `risk`), in sorted key order, plus width and height. Compares worlds across Node and browsers.
 */
export function cellsDigest(cells: WorldCells): string {
  let hash = FNV_OFFSET;
  const mix = (byte: number) => {
    hash = Math.imul(hash ^ (byte & 0xff), FNV_PRIME) >>> 0;
  };
  const mixNumber = (value: number) => {
    for (let shift = 0; shift < 32; shift += 8) mix(value >>> shift);
  };
  const walk = (value: object) => {
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (ArrayBuffer.isView(item)) {
        const bytes = new Uint8Array(item.buffer, item.byteOffset, item.byteLength);
        mixNumber(bytes.length);
        for (let i = 0; i < bytes.length; i += 1) mix(bytes[i]!);
      } else if (
        item !== null &&
        typeof item === 'object' &&
        Object.getPrototypeOf(item) === Object.prototype
      ) {
        walk(item);
      }
    }
  };
  mixNumber(cells.width);
  mixNumber(cells.height);
  walk(cells);
  return hash.toString(16).padStart(8, '0');
}

/** An 8-hex-digit FNV-1a hash over the size and every layer of the map, as cellsDigest does for cells. */
export function localMapDigest(map: LocalMap): string {
  let hash = FNV_OFFSET;
  const mix = (byte: number) => {
    hash = Math.imul(hash ^ (byte & 0xff), FNV_PRIME) >>> 0;
  };
  const mixNumber = (value: number) => {
    for (let shift = 0; shift < 32; shift += 8) mix(value >>> shift);
  };
  mixNumber(map.width);
  mixNumber(map.height);
  mixNumber(map.cellX);
  mixNumber(map.cellY);
  for (const layer of [
    map.elevation,
    map.terrain,
    map.water,
    map.tree,
    map.mineral,
    map.building,
  ]) {
    const bytes = new Uint8Array(layer.buffer, layer.byteOffset, layer.byteLength);
    mixNumber(bytes.length);
    for (let i = 0; i < bytes.length; i += 1) mix(bytes[i]!);
  }
  mixNumber(map.bridges.length);
  for (const k of map.bridges) mixNumber(k);
  return hash.toString(16).padStart(8, '0');
}
