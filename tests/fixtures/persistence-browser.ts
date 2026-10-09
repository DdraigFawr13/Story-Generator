import {
  SAVE_DATABASE,
  SAVE_KEY,
  SAVE_STORE,
  openLocalStore,
  decodeSave,
  prepareSave,
} from '../../src/adapters/local-save';
import { digestCanonical } from '../../src/adapters/crypto';
import { simulateSettlement } from '../../src/sim/settlement';

export async function readSlot() {
  const store = await openLocalStore();
  try {
    return await store.read();
  } finally {
    store.close();
  }
}
export async function writeFixture(seed: string, tick: number) {
  const store = await openLocalStore();
  try {
    await store.write(await prepareSave(simulateSettlement(seed, tick).state, 'fixture', 1));
  } finally {
    store.close();
  }
}
export async function storedDigest() {
  const saved = await decodeSave(await readSlot());
  return {
    tick: saved.payload.tick,
    digest: await digestCanonical(saved.payload),
    seed: saved.payload.seed,
  };
}
export async function damageSlot(checksummed = false) {
  const store = await openLocalStore();
  try {
    const saved = await decodeSave(await store.read());
    const changed = structuredClone(saved);
    (changed.payload.world.settlement as { food: number }).food++;
    if (checksummed) changed.digest = await digestCanonical(changed.payload);
    await store.write(changed);
  } finally {
    store.close();
  }
}
export async function abortAfterRequestSuccess() {
  const before = await storedDigest();
  const store = await openLocalStore();
  const saved = await prepareSave(simulateSettlement('RIVERSIDE', 60).state, 'abort', 2);
  const native = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
    const request = native.apply(this, args);
    request.addEventListener('success', () => this.transaction.abort());
    return request;
  };
  let rejected = false;
  try {
    await store.write(saved);
  } catch {
    rejected = true;
  } finally {
    IDBObjectStore.prototype.put = native;
    store.close();
  }
  return { rejected, before, after: await storedDigest() };
}
export async function unsupportedSlot() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(SAVE_DATABASE, 1);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(SAVE_STORE, 'readwrite');
    tx.objectStore(SAVE_STORE).put({ envelopeVersion: 99 }, SAVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  database.close();
}
