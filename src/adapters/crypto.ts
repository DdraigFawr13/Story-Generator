import { canonicalBytes } from '../sim/canonical';

export async function digestCanonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', canonicalBytes(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
