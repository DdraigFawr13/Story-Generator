// Schools and the unified skill/ability/spell list (§5.2). Magic and mundane
// skills share one shape: hard attribute requirements, learning sources and
// an effect inside its tier's caps (validated). Add entries freely.

import type { AbilityDef, SchoolDef } from '../engine';

export const schools: SchoolDef[] = [
  { id: 'fire', name: 'Fire', castingCost: { fatigue: 5 } },
  { id: 'water', name: 'Water', castingCost: { fatigue: 5 } },
  { id: 'earth', name: 'Earth', castingCost: { fatigue: 5 } },
  { id: 'air', name: 'Air', castingCost: { fatigue: 5 } },
  { id: 'life', name: 'Life', castingCost: { fatigue: 5 } },
  { id: 'mind', name: 'Mind', castingCost: { fatigue: 5 } },
];

export const abilities: AbilityDef[] = [
  // Mundane skills: learnable by practice; attributes gate mastery.
  {
    id: 'farming',
    name: 'Farming',
    family: 'labour',
    requirements: {},
    learnAttributes: ['endurance', 'perception'],
    learnFrom: ['practice', 'teacher'],
    effect: { kind: 'craft', tag: 'food' },
  },
  {
    id: 'fighting',
    name: 'Fighting',
    family: 'combat',
    requirements: {},
    learnAttributes: ['strength', 'agility'],
    learnFrom: ['practice', 'teacher'],
    effect: { kind: 'damage', damage: 1 },
  },
  {
    id: 'master_smithing',
    name: 'Master smithing',
    family: 'craft',
    requirements: { strength: 12, perception: 12 },
    learnAttributes: ['strength', 'perception'],
    learnFrom: ['teacher', 'practice'],
    effect: { kind: 'craft', tag: 'fine_metalwork' },
  },
  {
    id: 'generalship',
    name: 'Generalship',
    family: 'social',
    requirements: { charisma: 13, intellect: 12 },
    learnAttributes: ['charisma', 'intellect'],
    learnFrom: ['teacher', 'book', 'practice'],
    effect: { kind: 'utility', tag: 'command_army' },
  },
  // Faint-tier cantrips: what most magical people ever manage.
  {
    id: 'kindle',
    name: 'Kindle',
    family: 'magic',
    school: 'fire',
    requirements: { power: 1, 'affinity.fire': 1 },
    learnAttributes: ['willpower'],
    learnFrom: ['teacher', 'book'],
    effect: { kind: 'utility', tag: 'light_fire', usesPerDay: 3 },
  },
  {
    id: 'mend',
    name: 'Mend',
    family: 'magic',
    school: 'earth',
    requirements: { power: 1, 'affinity.earth': 1 },
    learnAttributes: ['perception'],
    learnFrom: ['teacher', 'book'],
    effect: { kind: 'utility', tag: 'repair_small', usesPerDay: 3 },
  },
  // Gifted: a village healer.
  {
    id: 'healing_touch',
    name: 'Healing touch',
    family: 'magic',
    school: 'life',
    requirements: { power: 4, 'affinity.life': 4, willpower: 8 },
    learnAttributes: ['willpower', 'intellect'],
    learnFrom: ['teacher', 'book', 'institution'],
    effect: { kind: 'heal', usesPerDay: 4 },
  },
  // Strong: a battle-mage, about a squad's worth.
  {
    id: 'fire_burst',
    name: 'Fire burst',
    family: 'magic',
    school: 'fire',
    requirements: { power: 8, 'affinity.fire': 8, willpower: 10 },
    learnAttributes: ['willpower', 'intellect'],
    learnFrom: ['teacher', 'institution'],
    effect: { kind: 'damage', damage: 3, areaRadius: 2, usesPerDay: 4 },
  },
];
