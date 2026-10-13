// Daily life at the watched site (M3.2, REBOOT_PLAN §6A): needs, traits, memories, the day's
// rhythm and the stress rules. The engine in engine/site/life.ts reads only these tables.

import type { EventTypeDef, LifeRules, MemoryDef, NeedDef, TraitDef } from '../engine';

export const NEEDS: NeedDef[] = [
  {
    id: 'food',
    name: 'Food',
    // About one meal a day keeps a person fed.
    decayPerDay: 35,
    restore: { eat: 60, steal: 30 },
    awayShare: 1,
    lowAt: 30,
    moodAtZero: -30,
    lowWord: 'Hungry',
    missing: 'no meal',
  },
  {
    id: 'water',
    name: 'Water',
    // Wells and the river make water easy; a dry spell sinks a well with no river near (M3.4).
    decayPerDay: 50,
    // People in a breakdown still drink, so a breakdown does not feed the next one.
    restore: {
      eat: 40,
      work: 15,
      play: 15,
      socialise: 15,
      despair: 25,
      wander: 25,
      tantrum: 10,
      steal: 10,
      // Fighters at the well or river drink as they go.
      fight: 15,
    },
    awayShare: 1,
    lowAt: 30,
    moodAtZero: -30,
    lowWord: 'Thirsty',
    missing: 'no drink',
  },
  {
    id: 'rest',
    name: 'Rest',
    decayPerDay: 40,
    restore: { sleep: 70, despair: 15 },
    // Sleeping rough rests half as well.
    awayShare: 0.5,
    lowAt: 30,
    moodAtZero: -20,
    lowWord: 'Tired',
    missing: 'no proper sleep',
  },
  {
    id: 'warmth',
    name: 'Warmth',
    // Decay comes from the day's temperature (LIFE.warmth), not a fixed rate.
    decayPerDay: 0,
    restore: { sleep: 50, eat: 20, despair: 20 },
    // Only a roof and a hearth warm you.
    awayShare: 0,
    lowAt: 30,
    moodAtZero: -25,
    lowWord: 'Cold',
    missing: 'no warm hearth',
  },
  {
    id: 'safety',
    name: 'Safety',
    // Threats arrive in M3.8; until then only nights away from home wear it down.
    decayPerDay: 6,
    restore: { sleep: 10 },
    awayShare: 0,
    lowAt: 30,
    moodAtZero: -15,
    lowWord: 'Uneasy',
    missing: 'no safe night',
  },
  {
    id: 'companionship',
    name: 'Company',
    decayPerDay: 10,
    // The evening meal together is most people's company; a working day adds a little.
    restore: { eat: 12, socialise: 12, play: 8, worship: 6, work: 3, fight: 3 },
    awayShare: 1,
    needsCompany: true,
    lowAt: 30,
    moodAtZero: -15,
    lowWord: 'Lonely',
    missing: 'no company',
  },
  {
    id: 'purpose',
    name: 'Purpose',
    decayPerDay: 8,
    // Elders work one block and pass the afternoon in company, which also keeps them useful.
    restore: { work: 6, play: 6, socialise: 6, fight: 6 },
    awayShare: 1,
    lowAt: 30,
    moodAtZero: -12,
    lowWord: 'Idle',
    missing: 'no work',
  },
  {
    id: 'faith',
    name: 'Faith',
    decayPerDay: 5,
    // One rest-day worship a week covers even the devout (5 × 1.8 × 7 = 63).
    restore: { worship: 70 },
    awayShare: 1,
    lowAt: 30,
    moodAtZero: -10,
    lowWord: 'Faithless',
    missing: 'no worship',
    // Cultures that weigh faith at 3 or more (of 10) keep the need.
    minCultureFaith: 3,
  },
];

export const TRAITS: TraitDef[] = [
  {
    id: 'hot-tempered',
    name: 'hot-tempered',
    description: 'Quick to anger; breaks down in a rage.',
    weight: 10,
    excludes: ['steady'],
    mood: 0,
    breakdownAt: 0.85,
    breakdown: 'tantrum',
  },
  {
    id: 'melancholic',
    name: 'melancholic',
    description: 'Prone to low spirits; breaks down in despair.',
    weight: 10,
    excludes: ['cheerful'],
    mood: -4,
    breakdownAt: 0.9,
    breakdown: 'despair',
  },
  {
    id: 'restless',
    name: 'restless',
    description: 'Needs to be doing; breaks down by wandering off.',
    weight: 10,
    excludes: [],
    mood: 0,
    breakdownAt: 1,
    breakdown: 'wandering',
    needRates: { purpose: 1.4 },
  },
  {
    id: 'greedy',
    name: 'greedy',
    description: 'Wants more than a share; breaks down by stealing.',
    weight: 8,
    excludes: [],
    mood: 0,
    breakdownAt: 1,
    breakdown: 'theft',
  },
  {
    id: 'cheerful',
    name: 'cheerful',
    description: 'Takes hardship lightly.',
    weight: 10,
    excludes: ['melancholic'],
    mood: 6,
    breakdownAt: 1.2,
  },
  {
    id: 'steady',
    name: 'steady',
    description: 'Hard to shake.',
    weight: 8,
    excludes: ['hot-tempered'],
    mood: 0,
    breakdownAt: 1.3,
  },
  {
    id: 'sociable',
    name: 'sociable',
    description: 'Needs company more than most.',
    weight: 10,
    excludes: ['solitary'],
    mood: 2,
    breakdownAt: 1,
    needRates: { companionship: 1.3 },
  },
  {
    id: 'solitary',
    name: 'solitary',
    description: 'Content with little company.',
    weight: 7,
    excludes: ['sociable'],
    mood: 0,
    breakdownAt: 1,
    needRates: { companionship: 0.4 },
  },
  {
    id: 'hardy',
    name: 'hardy',
    description: 'Feels cold and weariness less.',
    weight: 8,
    excludes: [],
    mood: 0,
    breakdownAt: 1.1,
    needRates: { warmth: 0.6, rest: 0.8 },
  },
  {
    id: 'devout',
    name: 'devout',
    description: 'Needs worship more than most.',
    weight: 7,
    excludes: [],
    mood: 0,
    breakdownAt: 1,
    needRates: { faith: 1.8 },
  },
];

export const MEMORIES: MemoryDef[] = [
  { id: 'went-hungry', mood: -8, decayDays: 4, text: 'Went to bed hungry' },
  { id: 'slept-rough', mood: -5, decayDays: 3, text: 'Slept without a roof' },
  { id: 'ate-together', mood: 3, decayDays: 2, text: 'Ate with the household' },
  { id: 'worshipped', mood: 5, decayDays: 7, text: 'Worshipped at the shrine' },
  // After a breakdown the pressure is let out for a while.
  { id: 'vented', mood: 25, decayDays: 20, text: 'Let it all out' },
  { id: 'saw-tantrum', mood: -6, decayDays: 10, text: 'Saw {about} fly into a rage' },
  { id: 'saw-despair', mood: -4, decayDays: 7, text: 'Saw {about} sink into despair' },
  { id: 'kin-wandered', mood: -5, decayDays: 6, text: '{about} wandered off' },
  { id: 'saw-theft', mood: -5, decayDays: 10, text: 'Saw {about} steal from the stores' },
  // M3.3: a cooked meal, a cursed heirloom and a neighbour's treasure.
  { id: 'ate-well', mood: 3, decayDays: 2, text: 'Ate a cooked meal' },
  { id: 'cursed-item', mood: -6, decayDays: 3, text: 'Troubled by a cursed heirloom' },
  { id: 'envied', mood: -3, decayDays: 5, text: "Envied {about}'s treasure" },
  // M3.4: short meals (refreshed daily while they last), a cold night at home (up to three stack:
  // -15 over three nights), a home seen burning and a harvest brought in.
  { id: 'short-meals', mood: -6, decayDays: 3, text: 'On short meals' },
  { id: 'short-meals-hard', mood: -12, decayDays: 3, text: 'On very short meals' },
  { id: 'cold-night', mood: -5, decayDays: 5, stacks: 3, text: 'A cold night at home' },
  { id: 'saw-fire', mood: -8, decayDays: 10, text: 'Saw a home burn' },
  { id: 'harvested', mood: 4, decayDays: 12, text: 'Brought in the harvest' },
];

export const LIFE: LifeRules = {
  // §6A: night sleep, two work blocks, evening meal. Children play; elders work the morning only.
  schedule: {
    child: { night: 'sleep', morning: 'play', afternoon: 'play', evening: 'eat' },
    adult: { night: 'sleep', morning: 'work', afternoon: 'work', evening: 'eat' },
    elder: { night: 'sleep', morning: 'work', afternoon: 'socialise', evening: 'eat' },
  },
  // Infants and toddlers (under 3) are carried along by a household adult, mother first.
  carriedUnder: 3,
  // One day in seven is a rest day.
  restDayEvery: 7,
  restDayAfternoon: { faithful: 'worship', others: 'socialise' },
  // One meal a day, so a person eats their yearly need over the 336-day year.
  mealShare: 1 / 336,
  // Elders do half a day's work.
  workOutput: { child: 0, adult: 1, elder: 0.5 },
  warmth: {
    // Frostmonth (index 10) is the coldest; Goldmonth (4) the warmest.
    coldestMonth: 10,
    // Below 12 °C people lose warmth outdoors...
    comfortC: 12,
    // ...3 points a day per degree...
    perDegree: 3,
    // ...up to 60 a day (§6A).
    maxPerDay: 60,
  },
  // §6A: stress builds while mood is below -30.
  stressBelow: -30,
  // Mood -45 adds 15 × 0.7 ≈ 10 stress a day, so a breakdown comes after about ten bad days.
  stressRise: 0.7,
  // Stress falls 0.5 a day per point of good mood, and at least 2 a day while mood is above 0.
  stressFall: 0.5,
  stressFloorFall: 2,
  breakdownAt: 100,
  stressAfter: 20,
  defaultBreakdown: 'despair',
  childBreakdown: 'tantrum',
  despairDays: [1, 3],
  wanderDays: [1, 2],
  // A thief takes three days' meals.
  theftMeals: 3,
  // About the width of the green.
  witnessRange: 6,
  memoryCap: 20,
  memoryOf: {
    hungry: 'went-hungry',
    sleptRough: 'slept-rough',
    ateTogether: 'ate-together',
    worshipped: 'worshipped',
    vented: 'vented',
    sawTantrum: 'saw-tantrum',
    sawDespair: 'saw-despair',
    kinWandered: 'kin-wandered',
    sawTheft: 'saw-theft',
    ateWell: 'ate-well',
    cursed: 'cursed-item',
    envied: 'envied',
    shortMeals: 'short-meals',
    shortMealsHard: 'short-meals-hard',
    coldNight: 'cold-night',
    sawFire: 'saw-fire',
    harvested: 'harvested',
  },
  // A block is six hours: 240 cost (about 120 grass tiles) crosses the map; only rough routes stop short.
  walkPerBlock: 240,
  // Enough for every resident's routes in a block with room to spare; past it routes are straight.
  pathBudget: 60000,
  pathCache: 4096,
  // Routes may run up to half as long again as the best, which halves the tiles searched.
  pathWeight: 1.5,
  // People keep to paths and floors where they can.
  walkCost: {
    path: 1,
    floor: 1,
    field: 2,
    grass: 2,
    scrub: 2,
    shore: 2,
    marsh: 4,
    rock: 5,
  },
  treeCost: 2,
  events: {
    tantrum: 'site_tantrum',
    despair: 'site_despair',
    wandering: 'site_wandered',
    theft: 'site_theft',
    returned: 'site_returned',
    storesEmpty: 'site_stores_empty',
  },
};

/** Site-tier events of daily life; `{actor}` is the person, `{site}` the watched site. */
export const LIFE_EVENTS: EventTypeDef[] = [
  {
    id: 'site_tantrum',
    baseImportance: 3,
    title: '{actor} in a rage',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} flew into a rage at {site}, shouting at anyone near.',
      'Worn past bearing, {actor} raged and threw things about {site}.',
      '{actor} lost their temper at {site} and would not be calmed.',
    ],
  },
  {
    id: 'site_despair',
    baseImportance: 3,
    title: '{actor} in despair',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    // The first template names no site, the others do.
    dataKeys: ['site'],
    templates: [
      '{actor} sank into despair and would not leave the house.',
      'At {site}, {actor} gave up on the day and lay staring at the wall.',
      '{actor} stopped working, too low in spirit to rise.',
    ],
  },
  {
    id: 'site_wandered',
    baseImportance: 3,
    title: '{actor} wandered off',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} walked out of {site} without a word to anyone.',
      'Restless past bearing, {actor} wandered off into the country around {site}.',
      '{actor} left their work and went walking, no one knew where.',
    ],
  },
  {
    id: 'site_theft',
    baseImportance: 3,
    title: '{actor} stole from the stores',
    causeWord: 'because of',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} stole food from the stores of {site}.',
      'Driven past honesty, {actor} helped themselves from the stores of {site}.',
      '{actor} was seen carrying food away from the stockpile of {site}.',
    ],
  },
  {
    id: 'site_returned',
    baseImportance: 1,
    title: '{actor} came back',
    causeWord: 'after',
    category: 'social',
    links: { site: 'site' },
    templates: [
      '{actor} came back to {site}, footsore and quiet.',
      'After their wandering, {actor} walked home to {site}.',
      '{actor} returned to {site} and said little of where they had been.',
    ],
  },
  {
    id: 'site_stores_empty',
    baseImportance: 4,
    title: 'The stores of {site} are bare',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The last of the food at {site} was eaten; the stores stood bare.',
      'At {site} the stores ran out, and people went to bed hungry.',
      'Nothing was left in the stores of {site} to eat.',
    ],
  },
];
