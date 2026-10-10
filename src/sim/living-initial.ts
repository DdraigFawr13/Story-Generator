import { canonicalJson } from './canonical';
import { capture } from './immutable';
import { LIVING_CONFIG, LIVING_SETTLEMENT_VERSION } from './living-config';
import { createResidentWorld } from './resident-world';
import type { LivingSettlementState } from './living-state';
import { validateLivingSettlement } from './living-validation';

export function createLivingSettlement(seed: string) {
  const founding = createResidentWorld(seed);
  const state = JSON.parse(canonicalJson(founding)) as LivingSettlementState;
  state.simulationVersion = LIVING_SETTLEMENT_VERSION;
  state.rulesVersion = LIVING_SETTLEMENT_VERSION;
  state.config = LIVING_CONFIG;
  state.world.residents = state.world.residents.map((resident) => ({
    ...resident,
    activity: null,
    lastBirthTick: null,
  }));
  const facts = state.events[0]!.facts as Record<string, unknown>;
  facts.residents = state.world.residents.map(
    ({ id, givenName, householdName, householdId, homeId, tile, ageWeeksAtEntry, traits }) => ({
      id,
      givenName,
      householdName,
      householdId,
      homeId,
      tile,
      ageWeeksAtEntry,
      traits,
    }),
  );
  facts.householdRecords = state.world.households.map((household) => ({ ...household }));
  validateLivingSettlement(state);
  return capture(state);
}
