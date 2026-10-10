import { decodeLivingSave, prepareLivingSave } from '../../src/adapters/living-save';
import { canonicalJson } from '../../src/sim/canonical';
import { advanceLivingSettlement, simulateLivingSettlement } from '../../src/sim/living';

export async function livingFixtures() {
  return Promise.all(
    ['RIVERSIDE', 'THIMBLE', 'LIFE_7'].map(async (seed) => {
      const first = simulateLivingSettlement(seed, 57).state;
      const restored = (
        await decodeLivingSave(
          JSON.parse(JSON.stringify(await prepareLivingSave(first, 'life-parity', 1))),
        )
      ).payload;
      const resumed = advanceLivingSettlement(restored, 80).state;
      const direct = simulateLivingSettlement(seed, 137).state;
      const envelope = await prepareLivingSave(resumed, 'life-parity', 2);
      return {
        seed,
        bytes: canonicalJson(resumed),
        digest: envelope.digest,
        equal: canonicalJson(resumed) === canonicalJson(direct),
      };
    }),
  );
}
