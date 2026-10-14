// Named battles (M4.8): a battle takes the name of the pass, ford or town it was fought at.
import type { BattleRules } from '../engine';

export const BATTLES: BattleRules = {
  name: 'the Battle of {place}',
  repeatName: 'the {ordinal} Battle of {place}',
  // Index 0 is the first battle at a place; from the eleventh the engine writes "11th".
  ordinals: [
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
  ],
  // A pass or ford within 2 cells of the field names the battle.
  placeRadius: 2,
  // The 12 deadliest battles of a world, and any that killed a legend, are great (map marker, playback caption).
  greatCount: 12,
};
