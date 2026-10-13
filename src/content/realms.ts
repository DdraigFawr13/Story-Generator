// Colleges of magic and free cities (playtest add-on). Tune the numbers here; the engine reads
// only these tables (engine/history/colleges.ts and city-states.ts).

import type { CityStateRules, CollegeRules, FreeCityRules } from '../engine';

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
  // Two to four on a 256x256 map.
  start: { min: 2, max: 4, landCellsPerCity: 9000 },
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
    chance: 0.03,
    famine: 3,
    war: 2,
    dispute: 3,
    maxFree: 6,
    grievance: 3,
    // Long enough to swear a pact before the old realm comes back.
    graceYears: 10,
  },
  pact: { chance: 0.5, maxGrievance: 1, aidShare: 0.3, grievance: 0.5 },
};
