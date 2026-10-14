// Colleges of magic and free cities (playtest add-on). Tune the numbers here; the engine reads
// only these tables (engine/history/colleges.ts and city-states.ts).

import type { CityStateRules, CivilWarRules, CollegeRules, FreeCityRules } from '../engine';

export const COLLEGES: CollegeRules = {
  // A town of a few hundred: a college needs people to feed and teach.
  minPop: 200,
  // Learning 9 (Tylwyth): about a one-in-four chance a decade once a strong mage lives.
  foundChance: 0.25,
  maxOpen: 2,
  // Teachers go looking for gifted children, so twice as many mages are noticed.
  noticeFactor: 2,
  // A strong mage of the college's people gains a step about every 25 years.
  trainChance: 0.04,
  legendFactor: 1.5,
  // Gifted mages of other peoples come to study for about a decade, then go home with what they learned.
  travelChance: 0.08,
  travelRange: 80,
  studyYears: 10,
  names: ['the College of {site}', 'the {school} Hall of {site}', 'the Lyceum at {site}'],
  // Exceptional (R-24): enough power to turn the weather of a valley or a sickness in a town.
  spellPower: 13,
  spellChance: 0.3,
  spellRange: 40,
  spellRest: 5,
  spellFame: 8,
  bountyYears: 0.5,
  wardYears: 10,
  spells: [
    {
      id: 'rain',
      target: 'dry',
      schools: ['water', 'air', 'life'],
      deed: 'called the rains over {site}, and the dry years broke',
    },
    {
      id: 'thaw',
      target: 'cold',
      schools: ['fire', 'air', 'earth'],
      deed: 'drove the cold from the fields of {site}, and the hard winters ended',
    },
    {
      id: 'ward',
      target: 'disease',
      schools: ['life', 'mind', 'water'],
      deed: 'warded {site} against {disease}, and it spread no further',
    },
    {
      id: 'bounty',
      target: 'famine',
      schools: ['earth', 'life', 'water', 'fire'],
      deed: 'made the fields of {site} bear again after the famine',
    },
  ],
};

export const FREE_CITIES: FreeCityRules = {
  // About seven on a default 256x256 map (35% land), three on 128x128.
  start: { min: 3, max: 8, landCellsPerCity: 3000 },
  capitalSpacing: 16,
  siteSpacing: 6,
  pop: [120, 260],
  names: ['Free City of {n}', 'Commune of {n}', 'Lordship of {n}'],
};

export const CITY_STATES: CityStateRules = {
  secede: {
    minSites: 3,
    minPop: 150,
    // About a day and a half's ride from the throne.
    minDistance: 16,
    // About one far town in twenty a decade for a freedom-loving people, before famine, war or a dispute.
    chance: 0.05,
    famine: 3,
    war: 2,
    dispute: 3,
    maxFree: 12,
    grievance: 3,
    // Long enough to swear a pact and raise walls before the old realm comes back.
    graceYears: 20,
  },
  pact: { chance: 0.8, maxGrievance: 1, aidShare: 0.3, grievance: 0.5 },
};

export const CIVIL_WARS: CivilWarRules = {
  // About two beaten claimants in three rise in a people of war value 10; one in four at 4.
  chance: 0.7,
  // A realm of a capital and two towns can tear itself in two; smaller ones only quarrel.
  minSites: 3,
  // The claimant's seat and the towns nearer to it than to the throne, until they hold a third to
  // three fifths of the realm's grown people.
  share: [0.35, 0.6],
  executeChance: 0.5,
  // Shorter than a war abroad (8): neither half can keep its levy in the field for long.
  maxYears: 5,
  // Luck of +-25% becomes +-50%: a weaker claimant can win a battle, and one win turns a war.
  luck: 2,
  // A realm at war with itself loses its far towns more easily than one at war abroad (war 2).
  breakaway: 3,
  // Above the war threshold for a warlike people: the old realm wants its half back.
  splitGrievance: 4,
  // A house that held the seat two generations, or for three rulers, gets an ending in the record.
  houseYears: 50,
  houseRulers: 3,
  phrases: {
    alone: '{site} alone',
    one: '{site} and the town nearest it',
    many: '{site} and the {n} towns nearest it',
    executed: '{name} was put to death',
    exiled: '{name} fled abroad',
    oneYear: 'a year',
    years: '{n} years',
    reign: '{years} years and {rulers}',
    oneRuler: 'a single ruler',
  },
  ordinals: ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'],
};
