// Races (§5.4). Humans are the balance baseline. Tylwyth and Dvergar sketches
// were approved 2026-10-11. Every advantage costs something (R-29).

import type { RaceDef } from '../engine';

const human: RaceDef = {
  id: 'human',
  name: 'Human',
  attributeMeans: {
    strength: 10,
    agility: 10,
    endurance: 10,
    intellect: 10,
    willpower: 10,
    perception: 10,
    charisma: 10,
  },
  attributeRange: [3, 18],
  // Per 100,000 births: ~60% none, ~35% faint, ~4.5% gifted, ~0.45% strong, ~1 in 2,000 exceptional.
  magicTierWeights: { none: 60000, faint: 35000, gifted: 4500, strong: 450, exceptional: 50 },
  affinityWeights: { fire: 3, water: 3, earth: 3, air: 2, life: 3, mind: 1 },
  lifespanYears: 70,
  maturityYears: 16,
  fertility: 1,
  foodNeed: 1,
  preferredBiomes: ['grassland', 'temperate-forest', 'steppe', 'savanna'],
  dependencies: [],
};

// Long-lived forest people: about 4x human magic odds, but few children and bound to aura.
const tylwyth: RaceDef = {
  id: 'tylwyth',
  name: 'Elf',
  attributeMeans: {
    strength: 8,
    agility: 12,
    endurance: 8,
    intellect: 12,
    willpower: 12,
    perception: 12,
    charisma: 10,
  },
  attributeRange: [3, 18],
  // 18% gifted or better, about 4x the human odds.
  magicTierWeights: { none: 30000, faint: 52000, gifted: 16000, strong: 1800, exceptional: 200 },
  affinityWeights: { life: 4, mind: 3, air: 2, water: 1 },
  lifespanYears: 210,
  maturityYears: 32,
  // The approved sketch value; balance comes from aura-scaled capacity (settlement.capacity.raceAura).
  fertility: 0.3,
  foodNeed: 0.9,
  preferredBiomes: ['temperate-forest', 'taiga', 'jungle'],
  dependencies: [
    { id: 'high_aura_land', description: 'Mood and health fade away from high-aura land.' },
  ],
};

// Enduring mountain people: strong and hungry, weak at magic (1.5% gifted or better).
const dvergar: RaceDef = {
  id: 'dvergar',
  name: 'Dwarf',
  attributeMeans: {
    strength: 13,
    agility: 9,
    endurance: 13,
    intellect: 10,
    willpower: 12,
    perception: 9,
    charisma: 8,
  },
  attributeRange: [4, 19],
  magicTierWeights: { none: 75000, faint: 23500, gifted: 1350, strong: 135, exceptional: 15 },
  affinityWeights: { earth: 5, fire: 2 },
  lifespanYears: 130,
  maturityYears: 24,
  // The approved sketch value; balance comes from ore-dependent capacity (settlement.capacity.raceWithout).
  fertility: 0.5,
  foodNeed: 1.4,
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  dependencies: [
    {
      id: 'ore_deposit',
      description: 'Needs stone or metal deposits near home; starves without trade on poor land.',
    },
  ],
};

// Sea raiders of the cold coasts: short-lived and quick-breeding, so rulers die young and often.
const fomori: RaceDef = {
  id: 'fomori',
  name: 'Fomori',
  attributeMeans: {
    strength: 12,
    agility: 10,
    endurance: 12,
    intellect: 8,
    willpower: 10,
    perception: 9,
    charisma: 8,
  },
  attributeRange: [3, 18],
  // About 2% gifted or better, under half the human odds.
  magicTierWeights: { none: 70000, faint: 28000, gifted: 1800, strong: 180, exceptional: 20 },
  affinityWeights: { fire: 3, earth: 2, water: 2 },
  // Half again the human lifespan lost, and maturity three years sooner.
  lifespanYears: 50,
  maturityYears: 13,
  // Many children, short lives, so many successions.
  fertility: 1.5,
  // The downside: a quarter more food than a human.
  foodNeed: 1.25,
  preferredBiomes: ['tundra', 'taiga', 'steppe'],
  dependencies: [],
};

// Giants of the high country: very few and very hungry, with a little more magic than humans.
const cewri: RaceDef = {
  id: 'cewri',
  name: 'Giant',
  attributeMeans: {
    strength: 17,
    agility: 7,
    endurance: 16,
    intellect: 9,
    willpower: 12,
    perception: 9,
    charisma: 8,
  },
  attributeRange: [6, 20],
  // About 3% gifted or better.
  magicTierWeights: { none: 62000, faint: 35000, gifted: 2700, strong: 270, exceptional: 30 },
  affinityWeights: { earth: 4, air: 2 },
  lifespanYears: 300,
  maturityYears: 40,
  // One child in seven human births: a steading stays small for generations.
  fertility: 0.15,
  // Each giant eats for three.
  foodNeed: 3,
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  dependencies: [
    {
      id: 'wide_range',
      description:
        'Each giant eats for three; a steading needs wide land around it and starves when crowded.',
    },
  ],
};

// Small, quiet farmers: about 1.5% gifted or better, and they eat little.
const halfling: RaceDef = {
  id: 'halfling',
  name: 'Halfling',
  attributeMeans: {
    strength: 7,
    agility: 12,
    endurance: 10,
    intellect: 10,
    willpower: 10,
    perception: 11,
    charisma: 11,
  },
  attributeRange: [3, 17],
  magicTierWeights: { none: 72000, faint: 26500, gifted: 1350, strong: 135, exceptional: 15 },
  affinityWeights: { life: 3, earth: 2 },
  lifespanYears: 100,
  maturityYears: 20,
  fertility: 0.9,
  // Small folk eat a fifth less than a human (0.7 let them outgrow every other people, playtest 2026-10-13).
  foodNeed: 0.8,
  preferredBiomes: ['grassland', 'temperate-forest', 'savanna'],
  dependencies: [],
};

// Quick-breeding, short-lived warren folk: about 3% gifted or better, fragile and many.
const goblin: RaceDef = {
  id: 'goblin',
  name: 'Goblin',
  attributeMeans: {
    strength: 7,
    agility: 13,
    endurance: 9,
    intellect: 9,
    willpower: 8,
    perception: 12,
    charisma: 6,
  },
  attributeRange: [2, 16],
  magicTierWeights: { none: 65000, faint: 32000, gifted: 2700, strong: 270, exceptional: 30 },
  affinityWeights: { fire: 2, mind: 2, earth: 2 },
  // Short lives: a goblin is grown at ten and old at forty.
  lifespanYears: 40,
  maturityYears: 10,
  // Many children (the downside is frailty and a short life).
  fertility: 1.8,
  foodNeed: 0.8,
  preferredBiomes: ['swamp', 'jungle', 'alpine'],
  dependencies: [],
};

// Orcs of the open steppe and dry grassland: the strongest people, with blood-shamans, but slow to learn and
// always hungry. Unlike the Fomori they live a full span and fight as a disciplined horde.
const orc: RaceDef = {
  id: 'orc',
  name: 'Orc',
  attributeMeans: {
    strength: 14,
    agility: 10,
    endurance: 13,
    intellect: 8,
    willpower: 12,
    perception: 10,
    charisma: 7,
  },
  attributeRange: [4, 19],
  // About 5% gifted, near human odds, leaning to mind and fire (the shamans).
  magicTierWeights: { none: 62000, faint: 33000, gifted: 4500, strong: 450, exceptional: 50 },
  affinityWeights: { mind: 3, fire: 3, earth: 1 },
  lifespanYears: 60,
  maturityYears: 15,
  fertility: 1.1,
  // The downside: a fifth more food than a human, so lean years drive them to raid.
  foodNeed: 1.2,
  preferredBiomes: ['steppe', 'savanna', 'grassland'],
  dependencies: [],
};

export const races: RaceDef[] = [human, tylwyth, dvergar, fomori, orc, cewri, halfling, goblin];
