import { validateWorld, type WorldState } from '../sim/world';
import { saveCodec, type SaveEnvelope } from './save-envelope';

export type WorldSaveEnvelope = SaveEnvelope<WorldState>;
const codec = saveCodec(validateWorld);
export const prepareWorldSave = codec.prepare;
export const decodeWorldSave = codec.decode;
