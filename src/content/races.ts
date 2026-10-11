// Races (§5.4). Humans are the balance baseline. The two other races are
// PLACEHOLDERS showing the intended shapes; the user approves real sketches
// at the start of Phase 2 (design fork). Every advantage costs something (R-29).

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
  preferredBiomes: ['grassland', 'temperate-forest', 'steppe'],
  dependencies: [],
};

const placeholderMagicRace: RaceDef = {
  id: 'placeholder_elder',
  name: 'Elder folk (placeholder)',
  placeholder: true,
  attributeMeans: {
    strength: 8,
    agility: 11,
    endurance: 8,
    intellect: 12,
    willpower: 12,
    perception: 12,
    charisma: 10,
  },
  attributeRange: [3, 18],
  // About 4× the human odds of gifted or better.
  magicTierWeights: { none: 30000, faint: 52000, gifted: 16000, strong: 1800, exceptional: 200 },
  affinityWeights: { life: 4, mind: 3, air: 2, water: 2 },
  lifespanYears: 210,
  maturityYears: 32,
  fertility: 0.3,
  foodNeed: 0.9,
  // Old, high-aura forest: forest biomes; the aura need is the dependency below.
  preferredBiomes: ['temperate-forest', 'taiga'],
  dependencies: [
    { id: 'high_aura_land', description: 'Mood and health decline away from high-aura land.' },
  ],
};

const placeholderStrongRace: RaceDef = {
  id: 'placeholder_stone',
  name: 'Stone folk (placeholder)',
  placeholder: true,
  attributeMeans: {
    strength: 13,
    agility: 9,
    endurance: 13,
    intellect: 10,
    willpower: 11,
    perception: 9,
    charisma: 9,
  },
  attributeRange: [4, 19],
  // About 0.3× the human odds of gifted or better.
  magicTierWeights: { none: 75000, faint: 23500, gifted: 1350, strong: 135, exceptional: 15 },
  affinityWeights: { earth: 5, fire: 2 },
  lifespanYears: 110,
  maturityYears: 20,
  fertility: 0.7,
  foodNeed: 1.5,
  preferredBiomes: ['alpine', 'tundra', 'taiga'],
  dependencies: [],
};

export const races: RaceDef[] = [human, placeholderMagicRace, placeholderStrongRace];
