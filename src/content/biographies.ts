// Biography wording and limits (M2.6). Summaries are filled from records only: a sentence is
// skipped when its facts are missing, never invented. Variants are chosen by entity id hash.

import type { BiographyRules } from '../engine';

export const BIOGRAPHIES: BiographyRules = {
  // Enough lines to tell a life without a wall of text; the first and last events always stay.
  maxLines: 12,
  roles: {
    ruler: 'ruler',
    kin: 'kinsman',
    founder: 'founder',
    hero: 'hero',
    captain: 'captain',
    raider: 'raider',
    crafter: 'craftsman',
    scholar: 'scholar',
    mage: 'mage',
    priest: 'high priest',
    prophet: 'prophet',
  },
  causes: {
    'old-age': 'of old age',
    famine: 'of hunger',
    disease: 'of sickness',
    battle: 'of wounds taken in battle',
    beast: 'by the claws of a beast',
    raid: 'in a raid',
    razing: 'when their home was razed',
    murder: 'by murder',
    exposure: 'of the cold',
    thirst: 'of thirst',
    wound: 'of a wound',
    illness: 'of a long illness',
    childbirth: 'in childbirth',
    execution: 'by the executioner',
    duel: 'in single combat with another legend',
    peril: 'in a perilous place',
  },
  sentences: {
    // Person
    personBorn: [
      '{name} was born in Year {born}{where}{parents}.',
      'Year {born} saw the birth of {name}{where}{parents}.',
    ],
    personRole: [
      '{He} stood as {title} of the {civ}{house}.',
      '{He} lived as {title} of the {civ}{house}.',
    ],
    personRoleAlone: ['{He} was known as {title}{house}.'],
    personFamily: ['{He} {family}.'],
    personMagic: ['{He} carried {tier} magic.'],
    // M3.9: an awakening; the tier is the one woken to.
    personWoke: ['{He} woke to {tier} magic on {date}, {how}.'],
    personBornBefore: ['{name} was born {ago} years before the first settlements{where}{parents}.'],
    personDied: ['{He} died in Year {died}, aged {age}, {cause}{killer}.'],
    personLiving: ['{He} is still living, aged {age}.'],
    // Site
    siteLive: ['{name} is a {kind} of the {civ}, founded in Year {founded}.'],
    siteFree: ['{name} is a {kind} held by no people, founded in Year {founded}.'],
    siteRuined: [
      '{name} was a {kind} of the {civ}, founded in Year {founded} and ruined in Year {ruined}.',
    ],
    siteRuinedFree: ['{name} was a {kind} founded in Year {founded} and ruined in Year {ruined}.'],
    sitePeak: ['At its peak {peak} people lived there.'],
    sitePop: ['At its peak {peak} people lived there; now {pop} do.'],
    siteRaces: ['Its people are {races}.'],
    siteNotables: ['{names} {verb} there.'],
    // Civ
    civLive: [
      'The {name} is a {race} {gov} of {culture} ways, founded in Year {founded} at {capital}.',
    ],
    civFell: [
      'The {name} was a {race} {gov} of {culture} ways, founded in Year {founded} at {capital}; it fell in Year {fell}.',
    ],
    civRulers: ['It has had {rulers} {rulerWord}, the latest being {ruler}.'],
    civRulersFell: ['It had {rulers} {rulerWord}.'],
    civSites: ['It holds {live} {placeWord} and has seen {wars} {warWord}.'],
    civWarsFell: ['It saw {wars} {warWord} in its time.'],
    // Beast, item, dynasty
    beastLive: ['{name}, a {kind}, has haunted the land since Year {born}.'],
    beastDead: ['{name}, a {kind}, haunted the land from Year {born} until Year {died}{slain}.'],
    beastKills: ['It killed {names}.', '{names} died fighting it.'],
    // A dragon (M5.6): its temper and lair, the tribute it took and the hoard it keeps or lost.
    dragonLair: ['It was {temper}, some {age} years old when it woke, and lay in {lair}.'],
    dragonLairLive: ['It is {temper}, was some {age} years old when it woke, and lies in {lair}.'],
    dragonTribute: ['It took tribute {times} from {towns}.'],
    dragonHoard: ['Its hoard holds {items}.'],
    dragonHoardTaken: ['{slayer} carried off its hoard: {items}.'],
    itemHeld: ['{name}, a {form}, was made in Year {made} and is held by {holder}.'],
    itemLost: ['{name}, a {form}, was made in Year {made} and is lost.'],
    dynasty: ['{Name} was founded in Year {founded} by {founder}{civ}.'],
  },
};
