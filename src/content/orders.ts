// Knightly orders and magic academies (orders.ts): a living legend may found one, it recruits,
// acts in history, passes from head to head and keeps or loses the founder's lore. Each people
// reveres, regulates or persecutes magic, by its values. Tune the numbers here; the engine reads
// only this table (engine/history/orders.ts).

import type { OrderRules } from '../engine';

export const ORDERS: OrderRules = {
  // A living legend who never founded one does so three years in a hundred.
  foundChance: 0.03,
  // A hero or captain of renown (fame 25, about the top quarter) founds an order one year in a hundred.
  heroFounders: { titles: ['hero', 'captain'], minFame: 25, chance: 0.01 },
  // A spell of power 8 (Strong) in their school makes the founder's house an academy.
  academyMinSpell: 8,
  // Six orders and six academies open in the world at once, besides one of each per people.
  maxOpen: 6,
  founderFame: 8,
  orderNames: [
    'the Order of the {emblem}',
    'the {emblem} Knights of {site}',
    'the Knights of {site}',
    "{founder}'s Company",
  ],
  academyNames: [
    'the {school} Academy of {site}',
    'the Academy of the {emblem}',
    'the {emblem} Hall of {site}',
    'the {school} Hall',
  ],
  charteredNames: [
    'the Royal {school} Academy of {site}',
    'the Royal Academy of {site}',
    'the Royal {emblem} Hall',
  ],
  emblems: [
    'Ash',
    'Silver Hart',
    'Black Boar',
    'Seven Stars',
    'Red Hand',
    'Iron Bell',
    'Thorn',
    'Long Road',
    'Grey Wolf',
    'White Tower',
    'Lantern',
    'Oak',
    'Broken Spear',
    'Golden Hound',
    'Raven',
    'Green Flame',
  ],
  // Fifteen in a hundred a year for each fit person, so a hall fills in a few years.
  recruitChance: 0.15,
  maxKnights: 6,
  maxScholars: 8,
  // Heroes, captains, raiders and the ruler's kin: the fighting nobility.
  knightTitles: ['hero', 'captain', 'raider', 'kin'],
  // Gifted (3) and up.
  academyMinPower: 3,
  // A legend's joining stays in the chronicle.
  legendJoinBonus: 3,
  trainChance: 0.04,
  learnChance: 0.3,
  // Knights ride out a year in three against a beast near the seat that raided their people in the last 10 years.
  knightHuntChance: 0.33,
  knightRaidYears: 10,
  // The other knights lend the hunter all their soldiers.
  knightAid: 1,
  orderDefence: 1.3,
  // Learning welcomes magic; faith and order fence it in. Score 4+ reveres, -4 and under persecutes.
  attitude: { weights: { learning: 2, faith: -1, order: -1 }, revereAt: 4, persecuteAt: -4 },
  attitudes: {
    revere: { notice: 1.25, collegeFound: 1.5, word: 'revere magic' },
    regulate: { notice: 1, collegeFound: 1, word: 'license magic' },
    persecute: { notice: 0.5, collegeFound: 0, word: 'hunt mages' },
  },
  hunt: {
    // Three Strong mages in a hundred a year, a legend a fifth of that, and half again with knights to hunt them.
    chance: 0.03,
    legendFactor: 0.2,
    orderFactor: 1.5,
    // Burned 35 times in 100, a legend 10; half of the rest flee.
    burnChance: 0.35,
    legendBurnChance: 0.1,
    fleeChance: 0.5,
    // A burning is kept in the chronicle, not rolled into a year's count of deaths.
    burnImportance: 2,
  },
  phrases: {
    knights: ', with the knights of {order} under {head} riding at their head',
    burned: 'was burned',
    fled: 'fled to {refuge}',
    hid: 'went into hiding and was never found',
    crown: 'the crown named {name}',
    chosen: 'the {members} chose {name}',
    members: { order: 'knights', academy: 'scholars' },
    member: { order: 'knight', academy: 'scholar' },
    fell: 'broken with the fall of the {civ}',
    closed: 'closed by the {civ}, who hunt mages',
    lastDied: 'its last {member} died',
    lost: 'lost with the ruin of {site}',
    headDied: 'the death of {head}',
    ended: 'the end of {order}',
    scholarsPassed: 'the passing of its scholars',
    collegeLost: 'with the fall of {site}',
    collegeHunted: 'when {site} passed to the {civ}, who hunt mages',
  },
};
