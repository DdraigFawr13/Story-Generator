export const WEEKS_PER_SEASON = 12;
export const WEEKS_PER_YEAR = 48;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export function validateTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid committed tick.');
}

export function nextTick(tick: number): number {
  validateTick(tick);
  if (tick === Number.MAX_SAFE_INTEGER) throw new Error('Tick counter exhausted.');
  return tick + 1;
}

export function calendarAtTick(tick: number) {
  validateTick(tick);
  if (tick === 0) return { kind: 'founding' } as const;
  return {
    kind: 'week',
    year: Math.floor((tick - 1) / WEEKS_PER_YEAR) + 1,
    season: SEASONS[Math.floor((tick - 1) / WEEKS_PER_SEASON) % 4]!,
    week: ((tick - 1) % WEEKS_PER_SEASON) + 1,
    seasonBoundary: tick % WEEKS_PER_SEASON === 0,
  } as const;
}
