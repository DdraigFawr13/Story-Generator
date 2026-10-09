import { openLocalStore, prepareSave, decodeSave } from '../../src/adapters/local-save';
import { advanceSettlement } from '../../src/sim/settlement';
import { digestCanonical } from '../../src/adapters/crypto';
import { canonicalBytes } from '../../src/sim/canonical';
import type { SettlementSnapshot } from '../../src/sim/state';

export async function measureStorage(payload: SettlementSnapshot) {
  const start = performance.now(),
    envelope = await prepareSave(payload, 'benchmark', 1);
  const prepareMs = performance.now() - start,
    store = await openLocalStore();
  try {
    const writeStart = performance.now();
    await store.write(envelope);
    const writeMs = performance.now() - writeStart;
    const readStart = performance.now(),
      decoded = await decodeSave(await store.read()),
      readValidateMs = performance.now() - readStart;
    const stepStart = performance.now(),
      next = advanceSettlement(decoded.payload, 10),
      tenWeeksMs = performance.now() - stepStart;
    const uninterrupted = advanceSettlement(envelope.payload, 10);
    return {
      tick: payload.tick,
      population: payload.world.settlement.population,
      events: payload.events.length,
      bytes: canonicalBytes(decoded.payload).byteLength,
      prepareMs,
      writeMs,
      readValidateMs,
      tenWeeksMs,
      continuedEqual:
        (await digestCanonical(next.state)) === (await digestCanonical(uninterrupted.state)),
      heapBytes:
        'memory' in performance
          ? (performance.memory as { usedJSHeapSize: number }).usedJSHeapSize
          : null,
    };
  } finally {
    store.close();
  }
}
