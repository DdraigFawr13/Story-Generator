// Evening interactions, opinions, grudges and revenge at the watched site (M3.6). The engine in
// engine/site/social.ts reads only these tables; every number here is a tunable.

import type { EventTypeDef, InteractionDef, SocialRules } from '../engine';

export const INTERACTIONS: InteractionDef[] = [
  // Plain talk is most of what people do together.
  { id: 'chat', name: 'chat', weight: 10, opinion: [2, 2] },
  { id: 'joke', name: 'joke', weight: 5, opinion: [3, 3], traitWeights: { cheerful: 2 } },
  // A favour warms the one helped more than the helper.
  {
    id: 'help',
    name: 'help',
    weight: 3,
    opinion: [5, 2],
    memory: { target: 'helped' },
  },
  {
    id: 'argue',
    name: 'argue',
    weight: 3,
    opinion: [-4, -4],
    traitWeights: { 'hot-tempered': 2 },
    moodWeight: 2,
  },
  // Only the unfriendly or the sour-tempered insult; a grudge starts in a target already at -25.
  // Tuned so a town of 150 sees one or two feuds a year (Morgan chose "More feuds", 2026-10-13).
  {
    id: 'insult',
    name: 'insult',
    weight: 2.5,
    opinion: [-12, -3],
    needsOpinionBelow: 0,
    orBadMood: true,
    traitWeights: { 'hot-tempered': 2 },
    moodWeight: 2,
    memory: { target: 'insulted' },
    grudgeIfOpinionBelow: -25,
  },
  // Between eligible pairs who already like each other (family.ts decides the outcome).
  {
    id: 'flirt',
    name: 'flirt',
    weight: 8,
    opinion: [0, 0],
    needsOpinionAbove: 20,
    adultsOnly: true,
    courtship: true,
  },
];

export const SOCIAL: SocialRules = {
  // One or two when they start talk; sociable people one more, solitary one fewer.
  perDay: [1, 2],
  // Each resident starts talk on one evening in two (the cost of a site day stays low).
  startEvery: 2,
  traitShift: { sociable: 1, solitary: -1 },
  // Whoever shares the building this evening is likeliest; then the day's work-mates, a child's
  // nearest neighbours, and last anyone passing on the green. The unwed also seek out each other.
  pools: { building: 5, job: 3, neighbour: 4, green: 1, suitor: 3 },
  // Pools can hold dozens; two sampled names are enough to pick from.
  sample: 2,
  neighbourHomes: 3,
  friendWeight: 2,
  // The unmarried look for each other: eight times as likely to be picked.
  suitorWeight: 8,
  labels: {
    friend: { at: 40, drop: 25 },
    rival: { at: -25, drop: -10 },
    enemy: { at: -50, drop: -30 },
  },
  // Seeing a theft or a rage counts against the one who did it.
  witnessed: { 'saw-theft': -15, 'saw-tantrum': -5 },
  drift: { by: 2, forgetBelow: 2 },
  grudge: {
    // About one meeting in 25 for someone who holds honour at 5 of 10.
    revengeChance: 0.04,
    hotTrait: 'hot-tempered',
    hotMul: 2,
    acts: [
      { id: 'shame', weight: 3, phrase: 'a shaming before the household' },
      { id: 'spoil', weight: 3, phrase: 'spoiled work' },
      { id: 'tale', weight: 2, phrase: 'a tale spread about them' },
    ],
    targetOpinion: -20,
    // Revenge is sweet: the avenger thinks 25 better of them afterwards, so a feud burns out.
    satisfaction: 25,
    memoryOf: { humiliated: 'humiliated', vengeance: 'vengeance-taken' },
    // Two months before a grudge may soften; the chance doubles after a year.
    forgiveAfterDays: 56,
    forgiveBase: 0.12,
    forgiveDoubleDays: 336,
    forgiveTraits: ['cheerful', 'steady'],
    kinMul: 1.5,
    forgivenOpinion: -10,
  },
  events: {
    enmity: 'site_enmity',
    lovers: 'site_lovers',
    revenge: 'site_revenge',
    forgave: 'site_forgave',
  },
};

/** Events of relationships. No chat, friendship or rivalry gets a line: they show in the inspector. */
export const SOCIAL_EVENTS: EventTypeDef[] = [
  {
    id: 'site_enmity',
    baseImportance: 2,
    title: '{actor} and {actor2} became enemies',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} came to count {actor2} an enemy at {site}.',
      'At {site}, bad blood set between {actor} and {actor2}, and {actor} would not let it go.',
      'Whatever lay between {actor} and {actor2} soured into open enmity.',
    ],
  },
  {
    id: 'site_lovers',
    baseImportance: 2,
    title: '{actor} and {actor2} became lovers',
    causeWord: 'after',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} and {actor2} became lovers at {site}.',
      'At {site}, {actor} and {actor2} were seen walking out together, and no longer hid it.',
      'After a season of glances, {actor} and {actor2} took each other as sweethearts.',
    ],
  },
  {
    id: 'site_revenge',
    baseImportance: 3,
    title: '{actor} took revenge on {actor2}',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} paid {actor2} back at {site} for an old wrong: {act}.',
      'At {site}, {actor} took their revenge on {actor2} with {act}.',
      '{actor} had not forgotten the wrong {actor2} did them; it came back as {act}.',
    ],
  },
  {
    id: 'site_forgave',
    baseImportance: 2,
    title: '{actor} forgave {actor2}',
    causeWord: 'after',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} forgave {actor2} at {site} and let the old grudge go.',
      'After long months, {actor} put aside the grudge against {actor2}.',
      'At {site}, {actor} and {actor2} made their peace.',
    ],
  },
];
