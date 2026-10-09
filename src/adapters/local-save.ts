import { DEFAULT_HISTORY_LIMITS, historyLimitReason } from '../sim/admission';
import { canonicalBytes } from '../sim/canonical';
import { capture } from '../sim/immutable';
import { validateSettlementState } from '../sim/settlement-validation';
import type { SettlementSnapshot, SettlementState } from '../sim/state';
import { digestCanonical } from './crypto';

export const SAVE_DATABASE = 'story-generator-local-v1';
export const SAVE_STORE = 'world';
export const SAVE_KEY = 'slot';
export const WRITER_LOCK = 'story-generator-world-writer-v1';

export interface SaveEnvelope {
  envelopeVersion: 1;
  payload: SettlementSnapshot;
  digest: string;
  savedAt: string;
  session: string;
  generation: number;
}
export interface SaveStore {
  read(): Promise<unknown>;
  write(envelope: SaveEnvelope): Promise<void>;
  close(): void;
}

export async function prepareSave(
  snapshot: SettlementSnapshot,
  session: string,
  generation: number,
): Promise<SaveEnvelope> {
  validateSettlementState(snapshot);
  const rejected = historyLimitReason(snapshot, DEFAULT_HISTORY_LIMITS);
  if (rejected) throw new Error(`Cannot save: ${rejected}.`);
  const payload = capture(snapshot);
  return {
    envelopeVersion: 1,
    payload,
    digest: await digestCanonical(payload),
    savedAt: new Date().toISOString(),
    session,
    generation,
  };
}

export async function decodeSave(value: unknown): Promise<SaveEnvelope> {
  if (!value || typeof value !== 'object')
    throw new Error('The local save is not a complete envelope.');
  const envelope = value as Partial<SaveEnvelope>;
  if (envelope.envelopeVersion !== 1)
    throw new Error('This local save uses an unsupported envelope version.');
  if (
    Object.keys(envelope).sort().join(',') !==
      'digest,envelopeVersion,generation,payload,savedAt,session' ||
    typeof envelope.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(envelope.digest) ||
    typeof envelope.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(envelope.savedAt)) ||
    typeof envelope.session !== 'string' ||
    envelope.session.length < 1 ||
    envelope.session.length > 128 ||
    !Number.isSafeInteger(envelope.generation) ||
    envelope.generation! < 1
  )
    throw new Error('The local save has invalid metadata.');
  if (canonicalBytes(envelope.payload).byteLength > DEFAULT_HISTORY_LIMITS.maxBytes)
    throw new Error('The local save exceeds the supported payload limit.');
  if ((await digestCanonical(envelope.payload)) !== envelope.digest)
    throw new Error('The local save checksum does not match. The stored record was retained.');
  validateSettlementState(envelope.payload as SettlementState);
  const payload = capture(envelope.payload as SettlementState);
  if (historyLimitReason(payload, DEFAULT_HISTORY_LIMITS))
    throw new Error('The local save exceeds the history limit.');
  return { ...envelope, payload } as SaveEnvelope;
}

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
