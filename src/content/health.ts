// Health and death with a cause at the watched site (M3.5): conditions, ailments, healers and the
// words of the chronicle. A new illness is an entry here, not an engine change. Health is 100 minus
// severity times harm over a person's conditions; at 0 they die of the one doing the most harm.

import type { AilmentDef, ConditionDef, EventTypeDef, HealthRules, MemoryDef } from '../engine';

export const CONDITIONS: ConditionDef[] = [
  {
    id: 'starving',
    name: 'Starving',
    kind: 'need',
    // 1 health per point: 100 severity is death.
    harm: 1,
    deathCause: 'famine',
    words: { onset: 'hunger', death: 'hunger' },
    // After two whole days at zero food: +12 a day, eased 20 a day once eating (about 8 days to die).
    need: { need: 'food', days: 2, gain: 12, ease: 20, cause: 'stores' },
  },
  {
    id: 'parched',
    name: 'Parched',
    kind: 'need',
    harm: 1,
    deathCause: 'thirst',
    words: { onset: 'thirst', death: 'thirst' },
    // Water at zero two days running: +20 a day, eased 40 once drinking (about 5 days to die).
    need: { need: 'water', days: 2, gain: 20, ease: 40, cause: 'well' },
  },
  {
    id: 'chilled',
    name: 'Chilled',
    kind: 'need',
    harm: 1,
    deathCause: 'exposure',
    words: { onset: 'the cold', death: 'the cold' },
    // Warmth at zero at dawn: +10 a night (children and elders feel it half as much again), -15 once warm.
    need: {
      need: 'warmth',
      days: 1,
      gain: 10,
      ease: 15,
      cause: 'cold',
      vulnerable: { child: 1.5, elder: 1.5 },
    },
  },
  {
    id: 'exhausted',
    name: 'Exhausted',
    kind: 'need',
    // Weariness hurts little and cannot kill alone (it stops at 60), but makes accidents likelier.
    harm: 0.3,
    deathCause: 'illness',
    words: { onset: 'weariness', death: 'weariness' },
    need: { need: 'rest', days: 1, gain: 10, ease: 25, cap: 60 },
  },
  {
    id: 'minor-wound',
    name: 'Minor wound',
    kind: 'wound',
    harm: 1,
    deathCause: 'wound',
    words: { onset: 'a cut', death: 'a wound' },
    // Starts at 15, heals 3 a day; 75% of accidents; too small to make the chronicle.
    wound: { start: 15, heal: 3, share: 75, fester: [0.02, 0.005], silent: true },
  },
  {
    id: 'serious-wound',
    name: 'Serious wound',
    kind: 'wound',
    harm: 1,
    deathCause: 'wound',
    words: { onset: 'a bad wound', death: 'a wound' },
    // Starts at 40, heals 1.5 a day; 20% of accidents; festers 15% untended, 4% tended.
    wound: { start: 40, heal: 1.5, share: 20, fester: [0.15, 0.04] },
  },
  {
    id: 'critical-wound',
    name: 'Critical wound',
    kind: 'wound',
    harm: 1,
    deathCause: 'wound',
    words: { onset: 'a terrible wound', death: 'a wound' },
    // Starts at 70, heals 1 a day; 5% of accidents; festers 35% untended, 10% tended; half leave a lasting harm.
    wound: { start: 70, heal: 1, share: 5, fester: [0.35, 0.1], lasting: 0.5 },
  },
  {
    id: 'festering',
    name: 'Festering wound',
    kind: 'wound',
    harm: 1,
    deathCause: 'wound',
    words: { onset: 'a festering wound', death: 'a festering wound' },
  },
  {
    id: 'old-wound',
    name: 'Old wound',
    kind: 'chronic',
    // A permanent mark: it costs strength or agility, not health.
    harm: 0,
    deathCause: 'wound',
    words: { onset: 'an old wound', death: 'an old wound' },
  },
  {
    id: 'chill',
    name: 'The chill',
    kind: 'disease',
    harm: 1,
    deathCause: 'disease',
    abed: true,
    words: { onset: 'the chill', death: 'the chill' },
  },
  {
    id: 'flux',
    name: 'The bloody flux',
    kind: 'disease',
    harm: 1,
    deathCause: 'disease',
    abed: true,
    words: { onset: 'the bloody flux', death: 'the bloody flux' },
  },
  {
    // The shell every Phase 2 disease (content/diseases.ts) takes at the site; its words are the disease's name.
    id: 'sickness',
    name: 'Sickness',
    kind: 'disease',
    harm: 1,
    deathCause: 'disease',
    abed: true,
    words: { onset: 'sickness', death: 'sickness' },
  },
  {
    id: 'wasting-cough',
    name: 'Wasting cough',
    kind: 'chronic',
    harm: 1,
    deathCause: 'illness',
    words: { onset: 'a wasting cough', death: 'a wasting cough' },
    // Begins at 10-25 and worsens 5-15 a year; never heals.
    chronic: { start: [10, 25], growth: [5, 15] },
  },
  {
    id: 'bad-heart',
    name: 'Bad heart',
    kind: 'chronic',
    harm: 1,
    deathCause: 'illness',
    words: { onset: 'a failing heart', death: 'a failing heart' },
    chronic: { start: [10, 25], growth: [5, 15] },
  },
  {
    id: 'joint-ill',
    name: 'Joint-ill',
    kind: 'chronic',
    harm: 1,
    deathCause: 'illness',
    words: { onset: 'stiff and aching joints', death: 'a long illness of the joints' },
    chronic: { start: [10, 25], growth: [5, 15] },
  },
  {
    id: 'frailty',
    name: 'Frailty',
    kind: 'age',
    harm: 1,
    deathCause: 'old-age',
    words: { onset: 'frailty', death: 'old age' },
  },
  {
    id: 'childbirth',
    name: 'Childbirth',
    kind: 'birth',
    harm: 1,
    deathCause: 'childbirth',
    words: { onset: 'childbirth', death: 'childbirth' },
    // Death 2% untended, 0.6% with a healer; the mother is weak (severity 40) and mends 12 a day.
    birth: { untended: 0.02, tended: 0.006, start: 40, heal: 12 },
  },
];

export const AILMENTS: AilmentDef[] = [
  {
    id: 'chill',
    name: 'the chill',
    conditionId: 'chill',
    incubation: 1,
    duration: [5, 10],
    peak: [10, 30],
    infectivity: 0.04,
    ageRisk: { child: 1.5, adult: 1, elder: 2.5 },
    // Two months' immunity.
    immuneDays: 56,
    // 3% a chilled night, 1% a night in a home with no firewood.
    sources: { condition: { chilled: 0.03 }, coldHome: 0.01 },
  },
  {
    id: 'flux',
    name: 'the bloody flux',
    conditionId: 'flux',
    incubation: 1,
    duration: [4, 8],
    peak: [20, 45],
    infectivity: 0.05,
    householdOnly: true,
    ageRisk: { child: 2, adult: 1, elder: 2 },
    immuneDays: 56,
    // 0.2% a day while the well is low, doubled in the hot months (Sunmonth to Goldmonth: 3 to 5).
    sources: { wellLow: 0.002 },
    season: { months: [3, 5], mul: 2 },
  },
];

export const HEALTH: HealthRules = {
  // Under 50 health, stay in bed.
  abedBelow: 50,
  // A sick person stays home while above 20 severity.
  abedSeverity: 20,
  // The steward counts 15 severity as a patient.
  sufferAt: 15,
  patientsPerHealer: 6,
  // One herb a patient a day; without herbs tending is half as good.
  herbsPerPatient: 1,
  noHerbsPower: 0.5,
  tendable: ['wound', 'disease', 'chronic', 'birth'],
  // Tended wounds heal half as fast again.
  tendedHeal: 0.5,
  // A disease tended before its peak peaks 30% lower.
  tendedPeak: 0.7,
  // Chronic illness grows half as fast when tended.
  tendedChronic: 0.5,
  exhaustedMul: 1.5,
  exhaustedCondition: 'exhausted',
  // A skill of 100 halves the accident chance.
  skillDivisor: 200,
  // 1% a block beside a fire.
  fireRisk: 0.01,
  // A wound that festers starts at 10, gains 4 a day for 10 days, then eases 3 a day.
  festering: { condition: 'festering', days: 7, start: 10, grow: 4, growDays: 10, ease: 3 },
  // Frailty is 20 severity at the first year of old age and rises with it.
  frailty: { condition: 'frailty', severityAtElder: 20 },
  disease: {
    condition: 'sickness',
    // The history infectivity is per link per year; per contact-day it is infectivity / duration.
    infectivityScale: 1,
    // History severity is the share who die (0.1-0.3 for plague): x300 gives a peak of 30-90, capped at 95.
    severityScale: 300,
    severityCap: 95,
  },
  // From 40, a 3% yearly chance of a chronic illness; 8% for elders.
  chronic: {
    fromAge: 40,
    adult: 0.03,
    elder: 0.08,
    conditions: ['wasting-cough', 'bad-heart', 'joint-ill'],
  },
  // Half of the critical wounds leave -2 strength or agility.
  oldWound: { condition: 'old-wound', attributes: ['strength', 'agility'], amount: 2 },
  // The first case in 30 days makes the chronicle.
  caseGapDays: 30,
  // Three sick at once is an outbreak.
  outbreakAt: 3,
  woundTiers: ['minor-wound', 'serious-wound', 'critical-wound'],
  griefMemory: 'grief',
  events: {
    wounded: 'site_wounded',
    fellIll: 'site_fell_ill',
    outbreak: 'site_outbreak',
    lastingHarm: 'site_lasting_harm',
    died: 'site_died',
  },
};

export const HEALTH_MEMORIES: MemoryDef[] = [
  // A death in the household or the family: -20 fading over a month (M3.6 deepens grief).
  { id: 'grief', mood: -20, decayDays: 30, text: 'Mourning {about}' },
];

/** Site-tier events of health; `{actor}` is the person, `{site}` the watched site. */
export const HEALTH_EVENTS: EventTypeDef[] = [
  {
    id: 'site_wounded',
    baseImportance: 3,
    title: '{actor} badly hurt',
    causeWord: 'because of',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} suffered {wound} at {site}, {doing}.',
      'At {site}, {actor} was hurt {doing}: {wound}.',
      '{actor} took {wound} {doing} at {site}.',
    ],
  },
  {
    id: 'site_fell_ill',
    baseImportance: 2,
    title: '{actor} fell ill',
    causeWord: 'because of',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} fell ill with {illness} at {site}.',
      '{illness} took hold of {actor} at {site}.',
      'At {site}, {actor} came down with {illness}.',
    ],
  },
  {
    id: 'site_outbreak',
    baseImportance: 5,
    title: '{illness} spreads at {site}',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{illness} spread through {site}; {count} people lay sick.',
      '{count} people at {site} were down with {illness}.',
      'By the time it was noticed, {illness} had {count} sick at {site}.',
    ],
  },
  {
    id: 'site_lasting_harm',
    baseImportance: 2,
    title: '{actor} left with a lasting harm',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} mended, but their {attribute} was never what it had been.',
      "The wound healed; {actor}'s {attribute} did not recover.",
      '{actor} was left with a lasting harm to their {attribute}.',
    ],
  },
  {
    id: 'site_died',
    baseImportance: 6,
    title: '{actor} died of {cause}',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    templates: [
      '{actor} died of {cause} at {site}, after {span}.',
      'At {site}, {actor} was taken by {cause} after {span}.',
      '{actor} died at {site} of {cause}, after {span}.',
    ],
  },
];
