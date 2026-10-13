// Family at the watched site (M3.6): courtship, marriage by custom, births, households forming,
// grief, inheritance and orphans. The engine in engine/site/family.ts reads only these tables.

import type { EventTypeDef, FamilyRules, MemoryDef } from '../engine';

export const FAMILY: FamilyRules = {
  court: {
    // Eight years apart at the reference lifespan (70), scaled to the race's lifespan.
    ageGap: 8,
    // A flirt lands with (their opinion of you + 30) / 100, never under 5% nor over 80%.
    successShift: 30,
    successMin: 0.05,
    successMax: 0.8,
    successOpinion: 8,
    failOpinion: -3,
    // Both at 60 and they are lovers.
    loversAt: 60,
    // Two months as lovers, then half marry each month.
    courtDays: 56,
    marryChance: 0.5,
    // Half a year of mourning before courting again.
    remarryAfterDays: 168,
    rejectedMemory: 'rejected',
  },
  arranged: {
    // A match is arranged two years after coming of age, a quarter of eligible members each month,
    // between people who do not dislike each other.
    afterYears: 2,
    chance: 0.25,
    minOpinionSum: -10,
  },
  maxSpouses: 3,
  residence: 'groom',
  gifts: {
    none: 'no gift passed between the families',
    'bride-price': 'a bride-price was paid',
    dowry: 'a dowry went with the bride',
  },
  how: { arranged: 'an arranged match', love: 'a match made for love' },
  births: {
    // Fertile until 60% of the lifespan (history's elders are 70%+).
    fertileUntil: 0.6,
    // Nine months of 28 days.
    pregnancyDays: 252,
    maxPerWife: 0.45,
  },
  inheritance: {
    'eldest-son': 'Among their people the eldest son comes first.',
    'sons-temple-tithe': 'Among their people sons inherit, once the temple has its tithe.',
    'eldest-child': 'Among their people the eldest child comes first.',
    'all-children': 'Among their people the hearth belongs to all the children.',
    'youngest-keeps-hearth': 'Among their people the youngest keeps the hearth.',
    'best-apprentice': 'Among their people the ablest takes up the work.',
  },
  memoryOf: {
    married: 'married',
    childBorn: 'child-born',
    cameOfAge: 'came-of-age',
    lostSpouse: 'lost-spouse',
    lostChild: 'lost-child',
    lostParent: 'lost-parent',
    lostSibling: 'lost-sibling',
    lostFriend: 'lost-friend',
    outlivedEnemy: 'outlived-enemy',
  },
  events: {
    married: 'site_married',
    birth: 'site_birth',
    cameOfAge: 'site_came_of_age',
    householdFormed: 'site_household_formed',
    inherited: 'site_inherited',
    orphanTakenIn: 'site_orphan_taken_in',
  },
};

/** Feelings of family life and of the people one deals with. Grief is graded by tie. */
export const FAMILY_MEMORIES: MemoryDef[] = [
  { id: 'married', mood: 15, decayDays: 30, text: 'Was married to {about}' },
  { id: 'child-born', mood: 20, decayDays: 30, text: 'A child was born' },
  { id: 'came-of-age', mood: 10, decayDays: 20, text: 'Came of age' },
  { id: 'lost-spouse', mood: -30, decayDays: 60, text: 'Lost {about}, a spouse' },
  { id: 'lost-child', mood: -25, decayDays: 45, text: 'Lost {about}, a child' },
  { id: 'lost-parent', mood: -25, decayDays: 45, text: 'Lost {about}, a parent' },
  { id: 'lost-sibling', mood: -15, decayDays: 30, text: 'Lost {about}, a sibling' },
  { id: 'lost-friend', mood: -10, decayDays: 20, text: 'Lost {about}, a friend' },
  { id: 'outlived-enemy', mood: 5, decayDays: 10, text: 'Outlived {about}' },
  { id: 'humiliated', mood: -10, decayDays: 15, text: 'Was humiliated by {about}' },
  { id: 'vengeance-taken', mood: 8, decayDays: 10, text: 'Took revenge on {about}' },
  { id: 'rejected', mood: -4, decayDays: 10, text: 'Was turned down by {about}' },
  { id: 'insulted', mood: -6, decayDays: 10, text: 'Was insulted by {about}' },
  { id: 'helped', mood: 4, decayDays: 7, text: 'Was helped by {about}' },
];

/** Events of family life; `{actor}` is the first person named, `{site}` the watched site. */
export const FAMILY_EVENTS: EventTypeDef[] = [
  {
    id: 'site_married',
    baseImportance: 3,
    title: '{actor} married {actor2}',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} and {actor2} were married at {site}, {how}; {gift}.',
      'At {site}, {actor} wed {actor2} ({how}).',
      '{actor} and {actor2} became man and wife; {gift}.',
    ],
  },
  {
    id: 'site_birth',
    baseImportance: 3,
    title: '{actor} was born',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} was born at {site}, to {actor2} and {actor3}.',
      'A child, {actor}, came to {actor2} and {actor3} at {site}.',
      '{actor2} gave birth to {actor}, {actor3} being the father.',
    ],
  },
  {
    id: 'site_came_of_age',
    baseImportance: 2,
    title: '{actor} came of age',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} came of age at {site}.',
      'At {site}, {actor} was counted among the grown.',
      '{actor} was a child no longer, and took a grown place at {site}.',
    ],
  },
  {
    id: 'site_household_formed',
    baseImportance: 2,
    title: '{actor} set up a household',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      'At {site}, {actor} and family left the household of {actor2} for a home of their own.',
      '{actor} took a vacant home at {site}, leaving the house of {actor2}.',
      'The household of {actor2} at {site} split, and {actor} became head of a new one.',
    ],
  },
  {
    id: 'site_inherited',
    baseImportance: 3,
    title: '{actor} took over the household of {actor2}',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} took over the household of {actor2} at {site}. {custom}',
      'With {actor2} gone, {actor} became head of the household at {site}.',
      'The hearth of {actor2} passed to {actor}.',
    ],
  },
  {
    id: 'site_orphan_taken_in',
    baseImportance: 3,
    title: '{actor} took in {actor2}',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} took in {actor2}, left without a parent at {site}.',
      'At {site}, {actor2} was orphaned, and {actor} gave the child a place by their fire.',
      '{actor} became guardian of {actor2}.',
    ],
  },
];
