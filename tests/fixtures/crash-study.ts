import { openLocalStore, prepareSave, decodeSave } from '../../src/adapters/local-save';
import { advanceSettlement } from '../../src/sim/settlement';

// Diagnostic fixture only: keep a read-write transaction alive after put success
// until the separate test process kills its own browser process group.
export async function holdSaveUntilCrash() {
  const store = await openLocalStore();
  const old = await decodeSave(await store.read());
  const next = await prepareSave(
    advanceSettlement(old.payload, 1).state,
    'interrupted',
    old.generation + 1,
  );
  await new Promise<void>((resolve) => {
    const native = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = native.apply(this, args);
      request.addEventListener('success', () => {
        const target = this;
        function hold() {
          const read = target.get('slot');
          read.onsuccess = hold;
        }
        hold();
        resolve();
      });
      return request;
    };
    void store.write(next).catch(() => {});
  });
}
