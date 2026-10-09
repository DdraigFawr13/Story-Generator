import { canonicalJson } from './canonical';
import { createFoundingSnapshot } from './founding';
import { capture } from './immutable';
import { SETTLEMENT_CONFIG, SETTLEMENT_VERSION } from './settlement-config';
import type { SettlementState } from './state';
import { validateSettlementState } from './settlement-validation';

export function createSettlement(seed: string) {
  const state = JSON.parse(canonicalJson(createFoundingSnapshot(seed))) as SettlementState;
  state.schemaVersion = 2;
  state.simulationVersion = SETTLEMENT_VERSION;
  state.rulesVersion = SETTLEMENT_VERSION;
  state.config = SETTLEMENT_CONFIG;
  state.lastTick = null;
  validateSettlementState(state);
  return capture(state);
}
