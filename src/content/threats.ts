// Threats at the watched site (M3.8): wild prowlers, beasts out of their lairs and raiders from a
// civ with a grievance. The engine in engine/site/threats.ts reads only these tables. Danger is in
// soldier equivalents (R-24); the round caps keep one block's harm inside the tier caps.

import type { EventTypeDef, MemoryDef, ThreatRules } from '../engine';

export const THREATS: ThreatRules = {
  prowlers: {
    // Attacks a year at wildness 100 for the site's cell: a wild cell sees about three.
    perYear: 3,
    // Only someone working this far from the green is out of earshot.
    from: 12,
    // Half of the fights a worker wins end with the animal dead and eaten.
    killShare: 0.5,
    // Hunters, foragers, fishers and woodcutters.
    workplaces: ['wild', 'herbs', 'water', 'trees'],
    kinds: [
      {
        id: 'wolf',
        name: 'wolf',
        glyph: 'w',
        danger: 1.5,
        biomes: ['temperate-forest', 'taiga', 'tundra', 'steppe', 'grassland'],
        meat: 6,
      },
      {
        id: 'bear',
        name: 'bear',
        glyph: 'b',
        danger: 3,
        biomes: ['temperate-forest', 'taiga', 'alpine'],
        meat: 14,
      },
      {
        id: 'boar',
        name: 'boar',
        glyph: 'B',
        danger: 1,
        biomes: ['temperate-forest', 'jungle', 'grassland'],
        meat: 10,
      },
      {
        id: 'big-cat',
        name: 'big cat',
        glyph: 'c',
        danger: 2,
        biomes: ['jungle', 'savanna', 'desert'],
        meat: 5,
      },
    ],
  },
  beasts: {
    // A great or legendary beast is seen 3-6 days ahead; a wolf pack or bear is not.
    warnDays: [3, 6],
    signs: {
      twrch: [
        'the woods to the {dir} were rooted up',
        'a boar of unheard size was seen at the edge of the {dir} woods',
        'a farmer found his field turned over in a night, with tusk-marks as deep as a spade',
      ],
      afanc: [
        'the mere to the {dir} ran red',
        'the fishers came home with empty nets and a tale of something huge in the water to the {dir}',
        'the water by {site} rose and fell with no wind',
      ],
      wyvern: [
        'sheep were taken from the high pasture to the {dir}',
        'a shadow with wings crossed the hills to the {dir}',
        'a shepherd swore a red serpent flew over the {dir} ridge',
      ],
      giant: [
        'stones the size of a cart rolled down from the {dir}',
        'great footprints were found in the mud to the {dir}',
        'the ground shook in the night, from the {dir}',
      ],
      draig: [
        'smoke was seen over the hills to the {dir}',
        'a herd was found burnt to the bone',
        'the sky to the {dir} glowed red at dusk',
      ],
      'restless-dead': [
        'cold lights were seen moving on the barrow-downs to the {dir}',
        'the dogs of {site} howled at the {dir} all night and would not be called off',
        'a shepherd came home from the {dir} hills grey-haired and silent',
      ],
      'ceffyl-dwr': [
        'a pale horse was seen standing in the water to the {dir}',
        'the ponies of {site} would not go near the water',
        'a child was heard singing by the {dir} shore, and none could find her',
      ],
    },
    glyphs: {
      'wolf-pack': 'w',
      'cave-bear': 'b',
      twrch: 'B',
      afanc: 'A',
      wyvern: 'W',
      giant: 'G',
      draig: 'D',
      'restless-dead': 'R',
      'ceffyl-dwr': 'H',
    },
    // A beast does not return for a third of a year.
    cooldownDays: 112,
    // 1 = the history rate (a raid chance a year spread over its days), as M3.5 matched history.
    chanceMul: 1,
    fireBreath: ['draig', 'wyvern'],
    // A beast eats about a month of the site's food, not its whole winter.
    mealCapDays: 28,
    wild: 'the wild to the {dir}',
    lair: ', out of its lair in {place}',
  },
  raids: {
    minGrievance: 0.5,
    reach: 60,
    // Chance a year at war value 10 and a grievance of 1 or more (history civRaidChance); war 8 and 0.8 gives 0.38.
    perYear: 0.6,
    cooldownDays: 168,
    bandShare: 0.25,
    band: [4, 30],
    // A third of the site's adults at most, so a hamlet faces a band it can stand against.
    targetShare: 0.34,
    // Every band is seen on the road the day before.
    warnChance: 1,
    warning: 'riders were seen on the road from {from}',
    retreatAt: 0.34,
    lootShare: 0.4,
    perHead: 1,
    glyph: 'r',
  },
  combat: {
    hitPerSoldier: 0.2,
    woundShares: { 'minor-wound': 50, 'serious-wound': 35, 'critical-wound': 15 },
    slainShare: { beast: 0.1, great: 0.35, legendary: 0.6, raid: 0.15 },
    roundCap: { beast: 2, great: 5, legendary: 10, raid: 4 },
    // A tired fighter is worth 0.6 of a rested one.
    fatigueBase: 0.6,
    wallBonus: 1.5,
    // A sword (combat 2) makes a defender worth one more soldier.
    weaponMul: 0.5,
    // Twice the attackers' strength: 12 raiders bring out about 24 soldiers' worth, a great beast everyone.
    militiaOdds: 2,
    militiaMin: 3,
    // About 30 tiles of grass: the attackers take two or three blocks from the edge to the stores.
    advance: 60,
    engageRange: 3,
    defendRest: 15,
    maxRounds: 4,
    leavesAt: 0.5,
  },
  flight: {
    fleeBelow: 0.5,
    // The people decide the day before it comes, so the sign is seen with everyone still at home.
    judgeDaysAhead: 1,
    returnAfterDays: 1,
    ravageBlocks: 2,
    strike: 12,
  },
  walls: {
    segments: 8,
    ringPad: 3,
    maxRing: 24,
    building: 'wall',
  },
  death: { word: 'wounds dealt by {name}', span: 'a hard fight' },
  compass: [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ],
  // About a year between beasts and raids at one site; prowlers are not counted.
  quietDays: 336,
  // First seen ten tiles out from the last houses on their side, not at the map's edge.
  approach: 10,
  memoryOf: { foughtOff: 'fought-off', fearRaid: 'fear-attack' },
  events: {
    prowler: 'site_prowler',
    prowlerDriven: 'site_prowler_driven',
    prowlerKilled: 'site_prowler_killed',
    sign: 'site_threat_sign',
    flight: 'site_flight',
    flightReturned: 'site_flight_returned',
    beastArrived: 'site_beast_arrived',
    beastCameEmpty: 'site_beast_came_empty',
    raidArrived: 'site_raid_arrived',
    beastSlain: 'site_beast_slain',
    beastDrivenOff: 'site_beast_driven_off',
    beastRavaged: 'site_beast_ravaged',
    raidersRepelled: 'site_raiders_repelled',
    raidLooted: 'site_raid_looted',
    fell: 'site_fell',
  },
};

export const THREAT_MEMORIES: MemoryDef[] = [
  { id: 'fought-off', mood: 12, decayDays: 28, text: 'Stood against the attackers' },
  { id: 'fear-attack', mood: -14, decayDays: 28, text: 'Lived through an attack' },
];

/** Events of prowlers, signs, beasts, raiders and flight. `{site}` is the watched site. */
export const THREAT_EVENTS: EventTypeDef[] = [
  {
    id: 'site_prowler',
    baseImportance: 3,
    title: '{actor} mauled by a {animal}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site' },
    templates: [
      'A {animal} came out of the wild at {site} and mauled {actor}, who was working far from the green.',
      'Far from the houses of {site}, {actor} was caught alone by a {animal}.',
      '{actor} met a {animal} on the edge of {site} and came off the worse for it.',
    ],
  },
  {
    id: 'site_prowler_driven',
    baseImportance: 2,
    title: '{actor} drove off a {animal}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site' },
    templates: [
      '{actor} drove off a {animal} at the edge of {site}.',
      'A {animal} came for {actor} far from {site}, and was beaten back.',
      '{actor} stood against a {animal} at {site} and it slunk away.',
    ],
  },
  {
    id: 'site_prowler_killed',
    baseImportance: 3,
    title: '{actor} killed a {animal}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site' },
    templates: [
      '{actor} killed a {animal} at the edge of {site}, and the meat went to the stores.',
      'A {animal} fell to {actor} far from {site}; it fed the village.',
      '{actor} slew a {animal} at {site} and carried the meat home.',
    ],
  },
  {
    id: 'site_threat_sign',
    baseImportance: 5,
    title: 'Signs of {threat}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site' },
    templates: [
      'At {site}, word came that {sign}. Folk spoke of {threat}{whence}.',
      'Near {site}, {sign}. The people feared {threat}{whence}.',
      'It was said at {site} that {sign}, and none slept easy for fear of {threat}{whence}.',
    ],
  },
  {
    id: 'site_flight',
    baseImportance: 6,
    title: 'Everyone fled {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', refuge: 'site' },
    templates: [
      'The people of {site} judged {threat} too strong to meet and set out for {refuge}.',
      'Leaving their homes at {site}, the people made for {refuge}, afraid of {threat}.',
      'Before {threat}, the folk of {site} took what they could carry and went toward {refuge}.',
    ],
  },
  {
    id: 'site_flight_returned',
    baseImportance: 4,
    title: 'The people came home to {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', refuge: 'site' },
    templates: [
      'The danger had passed, and the people came back to {site} from {refuge}.',
      'From {refuge} the folk of {site} returned to their homes.',
      'The people of {site} came home from {refuge}.',
    ],
  },
  {
    id: 'site_beast_arrived',
    baseImportance: 7,
    title: '{beast} came to {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', beast: 'beast' },
    templates: [
      '{beast} came down on {site} from the {dir}{whence}.',
      'At {site}, the watch saw {beast} coming in from the {dir}{whence}.',
      '{beast} came out of the {dir} toward {site}{whence}.',
    ],
  },
  {
    id: 'site_beast_came_empty',
    baseImportance: 7,
    title: '{beast} came to an empty {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', beast: 'beast' },
    templates: [
      '{beast} came to an empty {site} and made for the stores.',
      'With its people gone, {site} lay open, and {beast} came in.',
      '{beast} found the houses of {site} empty and went straight to the stores.',
    ],
  },
  {
    id: 'site_raid_arrived',
    baseImportance: 7,
    title: 'Raiders from {from} came to {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', from: 'site', civ: 'civ' },
    templates: [
      '{count} raiders from {from} came to {site}, for the {civ} had not forgotten its grievance.',
      'Riders of the {civ}, {count} of them from {from}, came on {site} to settle an old grievance.',
      'A band of {count} out of {from} fell upon {site}, for the {civ} held a grudge against it.',
    ],
  },
  {
    id: 'site_beast_slain',
    baseImportance: 8,
    title: '{actor} slew {beast}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', beast: 'beast' },
    templates: [
      '{actor} slew {beast} at the edge of the fields.',
      '{beast} fell to the blows of {actor} and the men and women beside them.',
      '{beast} came and did not leave: {actor} struck it down.',
    ],
  },
  {
    id: 'site_beast_driven_off',
    baseImportance: 6,
    title: '{beast} driven off',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', beast: 'beast' },
    templates: [
      'The people of {site} drove {beast} off, back to the wild.',
      'Hurt by the people of {site}, {beast} turned and fled to the wild.',
      'The people of {site} beat back {beast}, which returned to its lair.',
    ],
  },
  {
    id: 'site_beast_ravaged',
    baseImportance: 7,
    title: '{beast} ravaged {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', beast: 'beast' },
    templates: [
      '{beast} found {site} empty and ravaged it, taking {meals} meals from the stores.',
      'With none to stop it, {beast} tore through {site} and carried off {meals} meals.',
      '{beast} stayed at {site} and ate its fill: {meals} meals were lost.',
    ],
  },
  {
    id: 'site_raiders_repelled',
    baseImportance: 6,
    title: 'Raiders from {from} beaten off',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', from: 'site' },
    templates: [
      'The people of {site} beat back the raiders from {from}; {down} of them were struck down.',
      'The raiders from {from} lost {down} of their number and turned back from {site}.',
      '{site} held: {down} raiders from {from} fell, and the rest fled.',
    ],
  },
  {
    id: 'site_raid_looted',
    baseImportance: 6,
    title: 'Raiders from {from} looted {site}',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site', from: 'site' },
    templates: [
      'The raiders from {from} carried off {meals} meals from the stores of {site}.',
      'They reached the stores of {site}, and {meals} meals went back with the raiders to {from}.',
      'At {site}, the raiders from {from} took {meals} meals and were gone.',
    ],
  },
  {
    id: 'site_fell',
    baseImportance: 9,
    title: '{site} fell',
    causeWord: 'because of',
    category: 'threat',
    links: { site: 'site' },
    templates: [
      '{site} fell: no one was left to keep it.',
      'The people of {site} were dead or scattered, and the place was given up to the wild.',
      'The last of {site} was gone, and the place stood empty.',
    ],
  },
];
