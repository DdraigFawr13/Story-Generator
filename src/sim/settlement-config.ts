import { FOUNDATION_CONFIG } from './config';
import { capture } from './immutable';

export const LEGACY_SETTLEMENT_VERSION = 'p1-settlement-v1';
export const LEGACY_SETTLEMENT_CONFIG = capture({
  ...FOUNDATION_CONFIG,
  economy: {
    workerDivisor: 2,
    foragerDivisor: 4,
    foodPerForager: [2, 2, 2, 1],
    maxRepairWorkers: 2,
    repairThreshold: 75,
    repairAmount: 10,
    maxBuilders: 2,
    maxGatherers: 2,
    timberPerGatherer: 3,
    fieldPopulationDivisor: 8,
    hutReserve: 4,
    storeThresholdNumerator: 3,
    storeThresholdDenominator: 4,
    construction: {
      hut: { timber: 12, labor: 4 },
      field: { timber: 4, labor: 4 },
      store: { timber: 20, labor: 8 },
    },
    weatherRange: 100,
    droughtCutoff: 20,
    wetCutoff: 80,
    weatherMultipliers: { drought: 500, normal: 1000, wet: 1200 },
    seasonMultipliers: [1000, 1200, 1000, 400],
    harvestBase: 240,
    fertilityScale: 100,
    multiplierScale: 1000,
    spoilageDivisor: 100,
    healthRecovery: 2,
    deficitHealthPenalty: 20,
    housingHealthPenalty: 5,
    demographicRange: 1000,
    baseDeathThreshold: 5,
    deathHealthDivisor: 2,
    birthHealth: 70,
    birthFoodWeeks: 6,
    birthThreshold: 15,
    surplusFoodWeeks: 12,
    seasonalDecay: 1,
  },
});

export const SETTLEMENT_VERSION = 'p1-settlement-v2';
export const SETTLEMENT_CONFIG = capture({
  ...LEGACY_SETTLEMENT_CONFIG,
  economy: {
    ...LEGACY_SETTLEMENT_CONFIG.economy,
    seasonMultipliers: [1000, 1200, 1000, 0],
    recovery: { minimumWorkforce: 2, protectedForagers: 1, foodWeeks: 6 },
  },
});
export type SettlementConfig = typeof LEGACY_SETTLEMENT_CONFIG | typeof SETTLEMENT_CONFIG;
export type SettlementEconomy = SettlementConfig['economy'];
export function settlementConfig(version: string): SettlementConfig {
  if (version === LEGACY_SETTLEMENT_VERSION) return LEGACY_SETTLEMENT_CONFIG;
  if (version === SETTLEMENT_VERSION) return SETTLEMENT_CONFIG;
  throw new Error('Invalid settlement state: unsupported version');
}
