import { validateLivingSettlement } from '../sim/living-validation';
import type { LivingSettlementState } from '../sim/living-state';
import { saveCodec, type SaveEnvelope } from './save-envelope';

export type LivingSaveEnvelope = SaveEnvelope<LivingSettlementState>;
const codec = saveCodec(validateLivingSettlement);
export const prepareLivingSave = codec.prepare;
export const decodeLivingSave = codec.decode;
