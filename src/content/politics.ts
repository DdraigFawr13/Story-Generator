// Thin politics and trade at the watched site (M3.10): who leads, how the seat passes by each
// culture's succession rule, and the caravans that come along the site's real trade routes.

import type { EventTypeDef, PoliticsRules } from '../engine';

export const POLITICS: PoliticsRules = {
  // A village's own head, by the culture's government; the ruler leads the capital.
  leaderTitles: {
    chieftaincy: 'headman',
    jarldom: 'hersir',
    khanate: 'bey',
    'priest-kingdom': 'temple warden',
    'elder-council': 'speaker',
    thanedom: 'thane',
  },
  leaderTitle: 'headman',
  rulerTitle: 'ruler',
  // Between a craftsman and a healer (society.status.jobs), below a ruler's 45.
  standing: 30,
  succession: {
    // History's numbers (content/notables.ts): kin within 15 points are a contested choice.
    disputeMargin: 15,
    disputeChance: 0.5,
    disputeLuck: 20,
    // Enough to make the loser an enemy of the winner (social.labels: enemy at -50).
    loserOpinion: -55,
    peoplePhrase: 'by the choice of the people, with no kin to take the seat by custom',
  },
  caravans: {
    // One caravan a year from each of the two strongest partners: 1-2 a year at most sites.
    partners: 2,
    recentYears: 50,
    // Spring to autumn; nobody travels in winter.
    seasons: [0, 1, 2],
    stayDays: 3,
    waitDays: 7,
    // History trades the whole gap once a decade; a caravan carries a share of it in one visit.
    share: 0.25,
    keepYears: 1,
    carry: {
      food: ['grain'],
      ore: ['ore', 'stone'],
      timber: ['logs'],
      salt: ['salt'],
      luxury: ['wares'],
    },
    minItems: 5,
    newsImportance: 4,
    newsYears: 25,
  },
  events: {
    leaderNamed: 'site_leader_named',
    succeeded: 'site_leader_succeeded',
    disputed: 'site_succession_disputed',
    caravanArrived: 'site_caravan_arrived',
    caravanQuiet: 'site_caravan_quiet',
    caravanTraded: 'site_caravan_traded',
    caravanSold: 'site_caravan_sold',
    caravanBought: 'site_caravan_bought',
    caravanNothing: 'site_caravan_nothing',
    caravanWaits: 'site_caravan_waits',
  },
};

/** Leaders, successions and caravans. `{site}` is the watched site, `{from}` the caravan's home. */
export const POLITICS_EVENTS: EventTypeDef[] = [
  {
    id: 'site_leader_named',
    baseImportance: 2,
    title: '{actor} leads {site}',
    category: 'politics',
    links: { site: 'site' },
    templates: [
      '{actor} was {title} of {site}.',
      'At {site}, {actor} held the seat as {title}.',
      '{site} looked to {actor}, its {title}.',
    ],
  },
  {
    id: 'site_leader_succeeded',
    baseImportance: 6,
    title: '{actor} became {title} of {site}',
    causeWord: 'after',
    category: 'politics',
    links: { site: 'site' },
    templates: [
      '{actor} became {title} of {site} after {actor2}, {rule}.',
      'With {actor2} gone, {actor} took the seat at {site} as {title}, {rule}.',
      '{site} had a new {title}: {actor}, {rule}, in place of {actor2}.',
    ],
  },
  {
    id: 'site_succession_disputed',
    baseImportance: 6,
    title: '{actor} and {actor2} quarrelled over the seat',
    causeWord: 'after',
    category: 'politics',
    links: { site: 'site' },
    templates: [
      '{actor} and {actor2} both claimed the seat of {prior} at {site}; {winner} won it, and {loser} did not forgive it.',
      'The seat of {prior} at {site} was fought over by {actor} and {actor2}. {winner} took it; {loser} nursed the grudge.',
      'At {site}, {actor} and {actor2} quarrelled over who should follow {prior}. {winner} prevailed over {loser}.',
    ],
  },
  {
    id: 'site_caravan_arrived',
    baseImportance: 4,
    title: 'A caravan from {from} reached {site}',
    causeWord: 'with news of',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'A caravan from {from} reached {site}, and {actor} met it. The traders brought news of home: {news} ({ago}).',
      'Traders from {from} came up the road to {site} and were welcomed by {actor}. Their news from home: {news} ({ago}).',
      '{actor} greeted a caravan from {from} at {site}. Its people told of home: {news} ({ago}).',
    ],
  },
  {
    id: 'site_caravan_quiet',
    baseImportance: 3,
    title: 'A caravan from {from} reached {site}',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'A caravan from {from} reached {site}, and {actor} met it. All was quiet at {from}, the traders said.',
      'Traders from {from} came to {site} and were welcomed by {actor}. They had no great news from home.',
      '{actor} greeted a caravan from {from} at {site}; nothing much had happened at {from} of late.',
    ],
  },
  {
    id: 'site_caravan_traded',
    baseImportance: 3,
    title: '{site} traded with {from}',
    causeWord: 'during',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'The traders of {from} left {site} with {took}, and left behind {left}.',
      '{site} sent {took} home with the caravan from {from}, and kept {left} in return.',
      'The caravan from {from} went home with {took}, and {site} kept {left}.',
    ],
  },
  {
    id: 'site_caravan_sold',
    baseImportance: 2,
    title: '{site} sold to {from}',
    causeWord: 'during',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'The traders of {from} left {site} with {took}; {site} lacked nothing they had to give.',
      '{site} sent {took} home with the caravan from {from}, for the credit of the road.',
      'The caravan from {from} went home with {took} from {site}.',
    ],
  },
  {
    id: 'site_caravan_bought',
    baseImportance: 3,
    title: '{site} got {left} from {from}',
    causeWord: 'during',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'The caravan from {from} left {left} at {site}, and took nothing in return.',
      '{site} was the richer by {left} when the caravan from {from} went home.',
      'Traders from {from} left {site} {left} lighter, wanting nothing it had.',
    ],
  },
  {
    id: 'site_caravan_nothing',
    baseImportance: 2,
    title: 'The caravan from {from} left without trading',
    causeWord: 'during',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'The caravan from {from} left {site} with nothing traded: neither side had anything the other lacked.',
      '{site} and the traders of {from} found nothing to swap, and the caravan went home light.',
      'No goods changed hands when the caravan from {from} left {site}.',
    ],
  },
  {
    id: 'site_caravan_waits',
    baseImportance: 2,
    title: 'The caravan from {from} waited',
    category: 'politics',
    links: { site: 'site', from: 'site' },
    templates: [
      'Word of danger at {site} reached the caravan from {from}, and it waited on the road.',
      'The caravan from {from} held back from {site} until the danger had passed.',
      'Traders from {from} camped short of {site}, waiting for the trouble there to end.',
    ],
  },
];
