// Content validation (§7.5): runs at startup and in tests. It enforces the
// design rules that must never drift: effect caps per tier (R-24), race
// balance (R-29) and no self-taught magic (R-28). Returns readable problems.

import type { ContentBundle, RaceDef } from './content-types';
import { ACTIVITIES, CULTURE_VALUES, DAY_BLOCKS, MAX_CREATURE_DANGER } from './content-types';
import { ATTRIBUTE_KEYS, GOODS, REGION_KINDS } from './types';
import { BIRTH_TIER_IDS, TIERS, tierOfPower } from '../people/tiers';

/** Every event type needs this many template variants (§2B). */
const MIN_TEMPLATES = 3;
/** Placeholders the narrator fills for every event. */
const ALWAYS_KEYS = ['date', 'year', 'actor', 'actor2', 'actor3'];

function templateKeys(template: string | undefined): string[] {
  return [...(template ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

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
  problems.push(...creatureProblems(content));
  problems.push(...diseaseProblems(content));
  problems.push(...notableProblems(content));
  problems.push(...siteProblems(content));
  problems.push(...lifeProblems(content));

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
    else if (event.templates.length < MIN_TEMPLATES)
      problems.push(`Event type ${event.id} has under ${MIN_TEMPLATES} templates.`);
    // Variants may print only keys the first one prints (plus the always-present ones), so every
    // variant fits the same event data.
    const allowed = new Set([
      ...ALWAYS_KEYS,
      ...(event.dataKeys ?? []),
      ...templateKeys(event.templates[0]),
    ]);
    event.templates.forEach((template, index) => {
      for (const key of templateKeys(template)) {
        if (!allowed.has(key))
          problems.push(`Event type ${event.id} template ${index + 1} uses unknown key {${key}}.`);
      }
    });
    // A title may use the keys the first template prints, the declared data keys and the always-on
    // keys, so it can be filled from any event of the type (a missing value just drops its clause).
    for (const key of templateKeys(event.title)) {
      if (!allowed.has(key))
        problems.push(`Event type ${event.id} title uses unknown key {${key}}.`);
    }
    if (event.causeWord !== undefined && event.causeWord.trim() === '')
      problems.push(`Event type ${event.id} has an empty causeWord.`);
  }
  const typeIds = new Set(content.eventTypes.map((e) => e.id));
  for (const group of content.typeGroups ?? []) {
    for (const type of group.types) {
      if (!typeIds.has(type))
        problems.push(`Event type group ${group.id} names unknown event type "${type}".`);
    }
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

/** Creatures: unique ids, known biomes, danger within R-24, sane numbers and a name to use. */
export function creatureProblems(content: ContentBundle): string[] {
  const problems: string[] = [];
  const biomeIds = new Set(content.biomes.map((b) => b.id));
  const seen = new Set<string>();
  for (const def of content.creatures) {
    const where = `Creature ${def.id}`;
    if (seen.has(def.id)) problems.push(`Duplicate creature id "${def.id}".`);
    seen.add(def.id);
    if (!(def.danger >= 1 && def.danger <= MAX_CREATURE_DANGER)) {
      problems.push(
        `${where}: danger ${def.danger} must be 1-${MAX_CREATURE_DANGER} soldiers (R-24).`,
      );
    }
    if (def.biomes.length === 0) problems.push(`${where}: no biomes.`);
    for (const b of def.biomes) {
      if (!biomeIds.has(b)) problems.push(`${where}: unknown biome "${b}".`);
    }
    if (!(def.minWildness >= 0 && def.minWildness <= 100)) {
      problems.push(`${where}: minWildness ${def.minWildness} is outside 0-100.`);
    }
    if (def.lifespan[0] < 1 || def.lifespan[0] > def.lifespan[1]) {
      problems.push(`${where}: lifespan needs 1 <= min <= max.`);
    }
    if (def.maxAlive < 1) problems.push(`${where}: maxAlive must be at least 1.`);
    if (def.names.length === 0) problems.push(`${where}: no names.`);
  }
  return problems;
}

/** Diseases: unique ids, an existing event type, and sane ranges. */
export function diseaseProblems(content: ContentBundle): string[] {
  const problems: string[] = [];
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  const seen = new Set<string>();
  for (const def of content.diseases) {
    const where = `Disease ${def.id}`;
    if (seen.has(def.id)) problems.push(`Duplicate disease id "${def.id}".`);
    seen.add(def.id);
    if (!eventIds.has(def.event)) problems.push(`${where}: unknown event type "${def.event}".`);
    const share = (v: number) => v >= 0 && v <= 1;
    if (!share(def.infectivity)) problems.push(`${where}: infectivity must be 0-1.`);
    if (!share(def.outbreak)) problems.push(`${where}: outbreak must be 0-1.`);
    if (!(share(def.severity[0]) && share(def.severity[1]) && def.severity[0] <= def.severity[1])) {
      problems.push(`${where}: severity needs 0 <= min <= max <= 1.`);
    }
    if (def.ageRisk.child < 0 || def.ageRisk.adult < 0 || def.ageRisk.elder < 0) {
      problems.push(`${where}: ageRisk multipliers cannot be negative.`);
    }
    if (def.minPop < 1) problems.push(`${where}: minPop must be at least 1.`);
    if (def.immunityYears < 0) problems.push(`${where}: immunityYears cannot be negative.`);
    if (def.incubation < 0 || def.duration < 0) problems.push(`${where}: negative days.`);
  }
  return problems;
}

/** Notable rules: a dynasty pattern per culture, forms to draw from, and chances between 0 and 1. */
export function notableProblems(content: ContentBundle): string[] {
  const rules = content.notables;
  if (!rules) return ['Content has no notable rules.'];
  const problems: string[] = [];
  for (const culture of content.cultures) {
    if (!rules.dynastyNames[culture.id]?.includes('{name}')) {
      problems.push(`Notables dynastyNames: no pattern with {name} for culture "${culture.id}".`);
    }
  }
  const lists: [string, string[] | undefined][] = [
    ['artifactForms', rules.artifactForms],
    ['artifactEpithets', rules.artifactEpithets],
    ['artifactNames', rules.artifactNames],
    ['bookNames', rules.bookNames],
    ['bookForms.mundane', rules.bookForms.mundane],
  ];
  for (const [name, list] of lists) {
    if (!list || list.length === 0) problems.push(`Notables ${name} is empty.`);
  }
  for (const [school, forms] of Object.entries(rules.bookForms)) {
    if (forms.length === 0) problems.push(`Notables bookForms.${school} is empty.`);
  }
  const chances = [
    'adultDeath',
    'childDeath',
    'famineDeath',
    'diseaseDeath',
    'beastKill',
    'raidKill',
    'raidStealChance',
    'raiderChance',
    'razeDeathShare',
    'captainDeath',
    'captainDeathWin',
    'marryChance',
    'allianceChance',
    'allianceGrievanceCut',
    'extraSpouseChance',
    'childChance',
    'mageNotice',
    'legendChance',
    'disputeChance',
    'artifactChance',
    'bookChance',
    'scholarChance',
    'itemToRulerChance',
    'itemFindChance',
  ] as const;
  for (const key of chances) {
    if (!(rules[key] >= 0 && rules[key] <= 1)) {
      problems.push(`Notables ${key} ${rules[key]} is outside 0-1.`);
    }
  }
  return problems;
}

/** Event types the settle and history stages emit; content must define them. */
const HISTORY_EVENT_IDS = [
  'civ_founded',
  'site_founded',
  'bad_harvest',
  'famine',
  'plague',
  'migration',
  'site_grew',
  'site_abandoned',
  'civ_fell',
  'beast_appeared',
  'beast_raid',
  'beast_slain',
  'trade_opened',
  'grain_relief',
  'civ_raid',
  'border_clash',
  'insult',
  'war_declared',
  'battle',
  'site_conquered',
  'site_razed',
  'peace_made',
  'dry_years_began',
  'dry_years_ended',
  'cold_years_began',
  'cold_years_ended',
  'year_summary',
  'notable_born',
  'mage_born',
  'marriage',
  'notable_died',
  'ruler_succeeded',
  'succession_disputed',
  'dynasty_founded',
  'oath_sworn',
  'legend_risen',
  'artifact_made',
  'book_written',
  'item_inherited',
  'item_lost',
  'item_stolen',
  'item_found',
];

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
  const raceIds = new Set(content.races.map((r) => r.id));
  for (const key of ['raceAura', 'raceWithout', 'raceFeature'] as const) {
    for (const id of Object.keys(rules.capacity[key])) {
      if (!raceIds.has(id)) problems.push(`Settlement capacity.${key}: unknown race "${id}".`);
    }
  }
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const id of HISTORY_EVENT_IDS) {
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
    if (resource.good !== undefined && !(GOODS as readonly string[]).includes(resource.good)) {
      problems.push(`Resource ${resource.id}: unknown good "${resource.good}".`);
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

/** Live-site rules: present, layer lists start with "none", building sizes and event ids are sane. */
export function siteProblems(content: ContentBundle): string[] {
  const rules = content.site;
  if (!rules) return ['Content has no site rules.'];
  const problems: string[] = [];
  if (!(rules.mapSize > 0) || !(rules.tilesPerCell > 0) || !(rules.followCap > 0)) {
    problems.push('Site rules need positive mapSize, tilesPerCell and followCap.');
  }
  const [lo, hi] = rules.outpost.settlers;
  if (lo < 1 || lo > hi) problems.push('Site outpost settlers: need 1 <= min <= max.');
  const need = (kind: string, list: { id: string }[], ids: string[]) => {
    for (const id of ids) {
      if (!list.some((entry) => entry.id === id)) problems.push(`Site ${kind} needs "${id}".`);
    }
  };
  need('terrains', rules.terrains, [
    'grass',
    'scrub',
    'marsh',
    'shore',
    'rock',
    'field',
    'path',
    'floor',
    'wall',
  ]);
  need('waters', rules.waters, ['none', 'river', 'sea', 'lake']);
  need('trees', rules.trees, ['none', 'broadleaf', 'conifer']);
  need('minerals', rules.minerals, ['none', 'stone', 'ore', 'clay']);
  need('buildings', rules.buildings, [
    'hall',
    'home',
    'well',
    'stockpile',
    'shrine',
    'field',
    'dock',
  ]);
  for (const b of rules.buildings) {
    if (b.w < 1 || b.h < 1) problems.push(`Site building ${b.id}: bad size.`);
  }
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  if (!eventIds.has('outpost_founded'))
    problems.push('Site rules need event type "outpost_founded".');
  for (const [category, ids] of Object.entries(rules.autoPause)) {
    for (const id of ids) {
      if (!eventIds.has(id))
        problems.push(`Site autoPause.${category}: unknown event type "${id}".`);
    }
  }
  return problems;
}

const REQUIRED_NEEDS = ['food', 'water', 'rest', 'warmth', 'safety', 'companionship', 'purpose'];

/** Daily-life tables: need ids, memory and event references, trait exclusions, schedule activities. */
export function lifeProblems(content: ContentBundle): string[] {
  const { needs, traits, memories, life } = content;
  if (!needs || !traits || !memories || !life) return ['Content has no daily-life tables.'];
  const problems: string[] = [];
  const needIds = new Set<string>();
  for (const need of needs) {
    if (needIds.has(need.id)) problems.push(`Need ${need.id}: duplicate id.`);
    needIds.add(need.id);
    if (!(need.lowAt > 0)) problems.push(`Need ${need.id}: lowAt must be positive.`);
    for (const activity of Object.keys(need.restore)) {
      if (!(ACTIVITIES as readonly string[]).includes(activity))
        problems.push(`Need ${need.id}: restore names unknown activity "${activity}".`);
    }
  }
  for (const id of REQUIRED_NEEDS) {
    if (!needIds.has(id)) problems.push(`Needs must include "${id}".`);
  }
  const memoryIds = new Set(memories.map((m) => m.id));
  for (const [key, id] of Object.entries(life.memoryOf)) {
    if (!memoryIds.has(id)) problems.push(`Life memoryOf.${key}: unknown memory "${id}".`);
  }
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const [key, id] of Object.entries(life.events)) {
    if (!eventIds.has(id)) problems.push(`Life events.${key}: unknown event type "${id}".`);
  }
  const traitIds = new Set(traits.map((t) => t.id));
  for (const trait of traits) {
    for (const other of trait.excludes) {
      if (!traitIds.has(other))
        problems.push(`Trait ${trait.id}: excludes unknown trait "${other}".`);
    }
    for (const need of Object.keys(trait.needRates ?? {})) {
      if (!needIds.has(need))
        problems.push(`Trait ${trait.id}: needRates names unknown need "${need}".`);
    }
  }
  const valid = (activity: string) => (ACTIVITIES as readonly string[]).includes(activity);
  for (const [band, blocks] of Object.entries(life.schedule)) {
    for (const block of DAY_BLOCKS) {
      if (!valid(blocks[block]))
        problems.push(`Life schedule.${band}.${block}: unknown activity "${blocks[block]}".`);
    }
  }
  for (const [key, activity] of Object.entries(life.restDayAfternoon)) {
    if (!valid(activity))
      problems.push(`Life restDayAfternoon.${key}: unknown activity "${activity}".`);
  }
  return problems;
}
