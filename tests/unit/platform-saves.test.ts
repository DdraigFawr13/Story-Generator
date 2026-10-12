import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DEFAULT_SYSTEMS,
  advance,
  createWorld,
  serializeWorld,
  worldDigest,
  type Simulation,
} from '../../src/engine';
import {
  createSaveStore,
  decompress,
  memoryBackend,
  type SaveBackend,
} from '../../src/platform/save-store';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };

describe('named world saves', () => {
  it('saves, lists newest first, loads and continues identically', async () => {
    let clock = 0;
    const store = createSaveStore(
      memoryBackend(),
      () => new Date(Date.UTC(2026, 0, 1, 0, clock++)),
    );
    const world = createWorld('SAVES');
    advance(world, SIM, 400);
    await store.save('first', world);
    await store.save('  second  ', world);
    expect((await store.list()).map((save) => save.name)).toEqual(['second', 'first']);
    expect((await store.list())[0]).toMatchObject({ seed: 'SAVES', day: 400 });

    const loaded = await store.load('first');
    advance(world, SIM, 300);
    advance(loaded, SIM, 300);
    expect(worldDigest(loaded)).toBe(worldDigest(world));
  });

  it('rejects damaged, missing and badly named saves', async () => {
    const backend = memoryBackend();
    const store = createSaveStore(backend);
    await store.save('slot', createWorld('DAMAGE'));
    const record = backend.records.get('slot')!;
    const bytes = Uint8Array.from(record.data as Uint8Array);
    const middle = bytes.length >> 1;
    bytes[middle] = bytes[middle]! ^ 0xff;
    backend.records.set('slot', { ...record, data: bytes });
    await expect(store.load('slot')).rejects.toThrow(/damaged/);
    await expect(store.load('nothing')).rejects.toThrow(/No save/);
    await expect(store.save('   ', createWorld('X'))).rejects.toThrow(/1–60/);
    await store.remove('slot');
    expect(await store.list()).toEqual([]);
  });

  it('stores worlds gzipped and still reads uncompressed older records', async () => {
    const backend = memoryBackend();
    const store = createSaveStore(backend);
    const world = createWorld('SQUEEZE');
    advance(world, SIM, 200);
    await store.save('slot', world);
    const record = backend.records.get('slot')!;
    expect(record.data).toBeInstanceOf(Uint8Array);
    expect((record.data as Uint8Array).length).toBeLessThan(serializeWorld(world).length / 2);
    expect(await decompress(record.data)).toBe(serializeWorld(world));
    const text = serializeWorld(world);
    const sum = createHash('sha256').update(text).digest('hex');
    backend.records.set('slot', { name: 'slot', checksum: sum, data: text });
    expect(worldDigest(await store.load('slot'))).toBe(worldDigest(world));
  });

  it('keeps the previous save when a write fails', async () => {
    const backend = memoryBackend();
    let fail = false;
    const flaky: SaveBackend = {
      ...backend,
      write: (summary, record) =>
        fail ? Promise.reject(new Error('QuotaExceededError')) : backend.write(summary, record),
    };
    const store = createSaveStore(flaky);
    const world = createWorld('KEEP');
    await store.save('slot', world);
    advance(world, SIM, 50);
    fail = true;
    await expect(store.save('slot', world)).rejects.toThrow(/Quota/);
    expect((await store.load('slot')).day).toBe(0);
  });
});
