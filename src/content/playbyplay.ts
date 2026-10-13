// Play-by-play beats for epic battles and beast fights. Every placeholder comes from the event or
// its linked events; no beat adds a place, weapon or wound the record does not carry.

import type { PlayByPlayRules } from '../engine';

export const PLAY_BY_PLAY: PlayByPlayRules = {
  // Soldiers lost in a battle that makes it epic (a champion or a named death makes it so too).
  battleLostAtLeast: 60,
  // Danger of a beast (great and legendary) that makes its fight epic; a named death does too.
  beastDangerAtLeast: 40,
  // Defence factor x100 (100 is open ground) from which the ground gets its own line.
  wallsAtLeast: 120,
  // Forces after luck this close (percent of the bigger) read as an even fight.
  evenWithinPercent: 10,
  // Win chance in percent: below the first is long odds, above the second is favoured.
  longOdds: 35,
  favouredOdds: 65,
  maxBeats: 6,
  beats: {
    muster: [
      'The {civ} marched on {site} with about {army} soldiers; the {enemy} met them with {defenders}.',
      'About {army} soldiers of the {civ} came to {site}, and {defenders} of the {enemy} stood against them.',
      'The {enemy} held {site} with {defenders}, and the {civ} came with about {army}.',
    ],
    ground: [
      'The defences of {site} made each defender count for more.',
      '{site} was hard to take, and each of the {enemy} who held it counted for more.',
    ],
    leadersBoth: [
      '{attackerLead} led the {civ}, and {defenderLead} led the {enemy}.',
      'The {civ} followed {attackerLead}; the {enemy} followed {defenderLead}.',
    ],
    leadersOne: ['{lead} led the {side}.', 'The {side} were led by {lead}.'],
    champion: ['{name} {stand}, {outcome}.', 'Before the lines met, {name} {stand}, {outcome}.'],
    turnUpset: [
      'The {winner} had the fewer soldiers, and still won the day.',
      'The odds lay against the {winner}, who won all the same.',
    ],
    turnEven: [
      'It was a long, even fight, and neither side gave way for some time.',
      'The two forces were near equal, and the fight ran long before it was decided.',
    ],
    turnWeight: [
      'The weight of numbers told, and the {winner} won through.',
      'The larger force told in the end, and the {winner} carried the field.',
    ],
    ending: [
      'The {winner} held the field. {attackerLost} of the {civ} and {defenderLost} of the {enemy} fell.',
      'When it was done the {winner} held the field, and {attackerLost} of the {civ} and {defenderLost} of the {enemy} lay dead.',
    ],
    endingNamed: ['{names} died in the fight.', 'Among the dead: {names}.'],
    endingTaken: ['{site} was taken by the {civ}.', 'The {civ} took {site}.'],
    endingRazed: ['{site} was burned by the {civ}.', 'The {civ} burned {site}.'],
    // Beast fights.
    approachHunt: [
      '{name} went out alone against {beastKindEnd}.',
      '{name} set out from {site} to hunt {beastKindMid} alone.',
    ],
    approachTown: [
      '{beastKindMid} came against {site}, and about {fighters} of the {civ} stood to fight it.',
      'The people of {site} faced {beastKindMid} with about {fighters} fighters.',
    ],
    oddsLong: [
      'The odds were long: about {odds} in 100.',
      'It was a poor chance, about {odds} in 100.',
    ],
    oddsEven: [
      'It could have gone either way, about {odds} in 100.',
      'The chance was middling, about {odds} in 100.',
    ],
    oddsFavoured: [
      'The odds were in their favour, about {odds} in 100.',
      'It was a good chance, about {odds} in 100.',
    ],
    clashSlain: ['{name} killed {beast} in the fight.', 'In the clash {name} struck down {beast}.'],
    clashLost: ['{name} faced {beast}, {outcome}.', '{name} met {beast} in the fight, {outcome}.'],
    afterSlain: [
      '{beast} was dead, and the {civ} were rid of it.',
      'The {kind} was gone from the land of the {civ}.',
    ],
    afterLived: ['{beast} lived on.', 'The {kind} was not killed.'],
    afterDied: ['{name} was dead, and {beast} lived on.', '{beast} lived, and {name} did not.'],
  },
};
