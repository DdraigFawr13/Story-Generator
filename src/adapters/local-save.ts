import { validateSettlementState } from '../sim/settlement-validation';
import { saveCodec, type SaveEnvelope } from './save-envelope';
export type { SaveEnvelope } from './save-envelope';

export const SAVE_DATABASE = 'story-generator-local-v1';
export const SAVE_STORE = 'world';
export const SAVE_KEY = 'slot';
export const WRITER_LOCK = 'story-generator-world-writer-v1';

export interface SaveStore {
  read(): Promise<unknown>;
  write(envelope: SaveEnvelope): Promise<void>;
  close(): void;
}

const codec = saveCodec(validateSettlementState);
export const prepareSave = codec.prepare;
export const decodeSave = codec.decode;

export function openLocalStore(): Promise<SaveStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SAVE_DATABASE, 1);
    let rejected = false;
    const fail = (error: unknown) => {
      rejected = true;
      reject(error);
    };
    request.onupgradeneeded = () => request.result.createObjectStore(SAVE_STORE);
    request.onerror = () => fail(request.error ?? new Error('Local storage could not be opened.'));
    request.onblocked = () => fail(new Error('Local storage is blocked by another browser page.'));
    request.onsuccess = () => {
      const db = request.result;
      if (rejected) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve({
        read: () =>
          new Promise((done, failed) => {
            const tx = db.transaction(SAVE_STORE, 'readonly');
            const read = tx.objectStore(SAVE_STORE).get(SAVE_KEY);
            tx.oncomplete = () => done(read.result);
            tx.onabort = () => failed(tx.error ?? new Error('Reading the local save failed.'));
            tx.onerror = () => {};
          }),
        write: (envelope) =>
          new Promise((done, failed) => {
            const tx = db.transaction(SAVE_STORE, 'readwrite');
            tx.objectStore(SAVE_STORE).put(envelope, SAVE_KEY);
            tx.oncomplete = () => done();
            tx.onabort = () =>
              failed(tx.error ?? new Error('The local save transaction was aborted.'));
            tx.onerror = () => {};
          }),
        close: () => db.close(),
      });
    };
  });
}

export interface WriterLease {
  owner: boolean;
  release(): void;
}
export function acquireWriter(): Promise<WriterLease> {
  return new Promise((resolve, reject) => {
    void navigator.locks
      .request(WRITER_LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve({ owner: false, release() {} });
          return;
        }
        await new Promise<void>((release) => resolve({ owner: true, release }));
      })
      .catch(reject);
  });
}

export function persistenceAvailable(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof navigator.locks?.request === 'function' &&
    typeof crypto.subtle?.digest === 'function'
  );
}
