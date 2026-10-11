// Content validation (§7.5): runs at startup and in tests. It enforces the
// design rules that must never drift: effect caps per tier (R-24), race
// balance (R-29) and no self-taught magic (R-28). Returns readable problems.

import type { ContentBundle, RaceDef } from './content-types';
import { ATTRIBUTE_KEYS } from './types';
import { BIRTH_TIER_IDS, TIERS, tierOfPower } from '../people/tiers';

export function validateContent(content: ContentBundle): string[] {
  const problems: string[] = [];
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Duplicate ${kind} id "${id}".`);
      seen.add(id);
    }
  };
  unique(
    'race',
    content.races.map((r) => r.id),
  );
  unique(
    'school',
    content.schools.map((s) => s.id),
  );
  unique(
    'ability',
    content.abilities.map((a) => a.id),
  );
  unique(
    'weather',
    content.weather.map((w) => w.id),
  );
  unique(
    'event type',
    content.eventTypes.map((e) => e.id),
  );
  unique(
    'rule',
    content.rules.map((r) => r.id),
  );

  const schools = new Set(content.schools.map((s) => s.id));
  const human = content.races.find((r) => r.id === 'human');
  if (!human) problems.push('Content needs a "human" race as the balance baseline.');

  for (const race of content.races) {
    for (const key of ATTRIBUTE_KEYS) {
      const value = race.attributeMeans[key];
      if (value < race.attributeRange[0] || value > race.attributeRange[1]) {
        problems.push(`Race ${race.id}: ${key} mean ${value} is outside its range.`);
      }
    }
    for (const school of Object.keys(race.affinityWeights)) {
      if (!schools.has(school)) problems.push(`Race ${race.id}: unknown school "${school}".`);
    }
    if (human && race !== human) problems.push(...raceBalanceProblems(race, human));
  }

  for (const ability of content.abilities) {
    const where = `Ability ${ability.id}`;
    if (ability.school && !schools.has(ability.school)) {
      problems.push(`${where}: unknown school "${ability.school}".`);
    }
    for (const key of Object.keys(ability.requirements)) {
      if (key.startsWith('affinity.') && !schools.has(key.slice('affinity.'.length))) {
        problems.push(`${where}: requirement on unknown school "${key}".`);
      }
    }
    if (ability.family !== 'magic') continue;
    if (ability.learnFrom.includes('practice')) {
      problems.push(`${where}: magic cannot be self-taught (R-28).`);
    }
    const tier = TIERS[tierOfPower(ability.requirements.power ?? 0)];
    const { damage = 0, areaRadius = 0, usesPerDay = 1 } = ability.effect;
    if (damage > tier.caps.maxDamage)
      problems.push(`${where}: damage ${damage} exceeds ${tier.id} cap ${tier.caps.maxDamage}.`);
    if (areaRadius > tier.caps.maxAreaRadius)
      problems.push(`${where}: area ${areaRadius} exceeds ${tier.id} cap.`);
    if (usesPerDay > tier.caps.maxUsesPerDay)
      problems.push(`${where}: ${usesPerDay} uses/day exceeds ${tier.id} cap.`);
  }

  for (const event of content.eventTypes) {
    if (event.templates.length === 0) problems.push(`Event type ${event.id} has no templates.`);
  }
  return problems;
}

/** Share of births at gifted tier or above, per race weights. */
export function giftedShare(race: RaceDef): number {
  const weights = BIRTH_TIER_IDS.map((id) => race.magicTierWeights[id]);
  const total = weights.reduce((a, b) => a + b, 0);
  const gifted = weights.slice(2).reduce((a, b) => a + b, 0);
  return total > 0 ? gifted / total : 0;
}

function physicalSum(race: RaceDef): number {
  return race.attributeMeans.strength + race.attributeMeans.agility + race.attributeMeans.endurance;
}

/** R-29: any race stronger than humans in magic or body must carry a downside. */
export function raceBalanceProblems(race: RaceDef, human: RaceDef): string[] {
  const stronger = giftedShare(race) > giftedShare(human) || physicalSum(race) > physicalSum(human);
  if (!stronger) return [];
  const downside =
    race.fertility < human.fertility ||
    race.maturityYears > human.maturityYears ||
    race.foodNeed > human.foodNeed ||
    race.dependencies.length > 0;
  return downside
    ? []
    : [`Race ${race.id} is stronger than humans but declares no downside (R-29).`];
}
