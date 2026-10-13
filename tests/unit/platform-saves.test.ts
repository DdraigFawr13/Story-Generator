import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  DEFAULT_SYSTEMS,
  advance,
  createWorld,
  embark,
  stepBlock,
  stepSite,
  serializeWorld,
  worldDigest,
  type Simulation,
  type WorldState,
} from '../../src/engine';
import {
  compress,
  createSaveStore,
  decompress,
  headerOf,
  memoryBackend,
  type SaveBackend,
} from '../../src/platform/save-store';

import { biggest, copy } from './helpers/site-fixture';

const SIM: Simulation = { content: DEFAULT_CONTENT, systems: DEFAULT_SYSTEMS };

/** JSON with sorted keys and no undefined fields: the state, whatever order its keys were set in. */
function canonical(world: WorldState): string {
  return JSON.stringify(
    [world.day, world.rng, world.activeSite, world.people, world.events],
    (_k, v) => {
      if (v instanceof Map) return { $map: [...v] };
      if (v instanceof Set) return { $set: [...v] };
      if (ArrayBuffer.isView(v)) return Array.from(v as Uint8Array);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(v).sort()) out[key] = (v as Record<string, unknown>)[key];
        return out;
      }
      return v;
    },
  );
}

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

  it("refuses readable data that is not a world, and keeps a site save's view (M3.12)", async () => {
    const store = createSaveStore(memoryBackend());
    const header = { seed: 'S1', day: 40 };
    await store.saveCompressed('odd', header, await compress(JSON.stringify({ hello: 1 })));
    await expect(store.load('odd')).rejects.toThrow(/could not be read by this version/);
    const view = { open: 'person:795', zoom: 2, at: { x: 30, y: 41 }, tab: null, sec: 'ties' };
    await store.saveCompressed('seen', header, await compress('{}'), view);
    expect((await store.list()).find((save) => save.name === 'seen')?.view).toEqual(view);
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

  it('a site saved mid-day carries on exactly as the running one (M3.12)', async () => {
    const store = createSaveStore(memoryBackend());
    const world = copy();
    embark(world, DEFAULT_CONTENT, biggest(world).id);
    for (let d = 0; d < 12; d += 1) stepSite(world, DEFAULT_CONTENT);
    stepBlock(world, DEFAULT_CONTENT);
    const saved = await store.save('site', world);
    expect(saved.site).toBe(world.sites.get(world.activeSite!.siteId)!.name);
    // Mid-day the save is dated today; after the evening, the day the evening belonged to.
    expect(saved.day).toBe(world.day);
    expect(headerOf({ ...world, activeSite: { ...world.activeSite!, block: 0 } }).day).toBe(
      world.day - 1,
    );
    const loaded = await store.load('site');
    // Long enough for the steward to replan, the woods to refresh and the routes to be reused.
    for (let d = 0; d < 14; d += 1) {
      stepSite(world, DEFAULT_CONTENT);
      stepSite(loaded, DEFAULT_CONTENT);
    }
    expect(canonical(loaded)).toBe(canonical(world));
  });
});
