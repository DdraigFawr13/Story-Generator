// Awakenings (REBOOT_PLAN §5.3, M3.9): what can raise a person one magic tier, once in a life and
// never into Legendary. A person with no power can rise to Faint this way (decided 2026-10-12);
// there is no spontaneous talent (R-26). Add entries freely; the engine reads only these.

import type { AwakeningDef } from '../engine';

export const AWAKENINGS: AwakeningDef[] = [
  {
    id: 'long-study',
    source: 'book',
    // Half a year of evenings over a book of a magic school.
    afterDays: 168,
    monthlyChance: 0.08,
    maxFromTier: 'faint',
    how: 'after long study of {item}',
  },
  {
    id: 'bound-item',
    source: 'item',
    // A year with an item of power at their side.
    afterDays: 336,
    monthlyChance: 0.05,
    maxFromTier: 'gifted',
    how: 'through long keeping of {item}',
  },
];
