// Rulers with character and bynames (H2): each ruler and legend has a temper, scored from their
// attributes, their people's values and their upbringing, that tilts choices the engine already
// makes and gives the chronicle its "why"; bynames are earned from deeds. Tune the numbers here;
// the engine reads only this table (engine/history/tempers.ts).

import type { EventTypeDef, TemperRules } from '../engine';

export const TEMPERS: TemperRules = {
  tempers: [
    {
      id: 'bold',
      word: 'bold',
      line: 'quick to draw a sword and slow to count the cost',
      attributes: { strength: 0.5, endurance: 0.3, willpower: 0.3 },
      values: { war: 0.4, honour: 0.4 },
      roles: { hero: 3, captain: 3 },
      // A grievance half again as worth a war; a fifth more likely to raise a work.
      tilts: { war: 1.5, works: 1.2, court: 1.2, pardon: 0.5 },
      why: {
        war: [
          ', for {ruler} was bold and hungry for glory',
          ', {ruler} being too bold to let a wrong stand',
        ],
        works: [', meaning to be remembered'],
        court: [', being bold enough to bargain with fire'],
      },
      byname: 'the Bold',
      bynameAfter: 'a reign of bold strokes',
    },
    {
      id: 'pious',
      word: 'pious',
      line: 'given to prayer and to the counsel of priests',
      attributes: { willpower: 0.5, charisma: 0.4 },
      values: { faith: 1.2 },
      roles: { priest: 5, prophet: 5 },
      tilts: { war: 0.8, hunt: 1.8, works: 1.3, court: 0.3, pardon: 3 },
      why: {
        hunt: [
          ', for {ruler} was pious and held magic an offence to the gods',
          ', the pious {ruler} having heard the priests preach against witches',
        ],
        works: [', a pious gift to the gods'],
        pardon: [', pardoned by {ruler}, who was pious and forgave'],
      },
      byname: 'the Pious',
      bynameAfter: 'a reign of prayer and pyres',
    },
    {
      id: 'greedy',
      word: 'greedy',
      line: 'counting every tithe and coveting every neighbour’s field',
      attributes: { perception: 0.4, charisma: 0.4, willpower: -0.3 },
      values: { wealth: 1.2 },
      roles: { crafter: 2 },
      tilts: { war: 1.2, tribute: 2, court: 1.5, betray: 1.8 },
      why: {
        war: [
          ', for {ruler} coveted their fields',
          ', {ruler} having an eye on their mines and markets',
        ],
        tribute: [', for {ruler} wanted their tribute more than their towns'],
        court: [', hoping for a share of the hoard'],
        betray: [
          '{ruler} was greedy for what the oath protected',
          '{ruler} coveted what an ally kept',
        ],
      },
      byname: 'the Grasping',
      bynameAfter: 'a reign of tithes and broken bargains',
    },
    {
      id: 'cruel',
      word: 'cruel',
      line: 'feared more than loved, and pleased to be',
      attributes: { strength: 0.5, willpower: 0.5, charisma: -0.7 },
      values: { war: 0.6, order: 0.4, kin: -0.5 },
      roles: { raider: 4 },
      tilts: { war: 1.3, tribute: 1.3, hunt: 1.5, court: 2.5, pardon: 0, betray: 1.6 },
      why: {
        war: [
          ', for {ruler} was cruel and wanted them broken',
          ', {ruler} having sworn to see their towns burn',
        ],
        tribute: [', for cruel {ruler} wanted them kneeling'],
        hunt: [', for {ruler} was cruel and liked a burning'],
        court: [', cruel enough to want a dragon loosed on the enemy'],
        betray: ['{ruler} was cruel and kept no oath longer than it served'],
      },
      byname: 'the Cruel',
      bynameAfter: 'a reign of fear',
    },
    {
      id: 'cautious',
      word: 'cautious',
      line: 'weighing every road twice before taking one',
      attributes: { perception: 0.6, intellect: 0.3, strength: -0.3 },
      values: { order: 0.8, kin: 0.4 },
      roles: { kin: 1 },
      tilts: { war: 0.6, tribute: 0.7, court: 0.4, pardon: 1.5, works: 1.2 },
      why: {
        works: [', trusting stone more than allies'],
        pardon: [', pardoned by {ruler}, who judged an exile safer at home than abroad'],
      },
      byname: 'the Wary',
      bynameAfter: 'a reign that risked nothing',
    },
    {
      id: 'learned',
      word: 'learned',
      line: 'at home among books and the arguments of scholars',
      attributes: { intellect: 0.8, perception: 0.2 },
      values: { learning: 1 },
      roles: { scholar: 5, mage: 2 },
      mage: 2,
      tilts: { war: 0.8, hunt: 0.3, works: 1.3, court: 0.7, pardon: 1.5 },
      why: {
        works: [', built for the ages by a learned mind'],
        pardon: [', pardoned by {ruler}, who would rather argue than banish'],
      },
      byname: 'the Wise',
      bynameAfter: 'a reign of books and halls',
    },
  ],
  jitter: 6,
  parentTemper: 3,
  orphanedCruel: 4,
  bynames: [
    {
      types: ['beast_slain'],
      who: { actor: 0 },
      data: { kind: ['dragon'] },
      words: ['the Dragonslayer', 'Wyrmbane'],
      after: 'slaying {beast}',
    },
    {
      types: ['beast_slain'],
      who: { actor: 0 },
      data: { kind: ['mountain giant'] },
      words: ['Giantsbane', 'the Giant-killer'],
      after: 'felling {beast}',
    },
    {
      types: ['beast_slain'],
      who: { actor: 0 },
      data: { kind: ['wyvern', 'afanc', 'water horse'] },
      words: ['the Beastslayer', 'Monsterbane'],
      after: 'slaying {beast}',
    },
    {
      types: ['plot_struck'],
      who: { actor: 0 },
      kin: true,
      words: ['the Kinslayer'],
      after: 'the murder of {target}',
    },
    {
      types: ['alliance_betrayed'],
      who: { ruler: 'civ' },
      words: ['the Oathbreaker', 'the Faithless'],
      after: 'breaking faith with the {victim}',
    },
    {
      types: ['seat_seized'],
      who: { actor: 0 },
      words: ['the Usurper'],
      after: 'seizing the seat of the {civ}',
    },
    {
      types: ['site_razed'],
      who: { ruler: 'civ' },
      temper: 'cruel',
      words: ['the Cruel', 'the Burner'],
      after: 'the burning of {site}',
    },
    {
      types: ['site_razed'],
      who: { ruler: 'civ' },
      min: 3,
      words: ['the Scourge'],
      after: 'the third town razed, {site}',
    },
    {
      types: ['site_conquered'],
      who: { ruler: 'civ' },
      min: 3,
      words: ['the Conqueror', 'the Great'],
      after: 'taking {site}, the third town won',
    },
    {
      types: ['mage_hunted'],
      who: { ruler: 'civ' },
      min: 3,
      words: ['the Witch-hunter', 'the Pitiless'],
      after: 'the hunt for {name}',
    },
    {
      types: ['vassal_sworn'],
      who: { ruler: 'overlord' },
      temper: 'greedy',
      words: ['the Grasping', 'Goldhand'],
      after: 'making the {civ} vassals',
    },
    {
      types: ['peace_by_marriage'],
      who: { actor: 2 },
      words: ['the Peacemaker'],
      after: 'the wedding that ended the war',
    },
    {
      types: ['legend_duel'],
      who: { actor: 0 },
      min: 2,
      words: ['the Unbeaten', 'Swordhand'],
      after: 'another duel won',
    },
    {
      types: ['great_work_raised'],
      who: { actor: 0 },
      temper: 'pious',
      words: ['the Pious', 'the Devout'],
      after: 'raising {work}',
    },
    {
      types: ['great_work_raised'],
      who: { actor: 0 },
      words: ['the Builder'],
      after: 'raising {work}',
    },
  ],
  // Whose temper decided an event that carries a temper's why.
  temperedBy: {
    war_declared: { ruler: 'civ' },
    vassal_sworn: { ruler: 'overlord' },
    mage_hunted: { ruler: 'civ' },
    great_work_raised: { actor: 0 },
    dragon_courted: { actor: 0 },
    exile_returned: { actor: 1 },
    alliance_betrayed: { ruler: 'civ' },
  },
  // Two choices made by temper give its byname ("the Bold"), if no deed gave one first.
  temperedChoices: 2,
};

export const TEMPER_EVENTS: EventTypeDef[] = [
  {
    id: 'byname_earned',
    baseImportance: 4,
    title: '{name} called {byname}',
    causeWord: 'after',
    category: 'politics',
    precision: 'year',
    templates: [
      'After {after}, {name} was called {byname}.',
      '{date}: men began to call {name} {byname}, after {after}.',
      'From {date} {name} was known as {byname}, for {after}.',
    ],
  },
];
