// Perilous places, hoards and expeditions (M4.7): the ruins, old delvings, barrows, empty lairs and
// aura places of the wild, and the companies that go into them for what was lost. Starting numbers;
// tune after a drama run. Danger is in soldier equivalents like a creature's (adults needed =
// danger * slayAdultsPerDanger).

import type { PlaceRules } from '../engine';

export const places: PlaceRules = {
  kinds: [
    {
      id: 'ruin',
      names: ['the ruins of {site}', 'the broken walls of {site}'],
      danger: [2, 8],
      finds: [1, 2],
      loreChance: 0.3,
      treasureChance: 0.4,
      guardians: ['wolves denning in the halls', 'robbers', 'the restless dead'],
    },
    {
      id: 'old-mine',
      names: ['the old delvings of {site}', 'the deep halls of {site}'],
      danger: [3, 12],
      finds: [1, 3],
      loreChance: 0.1,
      treasureChance: 0.55,
      guardians: ['the dark below', 'things that dwell in the deep', 'falls of old stone'],
    },
    {
      id: 'barrow',
      names: ['the Barrow of {name}', "{name}'s Howe", 'the Mound of {name}'],
      danger: [3, 10],
      finds: [0, 1],
      loreChance: 0.05,
      treasureChance: 0.6,
      guardians: ['the restless dead', 'barrow-wights'],
    },
    {
      id: 'lair',
      names: ['the empty den of {beast}', 'the old lair of {beast}'],
      danger: [2, 8],
      finds: [0, 1],
      loreChance: 0,
      treasureChance: 0.5,
      guardians: ["the beast's brood", 'bones and old fear'],
    },
    {
      id: 'aura',
      names: ['the {adj} Stones', 'the {adj} Well', 'the {adj} Grove', 'the {adj} Tor'],
      danger: [6, 24],
      finds: [1, 3],
      loreChance: 0.6,
      treasureChance: 0.2,
      guardians: ['the wild power of the place', 'spirits of the old wood', 'a madness on the air'],
      adjectives: [
        'Singing',
        'Weeping',
        'Burning',
        'Hollow',
        'Whispering',
        'Moonlit',
        'Blind',
        'Drowned',
        'Thorned',
        'Sleeping',
      ],
    },
  ],
  // A 256x256 map (65,536 cells) gets 10 of each: ruins, old delvings and aura places.
  ancientKinds: ['ruin', 'old-mine', 'aura'],
  cellsPerAncient: 6000,
  // Like a beast's lair: a fixed number of random cells per place, so the stream advances the same.
  ancientTries: 300,
  // Wild land: about two thirds of dry land reaches 50.
  ancientMinWildness: 50,
  placeSpacing: 6,
  // About 4% of dry land has this much aura (spots peak at 70-100).
  auraMin: 25,
  // No metal under it? High ground will do (a fifth of dry land stands over 900 m).
  mineElevation: 900,
  elderNames: [
    'Caer Lludd',
    'Din Emrys',
    'Dun Ailinne',
    'Llys Helig',
    'Caer Sidi',
    'Dinas Affaraon',
    'Caer Vedwyd',
    'Dun Cuillin',
    'Llys Arawn',
    'Caer Pedryfan',
    'Din Eidyn',
    'Dun Baedan',
    'Caer Wydyr',
    'Dinas Brân',
    'Caer Ochren',
    'Llys Ceridwen',
    'Dun Scaith',
    'Caer Rigor',
    'Din Tagell',
    'Dun Nechtain',
  ],
  // Every kind of site but the hamlet leaves a place; a ruined hold or mine is an old mine.
  ruinFrom: ['village', 'town', 'city', 'fortress', 'hold', 'mine', 'temple', 'port'],
  mineSiteKinds: ['hold', 'mine'],
  barrow: {
    // 25% at faith 10, 12.5% at faith 5.
    chance: 0.25,
    reach: [2, 6],
    tries: 8,
  },
  expedition: {
    // 2% a year for a civ whose war + wealth + learning come to 15.
    chance: 0.02,
    range: 40,
    restYears: 15,
    bountyYears: 20,
    // 5% of the site's adults, at least 6 and at most 30; a site needs 18 adults.
    partyShare: 0.05,
    partyMin: 6,
    partyMax: 30,
    successBase: 0.6,
    successMax: 0.9,
    failLoss: 0.3,
    winLoss: 0.05,
    commonerMaxDanger: 8,
    // A noble of the ruling kin leads half the time; otherwise the commoners go on their own.
    bandChance: 0.5,
    bountyWeight: 3,
    barrowGrievance: 2,
    // Half of the robbed barrows wake their dead.
    wakeDeadChance: 0.5,
    restlessDeadId: 'restless-dead',
    bandWord: 'a band of commoners',
    commonerRole: ', a commoner of {site},',
    companyLed: ' with {party} companions',
    companyBand: ', {party} strong',
    whyPlace: 'where {guardians} keep what was lost',
    whyBounty: 'to answer the raids on {site}',
    lossPhrase: ', though {dead} did not come back',
    emptiedPhrase: '. Nothing more lies there',
    outcomes: { driven: 'was driven back', lost: 'did not come home' },
    treasureNames: [
      'the {Epithet} {Form} of Old',
      'the {Epithet} {Form} of the Elder Days',
      'the {Epithet} {Form} of the First Kings',
    ],
    loreNames: ['the Lost {Form}', 'the {Form} of the Hidden Years', 'the Elder {Form}'],
  },
  parts: {
    // A dragon (700) brings 35 luxury home, a great boar (40) brings 2.
    luxuryPerDanger: 0.05,
    craftChance: 0.35,
    items: [
      { form: 'cloak', name: 'the {Beast}-hide Cloak' },
      { form: 'horn', name: 'the Horn of {beast}' },
      { form: 'bow', name: 'the {Beast}-bone Bow' },
      { form: 'mail', name: 'the Scale-mail of {beast}' },
    ],
  },
  // One raid in four by a great beast takes an artifact from the raided town.
  raidCarryOff: 0.25,
};
