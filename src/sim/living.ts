import {
  admitTick,
  DEFAULT_HISTORY_LIMITS,
  historyLimitReason,
  type HistoryLimits,
} from './admission';
import { capture } from './immutable';
import { createLivingSettlement } from './living-initial';
import type { LivingSettlementSnapshot, LivingSettlementState } from './living-state';
import { validateLivingSettlement } from './living-validation';
import { individualWeekPolicy } from './living-week';
import { reduceSettlementWeek } from './settlement';
import type { SettlementSnapshot } from './state';

// Like the P1 candidate reducer, callers supply a validated captured snapshot.
// Candidate validation and complete-week admission include all person changes.
export function reduceLivingSettlementWeek(
  committed: LivingSettlementSnapshot,
): LivingSettlementState {
  return reduceSettlementWeek(
    committed as unknown as SettlementSnapshot,
    individualWeekPolicy(committed, validateLivingSettlement),
  ) as unknown as LivingSettlementState;
}

export function advanceLivingSettlement(
  initial: LivingSettlementSnapshot,
  count: number,
  limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
) {
  validateLivingSettlement(initial);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count.');
  const reason = historyLimitReason(initial, limits);
  if (reason) throw new Error(`Initial state exceeds ${reason}.`);
  let state = capture<LivingSettlementState>(initial as LivingSettlementState),
    advanced = 0;
  for (; advanced < count; advanced++) {
    const result = admitTick<LivingSettlementState>(
      state,
      reduceLivingSettlementWeek(state),
      limits,
    );
    if (result.rejected) return { state, advanced, halted: result.rejected };
    state = result.state;
  }
  return { state, advanced, halted: null };
}

export function simulateLivingSettlement(
  seed: string,
  count: number,
  limits = DEFAULT_HISTORY_LIMITS,
) {
  return advanceLivingSettlement(createLivingSettlement(seed), count, limits);
}
