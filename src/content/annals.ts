// Annals of each people (M4.9): how a people's years are split into eras and what the eras are
// called. Names are picked by civ id and era number, never at random.
import type { AnnalRules } from '../engine';

export const ANNALS: AnnalRules = {
  // At most 8 eras per people; a run shorter than 10 years joins its neighbour.
  maxEras: 8,
  minEraYears: 10,
  // A year is tagged by the gravest event of each kind within 3 years either side (growth only when nothing worse).
  smoothYears: 3,
  // Wars and strife shape a realm's memory more than its yearly sicknesses: a common fever (4 x 0.7)
  // stays under the floor of 5, a great plague or a famine across the realm reaches it.
  tagWeight: { war: 1.5, strife: 1.5, beasts: 1, famine: 0.8, plague: 0.7 },
  minScore: 5,
  // A quiet era of 40 years or more is a long peace.
  longPeaceYears: 40,
  // Events listed under an era, and lines in the summary.
  keyEvents: 3,
  maxSummary: 10,
  // A quiet era of longPeaceYears or more takes this name first.
  longPeace: 'the Long Peace',
  // Event types that mark a year for an era.
  tags: {
    war: ['battle', 'war_declared', 'site_razed', 'site_conquered'],
    strife: [
      'civil_war_began',
      'succession_disputed',
      'throne_seized',
      'seat_seized',
      'revolt_crushed',
      'realm_split',
    ],
    plague: ['plague', 'fever', 'pox'],
    famine: ['famine'],
    beasts: ['beast_raid'],
    growth: ['site_founded', 'site_grew'],
  },
  names: {
    war: ['the Years of Iron', 'the Red Years', 'the Years of Banners'],
    strife: ['the Kinstrife', 'the Broken Crown', 'the Divided Years'],
    plague: ['the Sickness', 'the Grey Years'],
    famine: ['the Hungry Years', 'the Lean Years'],
    beasts: ['the Years of Teeth', 'the Beast Years'],
    growth: ['the Spreading', 'the Founding Years', 'the Building Years'],
    quiet: ['the Quiet Years', 'the Still Years', 'the Calm Years'],
  },
  // Used first when the era's record gives the enemy, disease or beast.
  namedFor: {
    war: 'the {enemy} Wars',
    plague: 'the Years of the {disease}',
    beasts: 'the Years of the {beast}',
  },
  // Taken names fall back on "the Second ..." and so on.
  repeatName: 'the {ordinal} {name}',
  ordinals: ['Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'],
};
