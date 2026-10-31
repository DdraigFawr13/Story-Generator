// Crafts (W1): each people may discover crafts, each with a named first maker; a craft passes from
// master to pupil, is lost when its last master dies untaught, and is found again by reinvention
// or from a treatise. Tune the numbers here; the engine reads only this table (engine/history/crafts.ts).

import type { CraftRules } from '../engine';

export const CRAFTS: CraftRules = {
  crafts: [
    {
      id: 'iron-working',
      name: 'iron-working',
      first: 'drew the first iron from the bloom',
      good: 'ore',
      // Measured (8 worlds): a site with 100 ore (about 110 adults) is reached by about half of peoples.
      minGood: 100,
      siteKinds: ['hamlet', 'village', 'town', 'city', 'fortress', 'hold', 'mine', 'port'],
      effect: { kind: 'yield', good: 'ore', factor: 1.15 },
      bookForm: 'treatise',
    },
    {
      id: 'pattern-welding',
      name: 'pattern-welding',
      first: 'folded iron into a patterned blade',
      good: 'ore',
      // Measured: 60 ore is reached by about 40% of peoples; most also need iron-working first.
      minGood: 60,
      siteKinds: ['town', 'city', 'fortress', 'hold', 'mine'],
      requires: 'iron-working',
      effect: { kind: 'artifacts', factor: 1.5 },
      bookForm: 'treatise',
    },
    {
      id: 'bell-founding',
      name: 'bell-founding',
      first: 'cast a bell that rang true',
      good: 'ore',
      // Measured: towns and cities with 20 ore are about 40% of peoples, the most they ever reach.
      minGood: 20,
      siteKinds: ['town', 'city'],
      effect: { kind: 'yield', good: 'luxury', factor: 1.05 },
      bookForm: 'treatise',
    },
    {
      id: 'glass-blowing',
      name: 'glass-blowing',
      first: 'blew the first clear glass',
      good: 'luxury',
      // Measured: 3 luxury in a town or city is 38% of peoples; higher thresholds thin it fast.
      minGood: 3,
      siteKinds: ['town', 'city'],
      effect: { kind: 'yield', good: 'luxury', factor: 1.1 },
      bookForm: 'treatise',
    },
    {
      id: 'purple-dyeing',
      name: 'the purple dye',
      first: 'fixed a purple that would not fade',
      good: 'luxury',
      // Measured: 10 luxury in a village, town, city or port is 53% of peoples.
      minGood: 10,
      siteKinds: ['village', 'town', 'city', 'port'],
      effect: { kind: 'yield', good: 'luxury', factor: 1.1 },
      bookForm: 'treatise',
    },
    {
      id: 'salt-panning',
      name: 'salt-panning',
      first: 'boiled white salt from the brine',
      good: 'salt',
      // Measured: salt is rare; 3 is about a third of peoples, the most any threshold gives.
      minGood: 3,
      siteKinds: ['hamlet', 'village', 'town', 'city', 'port'],
      effect: { kind: 'yield', good: 'salt', factor: 1.15 },
      bookForm: 'treatise',
    },
    {
      id: 'coppicing',
      name: 'coppicing',
      first: 'cut a wood so that it grew again',
      good: 'timber',
      // Measured: timber piles up, so only a big stock (150) cuts it to about 57% of peoples.
      minGood: 150,
      siteKinds: ['hamlet', 'village', 'town', 'hold'],
      effect: { kind: 'yield', good: 'timber', factor: 1.15 },
      bookForm: 'treatise',
    },
  ],
  // One in a hundred a year per people and craft: a craft turns up about once in a century or two.
  discoverChance: 0.01,
  // A lost craft is half as likely to be hit on again as a new one: the knowledge is gone, the need is not.
  reinventFactor: 0.5,
  // A generation must pass before a lost craft is hit on again: whoever lost it is not the one to find it.
  reinventAfterYears: 20,
  // Three living masters at most per people: few enough that a craft can still be lost.
  maxMasters: 3,
  // A master takes a pupil about every other year when none is in training: a craft seldom dies with one master.
  teachChance: 0.5,
  // A decade of training before the pupil counts as a master and the master may take another.
  trainingYears: 10,
  // About one master in two hundred a year sets the craft down: most never write, so a lost craft stays lost.
  bookChance: 0.005,
  // About five years to find and read a treatise once a people has lost the craft it holds.
  readChance: 0.2,
  // Titles leave the craft out, so the chronicle line that names the craft does not say it twice.
  bookNames: [
    'the workshop book of {site}',
    "{writer}'s book of the bench",
    'the rules of {writer}',
    'the {site} book of the craft',
  ],
  phrases: {
    diedUntaught: '{name}, the last who knew it, died untaught',
    wentAway: '{name}, the last who knew it, now served another people',
    forgotten: 'no one was left who knew it',
  },
};
