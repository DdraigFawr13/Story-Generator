import { canonicalBytes, canonicalJson } from './canonical';
import { nextTick, validateTick } from './clock';
import { capture, type Immutable } from './immutable';

export interface ArchiveEvent {
  readonly id: number;
  readonly tick: number;
  readonly causes: readonly number[];
}

export interface ArchivedState {
  readonly tick: number;
  readonly events: readonly ArchiveEvent[];
}

export interface HistoryLimits {
  readonly maxEvents: number;
  readonly maxBytes: number;
}

export const DEFAULT_HISTORY_LIMITS: HistoryLimits = Object.freeze({
  maxEvents: 50_000,
  maxBytes: 16_777_216,
});

export type LimitReason = 'event-limit' | 'payload-limit';

export function validateArchive(state: ArchivedState): void {
  validateTick(state.tick);
  let previousTick = 0;
  for (const [index, event] of state.events.entries()) {
    if (event.id !== index + 1) throw new Error('Event IDs must be contiguous and ordered.');
    validateTick(event.tick);
    if (event.tick < previousTick || event.tick > state.tick)
      throw new Error('Invalid event tick order.');
    const seenCauses = new Set<number>();
    for (const cause of event.causes) {
      if (!Number.isSafeInteger(cause) || cause < 1 || cause >= event.id || seenCauses.has(cause)) {
        throw new Error('Causes must resolve to unique earlier archived events.');
      }
      seenCauses.add(cause);
    }
    previousTick = event.tick;
  }
}

export function historyLimitReason(
  state: ArchivedState,
  limits: HistoryLimits,
): LimitReason | null {
  if (
    !Number.isSafeInteger(limits.maxEvents) ||
    limits.maxEvents < 0 ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes < 0
  ) {
    throw new Error('Invalid history limits.');
  }
  validateArchive(state);
  const bytes = canonicalBytes(state).byteLength;
  if (state.events.length > limits.maxEvents) return 'event-limit';
  return bytes > limits.maxBytes ? 'payload-limit' : null;
}

export function admitTick<T extends ArchivedState>(
  committed: Immutable<T>,
  candidate: T,
  limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
): { state: Immutable<T>; rejected: LimitReason | null } {
  if (candidate.tick !== nextTick(committed.tick))
    throw new Error('Candidate must advance exactly one tick.');
  if (
    candidate.events.length < committed.events.length ||
    canonicalJson(candidate.events.slice(0, committed.events.length)) !==
      canonicalJson(committed.events)
  ) {
    throw new Error('A candidate cannot rewrite or truncate committed history.');
  }
  const rejected = historyLimitReason(candidate, limits);
  return rejected ? { state: committed, rejected } : { state: capture(candidate), rejected: null };
}

export function advanceTicks<T extends ArchivedState>(
  initial: T,
  count: number,
  reduce: (state: Immutable<T>) => T,
  limits: HistoryLimits = DEFAULT_HISTORY_LIMITS,
) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count.');
  const initialLimit = historyLimitReason(initial, limits);
  if (initialLimit) throw new Error(`Initial state exceeds ${initialLimit}.`);
  let state = capture(initial);
  let advanced = 0;
  for (; advanced < count; advanced++) {
    const result = admitTick(state, reduce(state), limits);
    if (result.rejected) return { state, advanced, halted: result.rejected };
    state = result.state;
  }
  return { state, advanced, halted: null };
}
