import { capture } from './immutable';
import { RESIDENT_CONFIG } from './resident-config';
import { SETTLEMENT_CONFIG } from './settlement-config';

export const LIVING_SETTLEMENT_VERSION = 'p2-settlement-v1';
export const LIVING_CONFIG = capture({
  settlement: SETTLEMENT_CONFIG,
  residents: {
    identity: RESIDENT_CONFIG,
    life: {
      adultAgeWeeks: 18 * 48,
      seniorAgeWeeks: 60 * 48,
      birthMaxAgeWeeks: 50 * 48,
      maximumAgeWeeks: 100 * 48,
      dependentAgeWeeks: 4 * 48,
      workerHealth: 40,
      careHealthPenalty: 2,
      birthIntervalWeeks: 48,
      ageDeathThresholdPerYear: 2,
    },
  },
});
