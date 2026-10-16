// Court intrigue: plots, legends in politics, bribes, bounties and hunts. Tune the numbers here;
// the engine reads only this table (engine/history/intrigue.ts and succeed in notables.ts).
// Grievance sits on the scale of the history rules: a raid 1, an insult 0.6, a sworn vengeance 1.5,
// and a war needs at least 1.

import type { IntrigueRules } from '../engine';

export const INTRIGUE: IntrigueRules = {
  // A plotter lies low a decade before the next try.
  plotCooldown: 10,
  // Before the culture's unruliness: about one beaten claimant in six plots in a decade.
  rivalPlotChance: 0.06,
  // A sworn avenger of a murdered kinsman rarely reaches a foreign throne.
  vengeancePlotChance: 0.02,
  // Intellect 10 strikes four times in ten; each point adds two in a hundred.
  strikeBase: 0.4,
  strikeIntellect: 0.02,
  strikeRange: [0.05, 0.8],
  // A ruler's guard cuts the odds by a quarter; a legend is hard to kill in the dark.
  rulerGuard: 0.75,
  legendStrike: 0.15,
  usurpChance: 0.6,
  caughtChance: 0.5,
  // Between an insult (0.6) and a sworn vengeance (1.5) twice over: a murder is remembered.
  grievanceMurder: 3,
  grievanceFoiled: 1.5,
  honourChance: 0.3,
  honourFame: 5,
  // At or over the 1 a war needs.
  fearGrievance: 1,
  fearPlotChance: 0.1,
  ownFearChance: 0.03,
  seizeChance: 0.35,
  seizeChildFactor: 2,
  coupChance: 0.25,
  betrayChance: 0.15,
  grievanceBetrayal: 2.5,
  bribeChance: 0.2,
  bountyHarms: 2,
  grievanceShelter: 1,
  coalitionMin: 2,
  coalitionChance: 0.3,
  soloHuntChance: 0.1,
  // Strong or better (R-24): a hunt is led by someone who can face a legend's guards.
  hunterPower: 7,
  huntShare: 0.03,
  huntCap: 400,
  huntKill: 0.7,
  hunterDeath: 0.3,
  // A legend's death is news over the yearly rollup (base 2).
  legendDeathImportance: 2,
  phrases: {
    why: {
      rival: 'for the seat denied them',
      vengeance: 'to keep the oath for {dead}',
      fear: 'for the harm {target} had done the {civ}',
      ownFear: 'for fear of the renown of {target}',
    },
    struck: 'and {target} was killed',
    foiledCaught: 'but the blow failed and {name} was taken and put to death',
    foiledExposed: "but the blow failed and the plot was laid at {name}'s door",
    foiledEscaped: 'but the blow failed and {name} slipped away',
    usurp: 'by the blow that ended {prior}',
    seize: 'by strength of arm, past {heir}, the heir by custom',
    coup: 'by strength of arm, casting down {prior}',
    betrayRival: 'after the quarrel with {ruler}',
    betrayStranger: 'a stranger to the ways of the {civ}',
    gifts: ['a seat at the high table', 'lands about {site}', 'the captaincy of the guard'],
    bribes: ['a chest of silver', 'a ring of red gold', 'the promise of land'],
    prices: ['a bounty in gold', "a lord's ransom in silver", 'a price in land and silver'],
    huntKilled: 'and {name} was killed',
    huntEscaped: 'but {name} slipped away, wounded',
    huntFailed: 'and {name} broke the hunt',
  },
};
