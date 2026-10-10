import { canonicalJson } from '../../src/sim/canonical';
import {
  createFounderRoster,
  residentLifeStage,
  validateFounderRoster,
} from '../../src/sim/residents';
import { createSettlement } from '../../src/sim/settlement-initial';

export function residentFixtures() {
  return ['RIVERSIDE', ...Array.from({ length: 10 }, (_, index) => `PEOPLE_${index}`)].map(
    (seed) => {
      const founding = createSettlement(seed);
      const before = canonicalJson(founding);
      const roster = createFounderRoster(founding);
      const restored: unknown = JSON.parse(canonicalJson(roster));
      validateFounderRoster(restored, founding);
      return {
        seed,
        bytes: canonicalJson(roster),
        unchanged: before === canonicalJson(founding),
        stages: roster.residents.map((resident) => residentLifeStage(resident, 48)),
      };
    },
  );
}
