// Named world saves (REBOOT_PLAN M0.3). A save is the serialized world, gzipped with
// CompressionStream (M2.5), plus a SHA-256 checksum of the stored bytes. Summary and data are
// written in one transaction, so a save either commits completely or leaves the previous one
// untouched. There is no cross-version migration (R-02): a save from an older build may fail to load.
// M3.12: a save made while a site is watched holds the site too (`activeSite`), and loading it
// carries on watching; the site worker compresses its own world so play never stalls the page.

import { deserializeWorld, serializeWorld, type WorldState } from '../engine';

export interface SaveSummary {
  name: string;
  seed: string;
  day: number;
  savedAt: string;
  /** M3.12: the watched site's name, when the save was made while watching one. */
  site?: string;
  /** M3.12: what the site view showed when saved (the link's selection, zoom, centre and tabs). */
  view?: SaveView;
}

/** The site view's place in a save, in the link's terms; loading restores it. */
export interface SaveView {
  open: string | null;
  zoom: number;
  at: { x: number; y: number };
  tab: string | null;
  sec: string | null;
}

/** What a save says about its world, before the save name and time are added. */
export type SaveHeader = Pick<SaveSummary, 'seed' | 'day' | 'site'>;

export interface SaveRecord {
  name: string;
  checksum: string;
  /** Gzipped JSON of the world; a string in saves made before M2.5. */
  data: Uint8Array | string;
}

/** Storage behind the store: IndexedDB in the browser, a Map in unit tests. */
export interface SaveBackend {
  list(): Promise<SaveSummary[]>;
  read(name: string): Promise<SaveRecord | undefined>;
  /** Must write both or neither. */
  write(summary: SaveSummary, record: SaveRecord): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface SaveStore {
  list(): Promise<SaveSummary[]>;
  save(name: string, world: WorldState): Promise<SaveSummary>;
  /** Stores a world already serialized and gzipped (the site worker does that off the page). */
  saveCompressed(
    name: string,
    header: SaveHeader,
    data: Uint8Array,
    view?: SaveView,
  ): Promise<SaveSummary>;
  load(name: string): Promise<WorldState>;
  remove(name: string): Promise<void>;
}

export function validateSaveName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 60) {
    throw new Error('Use a save name of 1–60 characters.');
  }
  return trimmed;
}

async function checksumOf(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** Gzips the text; a world of 250 years shrinks several times over. */
export function compress(text: string): Promise<Uint8Array> {
  return pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
}

export async function decompress(data: Uint8Array | string): Promise<string> {
  if (typeof data === 'string') return data;
  return new TextDecoder().decode(await pipe(data, new DecompressionStream('gzip')));
}

/**
 * The summary fields a world gives: its seed, day and the site being watched, if any. A site's day
 * is the one its date shows: after the evening block the clock has turned, but the evening belongs
 * to the day before (as the site view's date and link say).
 */
export function headerOf(world: WorldState): SaveHeader {
  const active = world.activeSite;
  const site = active ? world.sites.get(active.siteId)?.name : undefined;
  if (!active || site === undefined) return { seed: world.seed, day: world.day };
  const turned = active.block === 0 && world.day !== active.enteredDay;
  return { seed: world.seed, day: turned ? world.day - 1 : world.day, site };
}

function looksLikeWorld(world: unknown): world is WorldState {
  const w = world as Partial<WorldState> | null;
  return (
    typeof w === 'object' &&
    w !== null &&
    typeof w.seed === 'string' &&
    typeof w.day === 'number' &&
    typeof w.params?.width === 'number' &&
    typeof w.params?.height === 'number' &&
    w.sites instanceof Map &&
    Array.isArray(w.events)
  );
}

export function createSaveStore(
  backend: SaveBackend,
  now: () => Date = () => new Date(),
): SaveStore {
  return {
    async list() {
      const saves = await backend.list();
      return saves.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
    },
    async save(name, world) {
      validateSaveName(name);
      return this.saveCompressed(name, headerOf(world), await compress(serializeWorld(world)));
    },
    async saveCompressed(name, header, data, view) {
      const validName = validateSaveName(name);
      const summary: SaveSummary = { name: validName, ...header, savedAt: now().toISOString() };
      if (summary.site === undefined) delete summary.site;
      if (view) summary.view = view;
      await backend.write(summary, { name: validName, checksum: await checksumOf(data), data });
      return summary;
    },
    async load(name) {
      const record = await backend.read(name);
      if (!record) throw new Error(`No save named "${name}".`);
      if ((await checksumOf(record.data)) !== record.checksum) {
        throw new Error(`The save "${name}" is damaged and cannot be loaded.`);
      }
      try {
        const world = deserializeWorld(await decompress(record.data));
        // Readable JSON that is not a world (another app's data, a hand-edited save) fails here,
        // not later inside the map.
        if (!looksLikeWorld(world)) throw new Error('not a world');
        return world;
      } catch {
        throw new Error(`The save "${name}" could not be read by this version.`);
      }
    },
    remove: (name) => backend.remove(name),
  };
}

/** For tests and browsers without IndexedDB (saves last until the page closes). */
export function memoryBackend(): SaveBackend & { records: Map<string, SaveRecord> } {
  const summaries = new Map<string, SaveSummary>();
  const records = new Map<string, SaveRecord>();
  return {
    records,
    list: async () => [...summaries.values()].map((summary) => ({ ...summary })),
    read: async (name) => {
      const record = records.get(name);
      return record && { ...record };
    },
    write: async (summary, record) => {
      summaries.set(summary.name, { ...summary });
      records.set(record.name, { ...record });
    },
    remove: async (name) => {
      summaries.delete(name);
      records.delete(name);
    },
  };
}

const DATABASE = 'story-generator-worlds';
const SUMMARIES = 'summaries';
const RECORDS = 'records';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Browser storage request failed.'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('The save transaction was aborted.'));
    tx.onerror = () => {};
  });
}

export async function indexedDbBackend(): Promise<SaveBackend> {
  const open = indexedDB.open(DATABASE, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(SUMMARIES, { keyPath: 'name' });
    open.result.createObjectStore(RECORDS, { keyPath: 'name' });
  };
  const db = await request(open);
  db.onversionchange = () => db.close();
  return {
    async list() {
      const tx = db.transaction(SUMMARIES, 'readonly');
      const all = request(tx.objectStore(SUMMARIES).getAll() as IDBRequest<SaveSummary[]>);
      await finished(tx);
      return all;
    },
    async read(name) {
      const tx = db.transaction(RECORDS, 'readonly');
      const record = request(tx.objectStore(RECORDS).get(name) as IDBRequest<SaveRecord>);
      await finished(tx);
      return record;
    },
    async write(summary, record) {
      const tx = db.transaction([SUMMARIES, RECORDS], 'readwrite');
      tx.objectStore(SUMMARIES).put(summary);
      tx.objectStore(RECORDS).put(record);
      await finished(tx);
    },
    async remove(name) {
      const tx = db.transaction([SUMMARIES, RECORDS], 'readwrite');
      tx.objectStore(SUMMARIES).delete(name);
      tx.objectStore(RECORDS).delete(name);
      await finished(tx);
    },
  };
}

/** IndexedDB when the browser allows it; otherwise in-memory with `persistent: false`. */
export async function openSaveStore(): Promise<{ store: SaveStore; persistent: boolean }> {
  try {
    if (typeof indexedDB !== 'undefined' && typeof crypto?.subtle?.digest === 'function') {
      return { store: createSaveStore(await indexedDbBackend()), persistent: true };
    }
  } catch {
    // Private modes and blocked storage fall through to memory.
  }
  return { store: createSaveStore(memoryBackend()), persistent: false };
}
