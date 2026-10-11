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
  name: 'Tylwyth',
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
  fertility: 0.6,
  foodNeed: 0.9,
  preferredBiomes: ['temperate-forest', 'taiga', 'jungle'],
  dependencies: [
    { id: 'high_aura_land', description: 'Mood and health fade away from high-aura land.' },
  ],
};

// Enduring mountain people: strong and hungry, weak at magic (1.5% gifted or better).
const dvergar: RaceDef = {
  id: 'dvergar',
  name: 'Dvergar',
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
  fertility: 0.75,
  foodNeed: 1.4,
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  dependencies: [
    {
      id: 'ore_deposit',
      description: 'Needs stone or metal deposits near home; starves without trade on poor land.',
    },
  ],
};

export const races: RaceDef[] = [human, tylwyth, dvergar];
