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
      // Courtship: it takes every gift.
      courtAccept: 1,
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
      // Courtship: it burns the envoys seven times in ten.
      courtAccept: 0.3,
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
      // Courtship: it takes the gifts six times in ten.
      courtAccept: 0.6,
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
  court: {
    // A realm deals with a dragon when its capital lies within 60 cells of the lair.
    courtRange: 60,
    // A ruler answers once the realm has taken 2 harms from one dragon.
    fearHarms: 2,
    // Yearly chance of an answer once the harms are enough.
    answerChance: 0.3,
    // Chance of a bounty over a pact: 0.5, +0.05 per point of war above 5, -0.05 per point of
    // wealth above 5, +0.2 with a living legend, kept between 0.1 and 0.9.
    bountyBase: 0.5,
    bountyPerWar: 0.05,
    bountyPerWealth: 0.05,
    bountyLegend: 0.2,
    bountyRange: [0.1, 0.9],
    // A pact realm's capital gives a third of its food every 5 years.
    pactShare: 0.33,
    pactEvery: 5,
    // Yearly chance a ruler at war courts a dragon within courtRange of the enemy; a courted dragon
    // is loosed on enemy towns within courtRange of where it is.
    courtChance: 0.06,
    // Grievance the struck realm holds against the courter per unleashed raid.
    grievanceUnleashed: 1,
    // Yearly chance a figure takes a standing bounty; the same figure waits 25 years.
    bountyTakeChance: 0.05,
    bountyCooldown: 25,
    // The payer lends a fifth of its adults, at most 1,000, to the figure who takes the bounty;
    // the host raises the odds of the kill and shields the taker (about 1 death in 10 hunts).
    bountyAidShare: 0.2,
    bountyAidCap: 1000,
    // The payer's guides and gold triple the slay chance of a bounty hunt.
    bountyOdds: 3,
    // A courted dragon raids four times as often while its courter has an enemy town in reach.
    unleashFactor: 4,
    // Fame the slayer gains for claiming the bounty.
    bountyFame: 5,
    phrases: {
      prices: [
        'a chest of gold',
        'a hundred head of cattle and a hall',
        "a lord's share of silver",
      ],
      pactWord: 'a third of its food',
      courtAccepted: 'and the dragon took the gifts',
      courtRefused: 'but the dragon burned the envoys',
    },
  },
};
