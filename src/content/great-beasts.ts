// Great beasts as individuals: the boar, afanc, wyvern, giant and water horse each get a given
// name, a temper and a lair name, and some take tolls or hold grudges. The restless dead are named
// for the ruler whose barrow was robbed. Danger, raids, roaming and lifespan stay in creatures.ts.

import type { GreatBeastRules } from '../engine';

export const greatBeasts: GreatBeastRules = {
  kinds: [
    {
      creatureId: 'twrch',
      names: ['Trwyth', 'Ysgithyr', 'Gwrgi', 'Cyrn', 'Bleiddig', 'Mochyn', 'Grugyn', 'Llwydog'],
      tempers: [
        { id: 'savage', weight: 3 },
        { id: 'vengeful', weight: 2 },
      ],
      lairNames: ["{name}'s Wallow", 'the Thicket of {name}', "{name}'s Holt"],
      tollWord: 'swine',
    },
    {
      creatureId: 'afanc',
      names: ['Llyngwyn', 'Pwll', 'Gorwyn', 'Dyfrdwy', 'Hafren', 'Llynog', 'Mawnog', 'Aberllyn'],
      tempers: [
        { id: 'savage', weight: 2 },
        { id: 'vengeful', weight: 3 },
      ],
      lairNames: ["{name}'s Mere", 'the Pool of {name}', "{name}'s Deep"],
      tollWord: 'a tithe of the catch',
    },
    {
      creatureId: 'wyvern',
      names: [
        'Gwiberog',
        'Cochwen',
        'Adain',
        'Fflamgoch',
        'Creigiog',
        'Crafanc',
        'Cynffon',
        'Rhuddur',
      ],
      tempers: [
        { id: 'toll', weight: 4 },
        { id: 'savage', weight: 2 },
        { id: 'vengeful', weight: 3 },
      ],
      lairNames: ["{name}'s Crag", 'the Perch of {name}', "{name}'s Eyrie"],
      tollWord: 'sheep',
    },
    {
      creatureId: 'giant',
      names: [
        'Ysbaddaden',
        'Rhitta',
        'Idris',
        'Cribog',
        'Gogfran',
        'Wrnach',
        'Dillus',
        'Cadarn',
        'Talog',
        'Mawrth',
      ],
      tempers: [
        { id: 'toll', weight: 4 },
        { id: 'savage', weight: 2 },
        { id: 'vengeful', weight: 3 },
      ],
      lairNames: ["{name}'s Seat", 'the Stair of {name}', "{name}'s Cairn"],
      tollWord: 'cattle',
    },
    {
      creatureId: 'ceffyl-dwr',
      names: ['Llwyd', 'Nodwydd', 'Gwynfor', 'Eigiau', 'Tarddell', 'Gwyllion', 'Dwrgi', 'Llifon'],
      tempers: [
        { id: 'toll', weight: 4 },
        { id: 'savage', weight: 2 },
        { id: 'vengeful', weight: 3 },
      ],
      lairNames: ["{name}'s Water", 'the Ford of {name}', "{name}'s Shallows"],
      tollWord: 'horses',
    },
  ],
  tempers: [
    // Raids twice as often as its kind does.
    { id: 'savage', epithet: 'the Savage', word: 'a savage one', raidFactor: 1.5 },
    {
      id: 'vengeful',
      epithet: 'the Unforgiving',
      word: 'one that never forgot a wrong',
      raidFactor: 1,
      grudge: true,
    },
    { id: 'toll', epithet: 'the Toll-Taker', word: 'a taker of tolls', raidFactor: 1, toll: true },
  ],
  // A vengeful beast remembers a town that fought it for 20 years...
  grudgeYears: 20,
  // ...goes up to twice its raid range to strike it...
  grudgeRangeFactor: 1.5,
  // ...and raids twice as often while the grudge holds.
  grudgeRaidFactor: 1,
  // A town pays a quarter of its food stores.
  tollShare: 0.15,
  // Seven times in ten a town pays; otherwise the beast raids as usual.
  tollPaid: 0.7,
  tollAgain: ', for the {nth} time',
  // A named great beast's slaying outranks a common beast's by 2.
  slainImportance: 2,
  restless: {
    names: ['{ruler} the Unquiet', '{ruler} of the Barrow', 'the Unquiet {ruler}'],
    // It walks 6 cells a year toward the robbers' nearest town within 40 cells.
    walk: 6,
    vengeanceRange: 40,
    // Raiding twice as often while a robber town draws it.
    vengeanceFactor: 2,
    // A town keeping a faith within 20 cells may lay it to rest, 8 years in 100.
    layRange: 20,
    layChance: 0.08,
    fallenPhrase: 'with the {civ} fallen',
    unknownRuler: 'the one buried there',
  },
};
