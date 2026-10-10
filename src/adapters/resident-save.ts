import { validateResidentWorld, type ResidentWorldState } from '../sim/resident-world';
import { saveCodec, type SaveEnvelope } from './save-envelope';

export type ResidentSaveEnvelope = SaveEnvelope<ResidentWorldState>;
const codec = saveCodec(validateResidentWorld);
export const prepareResidentSave = codec.prepare;
export const decodeResidentSave = codec.decode;
