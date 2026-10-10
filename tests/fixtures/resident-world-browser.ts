import { decodeResidentSave, prepareResidentSave } from '../../src/adapters/resident-save';
import { canonicalJson } from '../../src/sim/canonical';
import { createResidentWorld } from '../../src/sim/resident-world';

export async function residentWorldFixtures() {
  return Promise.all(
    ['RIVERSIDE', 'THIMBLE', 'PEOPLE_7'].map(async (seed) => {
      const world = createResidentWorld(seed);
      const envelope = await prepareResidentSave(world, 'browser-parity', 1);
      const restored = await decodeResidentSave(JSON.parse(JSON.stringify(envelope)));
      return { seed, digest: envelope.digest, bytes: canonicalJson(restored.payload) };
    }),
  );
}
