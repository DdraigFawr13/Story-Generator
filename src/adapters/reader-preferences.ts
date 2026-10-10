export type RecapCadence = 'yearly' | 'seasonal' | 'off';
export const RECAP_PREFERENCE_KEY = 'story-generator.recap-cadence.v1';

export function readRecapPreference(): RecapCadence {
  try {
    const value = localStorage.getItem(RECAP_PREFERENCE_KEY);
    return value === 'seasonal' || value === 'off' ? value : 'yearly';
  } catch {
    return 'yearly';
  }
}

export function writeRecapPreference(value: RecapCadence): void {
  try {
    localStorage.setItem(RECAP_PREFERENCE_KEY, value);
  } catch {
    // Reading and unsaved play remain available when preference storage is denied.
  }
}
