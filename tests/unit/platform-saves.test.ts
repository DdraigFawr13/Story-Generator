import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DEFAULT_SYSTEMS,
  advance,
  createWorld,
  worldDigest,
  type Simulation,
} from '../../src/engine';
import { createSaveStore, memoryBackend, type SaveBackend } from '../../src/platform/save-store';

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
    backend.records.set('slot', { ...record, data: record.data.replace('DAMAGE', 'DAMAGF') });
    await expect(store.load('slot')).rejects.toThrow(/damaged/);
    await expect(store.load('nothing')).rejects.toThrow(/No save/);
    await expect(store.save('   ', createWorld('X'))).rejects.toThrow(/1–60/);
    await store.remove('slot');
    expect(await store.list()).toEqual([]);
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
