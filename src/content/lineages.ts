// Spellbooks and lineages (M5.2). Tune the numbers here; the engine reads only this table
// (engine/history/lineages.ts).

import type { LineageRules } from '../engine';

export const LINEAGES: LineageRules = {
  // Gifted (3) and up: enough to be taught anything beyond a cantrip.
  minPower: 3,
  // About 12 of 20 years for a human: a child is sent to a master a little before they are grown.
  apprenticeShare: 0.6,
  // Strong (R-24): a master must be able to work the spells they teach.
  teacherPower: 7,
  maxApprentices: 3,
  // A decade past maturity: apprentices stay in training this long, so a master has room for the next.
  trainingYears: 10,
  // About one new spell every other year until a mage knows all their sources hold.
  learnChance: 0.5,
  // Half a lifespan: old enough to teach, young enough to outlive the first generation.
  elderMasterAge: 0.5,
  oldLoreNames: [
    'the old lore of the {civ}',
    'the {school} canon of the {civ}',
    'the elder book of {site}',
  ],
  // Fire takes about half the books of a razed town.
  burnChance: 0.5,
  // Roughly one legend in five takes a pupil in a given year, so a master has one by middle age.
  legendApprenticeChance: 0.2,
  // Strong spells and up: the losses a people would feel; gifted ones go without a line.
  lostPower: 8,
  phrases: {
    teacher: 'under {teacher} at {site}',
    mother: 'from {teacher}, her mother',
    father: 'from {teacher}, his father',
    college: 'at {college}',
    book: 'from the pages of {book}',
    hedge: 'at the knee of a hedge-witch of {site}',
    taughtBy: 'taught by {teacher}',
    diedLast: '{name}, the last who knew the art, had died',
    burned: '{item}, the last record they had, burned at {site}',
    collegeFell: '{college} fell, and its teaching with it',
    forgotten: 'the last who knew the art were gone',
    wentAway: '{name}, the last who knew the art, now served another people',
  },
};
