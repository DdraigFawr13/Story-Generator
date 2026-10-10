import { DEFAULT_HISTORY_LIMITS, historyLimitReason, type ArchivedState } from '../sim/admission';
import { canonicalBytes } from '../sim/canonical';
import { capture, type Immutable } from '../sim/immutable';
import type { SettlementSnapshot } from '../sim/state';
import { digestCanonical } from './crypto';

export interface SaveEnvelope<T extends ArchivedState = SettlementSnapshot> {
  envelopeVersion: 1;
  payload: Immutable<T>;
  digest: string;
  savedAt: string;
  session: string;
  generation: number;
}

// Version-specific validators own payload semantics. The envelope, limits and
// checksum path are shared so P2 cannot accidentally weaken the P1 transaction.
export function saveCodec<T extends ArchivedState>(
  validate: (value: unknown) => asserts value is T,
) {
  async function prepare(
    snapshot: Immutable<T>,
    session: string,
    generation: number,
  ): Promise<SaveEnvelope<T>> {
    validate(snapshot);
    const rejected = historyLimitReason(snapshot, DEFAULT_HISTORY_LIMITS);
    if (rejected) throw new Error(`Cannot save: ${rejected}.`);
    const payload = capture(snapshot) as Immutable<T>;
    return {
      envelopeVersion: 1,
      payload,
      digest: await digestCanonical(payload),
      savedAt: new Date().toISOString(),
      session,
      generation,
    };
  }

  async function decode(value: unknown): Promise<SaveEnvelope<T>> {
    if (!value || typeof value !== 'object')
      throw new Error('The local save is not a complete envelope.');
    const envelope = value as Partial<SaveEnvelope<T>>;
    if (envelope.envelopeVersion !== 1)
      throw new Error('This local save uses an unsupported envelope version.');
    if (
      Object.keys(envelope).sort().join(',') !==
        'digest,envelopeVersion,generation,payload,savedAt,session' ||
      typeof envelope.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(envelope.digest) ||
      typeof envelope.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(envelope.savedAt)) ||
      typeof envelope.session !== 'string' ||
      envelope.session.length < 1 ||
      envelope.session.length > 128 ||
      !Number.isSafeInteger(envelope.generation) ||
      envelope.generation! < 1
    )
      throw new Error('The local save has invalid metadata.');
    if (canonicalBytes(envelope.payload).byteLength > DEFAULT_HISTORY_LIMITS.maxBytes)
      throw new Error('The local save exceeds the supported payload limit.');
    if ((await digestCanonical(envelope.payload)) !== envelope.digest)
      throw new Error('The local save checksum does not match. The stored record was retained.');
    validate(envelope.payload);
    const payload = capture(envelope.payload);
    if (historyLimitReason(payload, DEFAULT_HISTORY_LIMITS))
      throw new Error('The local save exceeds the history limit.');
    return { ...envelope, payload } as SaveEnvelope<T>;
  }
  return { prepare, decode };
}
