import { canonicalJson } from './canonical';
import { createFoundingSnapshot } from './founding';
import { capture } from './immutable';
import { settlementConfig, SETTLEMENT_VERSION } from './settlement-config';
import type { SettlementState } from './state';
import { validateSettlementState } from './settlement-validation';

export function createSettlement(seed: string, version = SETTLEMENT_VERSION) {
  const state = JSON.parse(canonicalJson(createFoundingSnapshot(seed))) as SettlementState;
  state.schemaVersion = 2;
  state.simulationVersion = version;
  state.rulesVersion = version;
  state.config = settlementConfig(version);
  state.lastTick = null;
  validateSettlementState(state);
  return capture(state);
}
