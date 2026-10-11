// Calendar (R-21): the base unit is the day. 12 months × 28 days = 336-day year,
// with four seasons of three months each. Day 0 is the first day of spring, year 1.

export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 28;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_SEASON = DAYS_PER_MONTH * 3;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

// Placeholder flavour names; cultures may rename months in Phase 2.
export const MONTH_NAMES = [
  'Thawmonth',
  'Seedmonth',
  'Bloommonth',
  'Highsun',
  'Goldmonth',
  'Harvestmonth',
  'Leaffall',
  'Mistmonth',
  'Firstfrost',
  'Deepwinter',
  'Frostmonth',
  'Lastsnow',
] as const;

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'yearly';
export const CADENCES: readonly Cadence[] = ['daily', 'weekly', 'monthly', 'seasonal', 'yearly'];

export interface CalendarDate {
  year: number;
  month: number;
  dayOfMonth: number;
  season: Season;
}

export function dateOf(day: number): CalendarDate {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1;
  const dayOfYear = day % DAYS_PER_YEAR;
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH);
  return {
    year,
    month,
    dayOfMonth: (dayOfYear % DAYS_PER_MONTH) + 1,
    season: SEASONS[Math.floor(month / 3)]!,
  };
}

export function formatDate(day: number): string {
  const date = dateOf(day);
  return `${date.dayOfMonth} ${MONTH_NAMES[date.month]}, Year ${date.year}`;
}

/** A system with this cadence runs on day `day` when this returns true. */
export function isDue(cadence: Cadence, day: number): boolean {
  switch (cadence) {
    case 'daily':
      return true;
    case 'weekly':
      return day % DAYS_PER_WEEK === 0;
    case 'monthly':
      return day % DAYS_PER_MONTH === 0;
    case 'seasonal':
      return day % DAYS_PER_SEASON === 0;
    case 'yearly':
      return day % DAYS_PER_YEAR === 0;
  }
}
