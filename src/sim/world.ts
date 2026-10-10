import type { HistoryLimits } from './admission';
import type { Immutable } from './immutable';
import { LIVING_SETTLEMENT_VERSION } from './living-config';
import { createLivingSettlement } from './living-initial';
import { advanceLivingSettlement } from './living';
import type { LivingSettlementSnapshot, LivingSettlementState } from './living-state';
import { validateLivingSettlement } from './living-validation';
import { advanceSettlement } from './settlement';
import { validateSettlementState } from './settlement-validation';
import type { SettlementState } from './state';

export type WorldState = SettlementState | LivingSettlementState;
export type WorldSnapshot = Immutable<WorldState>;
export const createWorld = createLivingSettlement;

export function isIndividualWorld(world: WorldSnapshot): world is LivingSettlementSnapshot {
  return world.simulationVersion === LIVING_SETTLEMENT_VERSION;
}
export function worldEconomy(world: WorldSnapshot) {
  return isIndividualWorld(world) ? world.config.settlement : world.config;
}
export function validateWorld(value: unknown): asserts value is WorldState {
  if (
    value &&
    typeof value === 'object' &&
    'simulationVersion' in value &&
    value.simulationVersion === LIVING_SETTLEMENT_VERSION
  )
    validateLivingSettlement(value);
  else validateSettlementState(value);
}
export function advanceWorld(world: WorldSnapshot, count: number, limits?: HistoryLimits) {
  return isIndividualWorld(world)
    ? advanceLivingSettlement(world, count, limits)
    : advanceSettlement(world, count, limits);
}
