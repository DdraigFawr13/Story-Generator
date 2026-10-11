// Content validation (§7.5): runs at startup and in tests. It enforces the
// design rules that must never drift: effect caps per tier (R-24), race
// balance (R-29) and no self-taught magic (R-28). Returns readable problems.

import type { ContentBundle, RaceDef } from './content-types';
import { CULTURE_VALUES } from './content-types';
import { ATTRIBUTE_KEYS, REGION_KINDS } from './types';
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
    'culture',
    content.cultures.map((c) => c.id),
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

  unique(
    'biome',
    content.biomes.map((b) => b.id),
  );
  unique(
    'resource',
    content.resources.map((r) => r.id),
  );
  problems.push(...worldgenContentProblems(content));

  const schools = new Set(content.schools.map((s) => s.id));
  const biomeIds = new Set(content.biomes.map((b) => b.id));
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
    for (const biome of race.preferredBiomes) {
      if (!biomeIds.has(biome)) problems.push(`Race ${race.id}: unknown biome "${biome}".`);
    }
    if (human && race !== human) problems.push(...raceBalanceProblems(race, human));
  }

  problems.push(...cultureProblems(content));
  problems.push(...settlementProblems(content));

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

/** Cultures: known race and biomes, complete 0-10 values, filled name lists, a culture per race. */
export function cultureProblems(content: ContentBundle): string[] {
  const problems: string[] = [];
  const raceIds = new Set(content.races.map((r) => r.id));
  const biomeIds = new Set(content.biomes.map((b) => b.id));
  for (const culture of content.cultures) {
    const where = `Culture ${culture.id}`;
    if (!raceIds.has(culture.raceId)) problems.push(`${where}: unknown race "${culture.raceId}".`);
    for (const b of culture.preferredBiomes) {
      if (!biomeIds.has(b)) problems.push(`${where}: unknown biome "${b}".`);
    }
    for (const key of CULTURE_VALUES) {
      const value = culture.values[key];
      if (!Number.isInteger(value) || value < 0 || value > 10) {
        problems.push(`${where}: value "${key}" must be an integer 0-10, got ${value}.`);
      }
    }
    for (const [key, list] of Object.entries(culture.names)) {
      if (list.length === 0) problems.push(`${where}: name list "${key}" is empty.`);
    }
  }
  for (const race of content.races) {
    if (!content.cultures.some((c) => c.raceId === race.id)) {
      problems.push(`Race ${race.id} has no culture.`);
    }
  }
  return problems;
}

/** Settlement rules: present, capitalKind keys are culture ids, a civ name template per government used. */
export function settlementProblems(content: ContentBundle): string[] {
  const rules = content.settlement;
  if (!rules) return ['Content has no settlement rules.'];
  const problems: string[] = [];
  const cultureIds = new Set(content.cultures.map((c) => c.id));
  for (const id of Object.keys(rules.capitalKind)) {
    if (!cultureIds.has(id)) problems.push(`Settlement capitalKind: unknown culture "${id}".`);
  }
  for (const culture of content.cultures) {
    if (!rules.civNames[culture.government]?.includes('{n}')) {
      problems.push(`Settlement civNames: no template with {n} for "${culture.government}".`);
    }
  }
  if (rules.civs.min < 1 || rules.civs.min > rules.civs.max) {
    problems.push('Settlement civs: need 1 <= min <= max.');
  }
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const id of ['civ_founded', 'site_founded']) {
    if (!eventIds.has(id)) problems.push(`Settlement needs event type "${id}".`);
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

/** Biome table and resource checks: complete table, known ids, Uint8-sized biome list. */
function worldgenContentProblems(content: ContentBundle): string[] {
  const problems: string[] = [];
  const { biomes, biomeRules: rules, resources } = content;
  const ids = new Set(biomes.map((b) => b.id));
  if (biomes.length > 255) problems.push(`Too many biomes (${biomes.length}); the limit is 255.`);
  if (biomes[0]?.water !== 'sea' || biomes[1]?.water !== 'coast') {
    problems.push('Biomes 0 and 1 must be the sea biomes (ocean, coast).');
  }
  for (const water of ['sea', 'coast', 'lake'] as const) {
    if (!biomes.some((b) => b.water === water)) problems.push(`No "${water}" water biome.`);
  }
  for (const id of ['alpine', 'swamp']) {
    if (!ids.has(id)) problems.push(`Biome rules need an "${id}" biome.`);
  }
  for (const biome of biomes) {
    for (const key of ['fertility', 'wildness'] as const) {
      if (biome[key] < 0 || biome[key] > 100) {
        problems.push(`Biome ${biome.id}: ${key} ${biome[key]} is outside 0-100.`);
      }
    }
    if (!biome.water && !(biome.travel >= 1 && biome.travel <= 100)) {
      problems.push(`Biome ${biome.id}: travel ${biome.travel} must be 1-100 for land biomes.`);
    }
  }
  const ascending = (values: number[]) => values.every((v, i) => i === 0 || v > values[i - 1]!);
  if (!ascending(rules.temperatureBands)) problems.push('Temperature bands must ascend.');
  if (!ascending(rules.rainfallBands)) problems.push('Rainfall bands must ascend.');
  const rows = rules.temperatureBands.length + 1;
  const columns = rules.rainfallBands.length + 1;
  if (rules.table.length !== rows) {
    problems.push(`Biome table has ${rules.table.length} rows, expected ${rows}.`);
  }
  rules.table.forEach((row, t) => {
    if (row.length !== columns) {
      problems.push(`Biome table row ${t} has ${row.length} entries, expected ${columns}.`);
    }
    for (const id of row) {
      const biome = biomes.find((b) => b.id === id);
      if (!biome) problems.push(`Biome table row ${t}: unknown biome "${id}".`);
      else if (biome.water) problems.push(`Biome table row ${t}: "${id}" is a water biome.`);
    }
  });
  for (const id of [...rules.frostFree.biomes, ...Object.values(rules.frostFree.fallback)]) {
    if (!ids.has(id)) problems.push(`Frost-free rule: unknown biome "${id}".`);
  }
  for (const id of rules.frostFree.biomes) {
    if (!rules.frostFree.fallback[id]) problems.push(`Frost-free biome "${id}" has no fallback.`);
  }
  for (const resource of resources) {
    for (const id of resource.biomes ?? []) {
      if (!ids.has(id)) problems.push(`Resource ${resource.id}: unknown biome "${id}".`);
    }
    if (resource.maxCellShare <= 0 || resource.maxCellShare > 1) {
      problems.push(`Resource ${resource.id}: maxCellShare must be in (0, 1].`);
    }
  }
  problems.push(...nameProblems(content));
  return problems;
}

/** Name tables: every syllable list filled, and a pattern for each region kind (plus "ocean"). */
function nameProblems(content: ContentBundle): string[] {
  const problems: string[] = [];
  const { names } = content;
  for (const key of ['starts', 'middles', 'ends', 'adjectives'] as const) {
    if (names[key].length === 0) problems.push(`Name table "${key}" is empty.`);
  }
  for (const kind of [...REGION_KINDS, 'ocean']) {
    if (!names.patterns[kind]?.length) problems.push(`No name patterns for "${kind}".`);
  }
  return problems;
}
