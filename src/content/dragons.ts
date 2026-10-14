// The dragon as an individual (M5.6): one to three alive at once by world size (Morgan chose
// "up to three at once", 2026-10-14; danger stays 700 under R-24), each with a given name, a
// temper, a lair and a hoard. Danger, raids, roaming and lifespan come from the `draig` creature
// entry in creatures.ts.

import type { DragonRules } from '../engine';

export const dragons: DragonRules = {
  creatureId: 'draig',
  // The first dragon wakes in year 1 to 30.
  firstBy: 30,
  // A large world's second and third dragons wake later, in year 1 to 120.
  laterFirstBy: 120,
  // 128x128 holds one dragon at a time; 256x256 holds up to three.
  cellsPerDragon: 20000,
  maxAlive: 3,
  // Two living dragons' lairs lie at least 48 cells apart, so each has its own country.
  lairsApart: 48,
  // A dragon's death, of any cause, is followed by a quiet of 30 to 80 years.
  successorGap: [30, 80],
  ageOnWaking: [80, 300],
  names: [
    'Ysgythr',
    'Gwenwyn',
    'Tanllyd',
    'Morgawr',
    'Brydan',
    'Cynddaredd',
    'Gwyllt',
    'Mellten',
    'Ffyrnig',
    'Rhuddwen',
    'Dulas',
    'Eurwen',
    'Cadwgan',
    'Tywyllwch',
  ],
  tempers: [
    {
      id: 'greedy',
      epithet: 'the Greedy',
      word: 'greedy',
      // Common: it would rather be paid than fight.
      weight: 4,
      raidFactor: 1,
      tribute: true,
      burnBelow: 0,
      burnChance: 0,
      burnGap: 0,
    },
    {
      id: 'wrathful',
      epithet: 'the Wrathful',
      word: 'wrathful',
      weight: 3,
      // Raids twice as often as the kind does.
      raidFactor: 2,
      tribute: false,
      // A site it leaves under 300 people burns one time in eight, at most once in 30 years.
      burnBelow: 300,
      burnChance: 0.12,
      burnGap: 30,
    },
    {
      id: 'slumbering',
      epithet: 'the Slumbering',
      word: 'given to long sleeps',
      weight: 3,
      raidFactor: 1,
      tribute: false,
      burnBelow: 0,
      burnChance: 0,
      burnGap: 0,
      // Sleeps 20 to 50 years, wakes 5 to 15.
      sleep: [20, 50],
      wake: [5, 15],
    },
  ],
  lairNames: ["{name}'s Hollow", "{name}'s Deep", 'the Burnt Hall of {name}', "{name}'s Barrow"],
  // A lair in or within 6 cells of a range or volcano lies under it.
  lairRegionKinds: ['range', 'volcano'],
  lairRegionReach: 6,
  lairUnder: 'under {region}',
  lairNear: 'near {near}',
  noSettleRadius: 10,
  tributeShare: 0.33,
  tributeWord: 'a third of their stores',
  // Said of a town paying again, so a repeated tribute line says what changed.
  tributeAgain: ', for the {nth} time',
  // A seeker sets out with chance 0.3% per tribute in the hoard, at most 8% a year.
  seekerPerHoard: 0.003,
  seekerMax: 0.08,
  seekerRange: 80,
  // One treasure counts as five tributes when a seeker weighs a hoard.
  treasureValue: 5,
  // 50 people's yearly food per tribute or plunder in the hoard.
  grainPerSpoil: 50,
  slainImportance: 4,
  hoardWords: {
    tribute: ['tribute', 'tributes'],
    plunder: ['raid spoil', 'raid spoils'],
    treasure: ['treasure', 'treasures'],
  },
  spoilsWord: 'the tribute and plunder it had gathered',
};
