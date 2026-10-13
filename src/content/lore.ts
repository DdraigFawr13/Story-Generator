// Light magic and lore at the watched site (M3.9): common cantrips taught by a parent, the
// hedge-witch or a book (R-28), books lent and lost, and the race dependencies that act at the site
// (R-29). The engine in engine/site/lore.ts reads only these tables.

import type { EventTypeDef, LoreRules, MemoryDef } from '../engine';

export const LORE: LoreRules = {
  cantrips: ['kindle', 'mend', 'soothe', 'read_sky', 'read_rain'],
  // Most grown people with a spark were taught something before watching began; some never were.
  knownAtEmbark: 0.7,
  // About six weeks of evenings for a pupil of average learning attributes.
  lessons: 40,
  // Lessons start at seven, as an apprenticeship would.
  minAge: 7,
  // Apprentices: up to about 24 for humans (maturity 16); older people learn only from books.
  pupilUpTo: 1.5,
  readMinIntellect: 9,
  // The village hedge-witch is Gifted (§5.4A): a Faint person teaches only their own children.
  hedgeWitchMinPower: 3,
  books: {
    lendEveryDays: 7,
    maxLoanDays: 84,
    // About one loan in ten never comes back.
    lossPerDay: 0.0015,
    minOpinion: 0,
    burnChance: 0.5,
    lostSting: -20,
  },
  effects: {
    warmthShare: 0.5,
    // Half a day's wear (a building loses 1/30 of a point a day): a mender's home wears at half speed.
    mendPerUse: 0.0167,
    // Half a herb-healer: at most doubles natural recovery (§5.4A).
    soothePower: 0.5,
    frostShare: 0.4,
  },
  castRest: 5,
  dependencies: {
    // settlement.capacity.raceAura uses 22 as the Tylwyth's reference aura.
    aura: { races: ['tylwyth'], below: 22, memory: 'far-from-aura' },
    ore: { races: ['dvergar'], days: 14, jobs: ['mine', 'quarry'], memory: 'no-ore-work' },
  },
  events: {
    learned: 'site_cantrip_learned',
    hedgeWitch: 'site_hedge_witch',
    lent: 'site_book_lent',
    returned: 'site_book_returned',
    lost: 'site_book_lost',
    burned: 'site_book_burned',
    awakened: 'site_awakened',
    frostRead: 'site_frost_read',
  },
  memoryOf: {
    learned: 'learned-cantrip',
    taught: 'taught-cantrip',
    bookLost: 'book-lost',
    awakened: 'awakened',
  },
};

export const LORE_MEMORIES: MemoryDef[] = [
  { id: 'learned-cantrip', mood: 8, decayDays: 28, text: 'Learned a cantrip' },
  { id: 'taught-cantrip', mood: 4, decayDays: 14, text: 'Taught {about} a cantrip' },
  { id: 'book-lost', mood: -8, decayDays: 56, text: '{about} lost a lent book' },
  { id: 'awakened', mood: 15, decayDays: 112, text: 'Woke to the magic' },
  // Refreshed each day the dependency is unmet, so they fade soon after it is met.
  {
    id: 'far-from-aura',
    mood: -8,
    decayDays: 3,
    text: 'Far from the old places: the land is thin',
  },
  { id: 'no-ore-work', mood: -6, decayDays: 3, text: 'No ore or stone worked for two weeks' },
];

/** Events of lessons, books and awakenings. `{actor}` is the person, `{site}` the watched site. */
export const LORE_EVENTS: EventTypeDef[] = [
  {
    id: 'site_cantrip_learned',
    baseImportance: 2,
    title: '{actor} learned {ability}',
    causeWord: 'after',
    category: 'magic',
    rollup: ['cantrip learned', 'cantrips learned'],
    links: { site: 'site' },
    templates: [
      '{actor} of {site} learned the cantrip {ability} {source}.',
      'After weeks of lessons {source}, {actor} knew {ability}.',
      'At {site}, {actor} learned {ability} {source}.',
    ],
  },
  {
    id: 'site_hedge_witch',
    baseImportance: 3,
    title: '{actor} became the hedge-witch of {site}',
    category: 'magic',
    links: { site: 'site' },
    templates: [
      '{actor} became the hedge-witch of {site}, and the gifted came to learn.',
      'The gifted of {site} now go to {actor} for their lessons.',
      'With {actor} as its hedge-witch, {site} kept its cantrips alive.',
    ],
  },
  {
    id: 'site_book_lent',
    dataKeys: ['site'],
    baseImportance: 2,
    title: '{actor} lent {item}',
    category: 'magic',
    links: { site: 'site', item: 'item' },
    templates: [
      '{actor} lent {item} to {actor2}, who has the spark to learn from it.',
      'At {site}, {actor2} borrowed {item} from {actor}.',
      '{actor} gave {item} into the hands of {actor2} for a season of reading.',
    ],
  },
  {
    id: 'site_book_returned',
    dataKeys: ['site'],
    baseImportance: 1,
    title: '{item} came back to {actor}',
    category: 'magic',
    rollup: ['book returned', 'books returned'],
    links: { site: 'site', item: 'item' },
    templates: [
      '{actor2} gave {item} back to {actor}.',
      '{item} came home to {actor} from {actor2}.',
      'At {site}, {actor2} returned {item} to {actor}.',
    ],
  },
  {
    id: 'site_book_lost',
    baseImportance: 4,
    title: '{item} was lost',
    causeWord: 'after',
    category: 'magic',
    links: { site: 'site', item: 'item' },
    templates: [
      '{actor2} lost {item}, lent by {actor}; what it taught is gone from {site}.',
      '{item}, borrowed from {actor}, was lost by {actor2}.',
      '{actor} will not see {item} again: {actor2} lost it.',
    ],
  },
  {
    id: 'site_book_burned',
    dataKeys: ['site'],
    baseImportance: 4,
    title: '{item} burned',
    causeWord: 'in',
    category: 'magic',
    links: { site: 'site', item: 'item' },
    templates: [
      '{item} burned with the home of {actor}.',
      'The fire at {site} took {item}, kept by {actor}.',
      "{actor}'s {item} went up with the house.",
    ],
  },
  {
    id: 'site_awakened',
    baseImportance: 6,
    title: '{actor} woke to the magic',
    causeWord: 'after',
    category: 'magic',
    links: { site: 'site', item: 'item' },
    templates: [
      '{actor} of {site} woke to the magic {how}, and is {tier} now.',
      '{actor} rose a tier {how}: {tier} now.',
      'At {site}, {actor} rose to {tier} {how}.',
    ],
  },
  {
    id: 'site_frost_read',
    baseImportance: 2,
    title: '{actor} read a frost coming',
    category: 'magic',
    rollup: ['frost read', 'frosts read'],
    links: { site: 'site' },
    templates: [
      '{actor} read a frost in the {sign}; the young crops of {site} were covered before dark.',
      'Warned by {actor}, the farmers of {site} covered the fields against the frost.',
      'The frost came to {site} as {actor} said it would, and found the crops covered.',
    ],
  },
];
