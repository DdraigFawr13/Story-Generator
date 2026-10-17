// Generation feuds and exile: a wrong between two houses outlives both, heirs inherit it, it flares
// in killings, a killer is driven to a foreign court and may return, and an inheritance quarrel can
// split a house. Tune the numbers here; the engine reads only this table (engine/history/feuds.ts).

import type { FeudRules } from '../engine';

export const FEUDS: FeudRules = {
  // A killing across houses begins a feud by cause: murder and plots always, a raid, duel or execution always too, a razing four times in five, a battle nine in ten.
  startChance: {
    murder: 1,
    assassination: 1,
    overthrow: 1,
    raid: 1,
    duel: 1,
    execution: 1,
    razing: 0.8,
    battle: 0.9,
  },
  // A house is in at most two feuds at once.
  maxOpen: 2,
  // An heir takes up the feud three times in four at first, five points less each generation, never under 35 in 100.
  inheritChance: 0.75,
  inheritPerGeneration: 0.05,
  inheritFloor: 0.35,
  // The house owed blood acts through its bearer one year in five.
  actChance: 0.2,
  // After a blow, a death or an heir taking it up, the feud rests three years.
  quietYears: 3,
  // An acting bearer lets it end 3 times in 100, two points more each generation.
  endBase: 0.03,
  endPerGeneration: 0.02,
  // Houses of one people, or of sworn allies, make peace twice as readily.
  endAlliedFactor: 2,
  // A pair wed to end a feud are within ten years of an age.
  weddingAgeGap: 10,
  // While a son or daughter of each house is free to marry, the feud ends in a match a quarter of the time a year, five points more each generation.
  wedBase: 0.25,
  wedPerGeneration: 0.05,
  // A legend is the target one strike in five.
  legendTarget: 0.2,
  // A strike kills 45 times in 100; a legend 15.
  killChance: 0.45,
  legendKill: 0.15,
  // As a raid (1): a killing across peoples is a wrong between them.
  strikeGrievance: 1,
  // A ruler drives out a killer of their own people eight times in ten, the ruler's kin half the time.
  exileChance: 0.8,
  exileKinChance: 0.5,
  // The claimant who lost a disputed seat is driven out one time in three.
  disputeExileChance: 0.35,
  // Six years abroad before a return; then 15 in 100 a year.
  returnMinYears: 6,
  returnChance: 0.15,
  // A host with a raid's grievance (1), or at war, may let the exile lead a raid home.
  raidGrievance: 1,
  // 24 cells from the host's capital.
  raidRange: 24,
  // The home ruler falls in the raid 15 times in 100, a legend 5.
  raidKill: 0.15,
  raidKillLegend: 0.05,
  // When a ruler, a founder or an artifact's holder dies leaving two grown heirs, one time in ten the younger breaks away.
  splitChance: 0.1,
  // Half the splits become a feud at once.
  splitFeudChance: 0.5,
  // A house stands twenty years before it can split.
  splitMinYears: 20,
  phrases: {
    kin: {
      m: ['son', 'grandson', 'great-grandson', 'great-great-grandson'],
      f: ['daughter', 'granddaughter', 'great-granddaughter', 'great-great-granddaughter'],
      other: 'kin',
    },
    whyKilled: 'when {killer} slew {dead} at {site}',
    whySplit: "over {dead}'s {what}",
    overSeat: 'lands',
    overHouse: 'hall',
    parent: { m: 'father', f: 'mother' },
    ended: {
      wed: 'when {a} wed {b}',
      paid: 'with a blood price',
      forgotten: 'when {name} let it lie',
      diedOut: 'when no one was left to carry it',
      beyond: 'when the last of {foe} had gone where no one could follow',
    },
    generationsOld: [
      'one generation old',
      'two generations old',
      'three generations old',
      'four generations old',
      'five generations old',
    ],
    struck: {
      slain: 'and {target} was slain',
      escaped: [
        'but {target} escaped',
        'but {target} was only wounded',
        "but {target}'s kin drove the attackers off",
        'but {target} was warned and slipped away',
      ],
    },
    exile: {
      killing: 'for the killing of {dead}',
      war: 'after the lost war for the seat',
      dispute: 'after losing the seat to {winner}',
    },
    returned: {
      pardoned: 'came home from exile among the {host}, pardoned by the new ruler',
      claim: 'came home from exile among the {host} to press a claim to the seat',
      raid: 'led the {host} raiders from exile against {site}, and {dead} died there',
    },
  },
};
