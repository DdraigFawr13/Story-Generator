// Content validation (§7.5): runs at startup and in tests. It enforces the
// design rules that must never drift: effect caps per tier (R-24), race
// balance (R-29) and no self-taught magic (R-28). Returns readable problems.

import type { ContentBundle, RaceDef } from './content-types';
import {
  ACTIVITIES,
  ROUTINE_PLACES,
  CULTURE_VALUES,
  DAY_BLOCKS,
  MAX_CREATURE_DANGER,
  PUNISHMENTS,
} from './content-types';
import { ATTRIBUTE_KEYS, GOODS, REGION_KINDS, SITE_KINDS } from './types';
import { BIRTH_TIER_IDS, TIERS, TIER_IDS, tierOfPower } from '../people/tiers';

/** Every event type needs this many template variants (§2B). */
const MIN_TEMPLATES = 3;
/** Placeholders the narrator fills for every event. */
/** No item may add more than this to a person's power (the scale ceiling, R-24). */
const MAX_ITEM_POWER = 20;
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
  problems.push(...dragonProblems(content));
  problems.push(...placeProblems(content));
  problems.push(...faithProblems(content));
  problems.push(...diseaseProblems(content));
  problems.push(...notableProblems(content));
  problems.push(...siteProblems(content));
  problems.push(...lifeProblems(content));
  problems.push(...workProblems(content));
  problems.push(...environmentProblems(content));
  problems.push(...healthProblems(content));
  problems.push(...familyProblems(content));
  problems.push(...societyProblems(content));
  problems.push(...threatsProblems(content));
  problems.push(...loreProblems(content));
  problems.push(...politicsProblems(content));
  problems.push(...lineageProblems(content));

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
  for (const [beat, variants] of Object.entries(content.playByPlay?.beats ?? {})) {
    if (variants.length === 0) problems.push(`Play-by-play beat "${beat}" has no variants.`);
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

/** Dragons (M5.6): a known creature, ranges that run low to high, tempers with weight, names to use. */
export function dragonProblems(content: ContentBundle): string[] {
  const rules = content.dragons;
  if (!rules) return ['Content has no dragon rules.'];
  const problems: string[] = [];
  if (!content.creatures.some((c) => c.id === rules.creatureId))
    problems.push(`Dragons: unknown creature "${rules.creatureId}".`);
  if (!(rules.firstBy >= 1)) problems.push('Dragons: firstBy must be at least 1.');
  if (!(rules.laterFirstBy >= 1)) problems.push('Dragons: laterFirstBy must be at least 1.');
  if (!(rules.maxAlive >= 1 && rules.cellsPerDragon >= 1))
    problems.push('Dragons: maxAlive and cellsPerDragon must be at least 1.');
  for (const key of ['successorGap', 'ageOnWaking'] as const) {
    const [low, high] = rules[key];
    if (low < 0 || low > high) problems.push(`Dragons: ${key} needs 0 <= min <= max.`);
  }
  if (rules.names.length === 0) problems.push('Dragons: no names.');
  if (new Set(rules.names).size !== rules.names.length) problems.push('Dragons: duplicate names.');
  if (rules.lairNames.length === 0 || rules.lairNames.some((n) => !n.includes('{name}')))
    problems.push('Dragons: every lair name needs {name}.');
  if (!rules.lairUnder.includes('{region}')) problems.push('Dragons: lairUnder needs {region}.');
  if (!rules.lairNear.includes('{near}')) problems.push('Dragons: lairNear needs {near}.');
  if (rules.tempers.length === 0) problems.push('Dragons: no tempers.');
  const seen = new Set<string>();
  for (const temper of rules.tempers) {
    const where = `Dragon temper ${temper.id}`;
    if (seen.has(temper.id)) problems.push(`Duplicate dragon temper "${temper.id}".`);
    seen.add(temper.id);
    if (!(temper.weight > 0)) problems.push(`${where}: weight must be above 0.`);
    if (!(temper.raidFactor >= 0)) problems.push(`${where}: raidFactor must not be negative.`);
    if (!(temper.burnChance >= 0 && temper.burnChance <= 1))
      problems.push(`${where}: burnChance must be 0-1.`);
    if (!temper.sleep !== !temper.wake) problems.push(`${where}: sleep and wake go together.`);
    for (const range of [temper.sleep, temper.wake]) {
      if (range && (range[0] < 1 || range[0] > range[1]))
        problems.push(`${where}: sleep and wake need 1 <= min <= max.`);
    }
  }
  for (const key of ['tributeShare', 'seekerMax'] as const) {
    if (!(rules[key] >= 0 && rules[key] <= 1)) problems.push(`Dragons: ${key} must be 0-1.`);
  }
  for (const temper of rules.tempers) {
    if (!(temper.courtAccept >= 0 && temper.courtAccept <= 1))
      problems.push(`Dragon temper ${temper.id}: courtAccept must be 0-1.`);
  }
  const court = rules.court;
  for (const key of [
    'answerChance',
    'bountyBase',
    'pactShare',
    'courtChance',
    'bountyTakeChance',
    'bountyAidShare',
  ] as const) {
    if (!(court[key] >= 0 && court[key] <= 1)) problems.push(`Dragon court: ${key} must be 0-1.`);
  }
  if (!(
    court.bountyRange[0] >= 0 &&
    court.bountyRange[0] <= court.bountyRange[1] &&
    court.bountyRange[1] <= 1
  ))
    problems.push('Dragon court: bountyRange needs 0 <= min <= max <= 1.');
  for (const key of ['courtRange', 'fearHarms', 'pactEvery', 'bountyCooldown'] as const) {
    if (!(court[key] >= 1)) problems.push(`Dragon court: ${key} must be at least 1.`);
  }
  for (const key of [
    'bountyPerWar',
    'bountyPerWealth',
    'bountyLegend',
    'grievanceUnleashed',
    'bountyAidCap',
    'bountyOdds',
    'unleashFactor',
    'bountyFame',
  ] as const) {
    if (!(court[key] >= 0)) problems.push(`Dragon court: ${key} must not be negative.`);
  }
  if (court.phrases.prices.length === 0) problems.push('Dragon court: no bounty prices.');
  return problems;
}

/** Faiths: one def per culture religion, valid values, unique schism names, numbers in range. */
export function faithProblems(content: ContentBundle): string[] {
  const rules = content.faiths;
  if (!rules) return ['Content has no faith rules.'];
  const problems: string[] = [];
  const values = CULTURE_VALUES as readonly string[];
  const religions = new Set(content.cultures.map((c) => c.religion.id));
  const seen = new Set<string>();
  const schisms = new Set<string>();
  for (const def of rules.defs) {
    const where = `Faith ${def.id}`;
    if (seen.has(def.id)) problems.push(`Duplicate faith "${def.id}".`);
    seen.add(def.id);
    if (!religions.has(def.id)) problems.push(`${where}: no culture has this religion.`);
    if (def.gods.length < 1) problems.push(`${where}: needs at least one god.`);
    if (def.priestTitle.trim() === '') problems.push(`${where}: no priest title.`);
    for (const v of [...def.sacred, def.abhors]) {
      if (!values.includes(v)) problems.push(`${where}: unknown value "${v}".`);
    }
    if (def.sacred[0] === def.sacred[1]) problems.push(`${where}: sacred values must differ.`);
    if (def.sacred.includes(def.abhors)) problems.push(`${where}: abhors a sacred value.`);
    if (def.schismNames.length < 2) problems.push(`${where}: needs at least 2 schism names.`);
    for (const name of def.schismNames) {
      if (schisms.has(name)) problems.push(`${where}: schism name "${name}" is used twice.`);
      schisms.add(name);
    }
  }
  for (const id of religions) {
    if (!seen.has(id)) problems.push(`Religion "${id}" has no faith def.`);
  }
  const chances = [
    'heresyChance',
    'holyConvert',
    'convertChance',
    'rulerConvertShare',
    'rulerConvertChance',
    'prophetChance',
  ] as const;
  for (const key of chances) {
    if (!(rules[key] >= 0 && rules[key] <= 1)) problems.push(`Faiths: ${key} must be 0-1.`);
  }
  if (!(rules.minZeal >= 0 && rules.minZeal <= 10)) problems.push('Faiths: minZeal must be 0-10.');
  if (!(rules.holyZeal >= 0 && rules.holyZeal <= 10))
    problems.push('Faiths: holyZeal must be 0-10.');
  for (const key of ['holyWeary', 'minorityBreakaway', 'sameFaithWar', 'sameFaithPact'] as const) {
    if (!(rules[key] > 0)) problems.push(`Faiths: ${key} must be above 0.`);
  }
  for (const key of ['heresyGrievance', 'desecrationGrievance', 'preachGrievance'] as const) {
    if (!(rules[key] >= 0)) problems.push(`Faiths: ${key} must be 0 or more.`);
  }
  if (!(Number.isInteger(rules.maxProphets) && rules.maxProphets >= 0))
    problems.push('Faiths: maxProphets must be a whole number, 0 or more.');
  for (const key of ['priest', 'prophet'] as const) {
    if (!(rules.fame[key] >= 0 && rules.fame[key] <= 100))
      problems.push(`Faiths: ${key} fame must be 0-100.`);
  }
  const acts = Object.values(rules.prophetActs);
  if (acts.some((w) => !(w >= 0)) || acts.every((w) => w === 0))
    problems.push('Faiths: prophet act weights need one above 0.');
  return problems;
}

/** Perilous places (M4.7): ranges run low to high, chances are 0-1, names fill, known creature and kinds. */
export function placeProblems(content: ContentBundle): string[] {
  const rules = content.places;
  if (!rules) return ['Content has no place rules.'];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const kind of rules.kinds) {
    const where = `Place kind ${kind.id}`;
    if (seen.has(kind.id)) problems.push(`Duplicate place kind "${kind.id}".`);
    seen.add(kind.id);
    if (kind.names.length === 0) problems.push(`${where}: no names.`);
    if (kind.guardians.length === 0) problems.push(`${where}: no guardians.`);
    if (!(kind.danger[0] >= 1 && kind.danger[0] <= kind.danger[1]))
      problems.push(`${where}: danger needs 1 <= min <= max.`);
    if (!(kind.finds[0] >= 0 && kind.finds[0] <= kind.finds[1]))
      problems.push(`${where}: finds needs 0 <= min <= max.`);
    for (const key of ['loreChance', 'treasureChance'] as const) {
      if (!(kind[key] >= 0 && kind[key] <= 1)) problems.push(`${where}: ${key} must be 0-1.`);
    }
    if (kind.names.some((n) => n.includes('{adj}')) && (kind.adjectives ?? []).length === 0)
      problems.push(`${where}: names use {adj} but there are no adjectives.`);
  }
  for (const id of [...rules.ancientKinds, 'barrow', 'lair', 'ruin', 'old-mine']) {
    if (!seen.has(id)) problems.push(`Places: unknown place kind "${id}".`);
  }
  if (new Set(rules.elderNames).size !== rules.elderNames.length)
    problems.push('Places: duplicate elder names.');
  if (!(rules.cellsPerAncient >= 1 && rules.ancientTries >= 1))
    problems.push('Places: cellsPerAncient and ancientTries must be at least 1.');
  const [reachLow, reachHigh] = rules.barrow.reach;
  if (!(reachLow >= 1 && reachLow <= reachHigh))
    problems.push('Places: barrow reach needs 1 <= min <= max.');
  const ex = rules.expedition;
  if (!(ex.partyMin >= 1 && ex.partyMin <= ex.partyMax))
    problems.push('Places: expedition party needs 1 <= partyMin <= partyMax.');
  for (const key of [
    'chance',
    'partyShare',
    'successBase',
    'successMax',
    'failLoss',
    'winLoss',
    'wakeDeadChance',
  ] as const) {
    if (!(ex[key] >= 0 && ex[key] <= 1)) problems.push(`Places: expedition ${key} must be 0-1.`);
  }
  for (const key of ['chance'] as const) {
    if (!(rules.barrow[key] >= 0 && rules.barrow[key] <= 1))
      problems.push(`Places: barrow ${key} must be 0-1.`);
  }
  if (!(rules.raidCarryOff >= 0 && rules.raidCarryOff <= 1))
    problems.push('Places: raidCarryOff must be 0-1.');
  if (!(rules.parts.craftChance >= 0 && rules.parts.craftChance <= 1))
    problems.push('Places: parts craftChance must be 0-1.');
  if (rules.parts.items.length === 0) problems.push('Places: no beast part items.');
  if (ex.treasureNames.length === 0 || ex.loreNames.length === 0)
    problems.push('Places: no names for finds.');
  if (!content.creatures.some((c) => c.id === ex.restlessDeadId))
    problems.push(`Places: unknown creature "${ex.restlessDeadId}".`);
  const sites = new Set<string>(SITE_KINDS);
  for (const kind of [...rules.ruinFrom, ...rules.mineSiteKinds]) {
    if (!sites.has(kind)) problems.push(`Places: unknown site kind "${kind}".`);
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
  const deeds = rules.deeds;
  const within = (name: string, value: number, min: number, max: number) => {
    if (!(value >= min && value <= max)) {
      problems.push(`Notables deeds.${name} ${value} is outside ${min}-${max}.`);
    }
  };
  within('vengeanceChance', deeds.vengeanceChance, 0, 1);
  within('legendFounds', deeds.legendFounds, 0, 1);
  within('championPower', deeds.championPower, 0, 20);
  for (const key of [
    'slayerRange',
    'vengeanceRange',
    'huntRange',
    'huntIdleYears',
    'foundingFame',
  ] as const) {
    within(key, deeds[key], 0, Infinity);
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
  'plunder_raid',
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
  'remarriage',
  'notable_died',
  'ruler_succeeded',
  'succession_disputed',
  'dynasty_founded',
  'oath_sworn',
  'legend_risen',
  'champion_fought',
  'legend_duel',
  'vengeance_raid',
  'legend_founded',
  'beast_hunt_failed',
  'beast_fought',
  'beast_roamed',
  'dragon_woke',
  'dragon_slept',
  'dragon_stirred',
  'dragon_tribute',
  'dragon_tribute_refused',
  'dragon_burned',
  'dragon_quest',
  'dragon_hoard_claimed',
  'dragon_pact',
  'dragon_bounty_set',
  'dragon_courted',
  'dragon_unleashed',
  'dragon_bounty_taken',
  'dragon_bounty_claimed',
  'item_hoarded',
  'artifact_made',
  'book_written',
  'item_inherited',
  'item_lost',
  'item_stolen',
  'item_found',
  'college_founded',
  'college_closed',
  'spell_cast',
  'city_freed',
  'civil_war_began',
  'throne_seized',
  'plot_struck',
  'plot_foiled',
  'legend_honoured',
  'seat_seized',
  'legend_betrayed',
  'legend_bribed',
  'bounty_set',
  'legend_hunted',
  'revolt_crushed',
  'realm_split',
  'dynasty_ended',
  'pact_sworn',
  'pact_broken',
  'ally_aided',
  'alliance_sworn',
  'ally_answered',
  'call_refused',
  'alliance_betrayed',
  'vassal_sworn',
  'vassal_revolt',
  'vassal_freed',
  'peace_by_marriage',
  'mage_went_to_study',
  'mage_came_home',
  'apprenticed',
  'apprentice_taken',
  'spell_mastered',
  'book_to_apprentice',
  'book_burned',
  'lore_lost',
  'lore_regained',
  'high_priest_named',
  'heresy_denounced',
  'site_converted',
  'ruler_converted',
  'prophet_rose',
  'holy_war_preached',
  'faith_schism',
  'faith_spread',
  'faith_forgotten',
  'holy_war_proclaimed',
  'temple_desecrated',
  'holy_city_taken',
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
  for (const id of rules.holds.races) {
    if (!raceIds.has(id)) problems.push(`Settlement holds: unknown race "${id}".`);
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
    'workshop',
    'wall',
  ]);
  const buildingIds = new Set<string>();
  const itemIds = new Set((content.items ?? []).map((i) => i.id));
  for (const b of rules.buildings) {
    if (buildingIds.has(b.id)) problems.push(`Site building ${b.id}: duplicate id.`);
    buildingIds.add(b.id);
    if (b.w < 1 || b.h < 1) problems.push(`Site building ${b.id}: bad size.`);
    for (const item of Object.keys(b.cost ?? {})) {
      if (!itemIds.has(item))
        problems.push(`Site building ${b.id}: cost names unknown item "${item}".`);
    }
    if (b.buildable && !(b.work && b.work > 0))
      problems.push(`Site building ${b.id}: buildable needs work.`);
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
  const routines = life.routines;
  const jobIds = new Set((content.jobs ?? []).map((j) => j.id));
  const places = ROUTINE_PLACES as readonly string[];
  for (const [name, weights] of Object.entries(routines.tables)) {
    for (const [place, w] of Object.entries(weights)) {
      if (!places.includes(place))
        problems.push(`Life routines.tables.${name}: unknown place "${place}".`);
      if (!(w >= 0))
        problems.push(`Life routines.tables.${name}.${place}: weight must be 0 or more.`);
    }
  }
  for (const key of ['smallChildUnder'] as const) {
    if (!(routines[key] > 0)) problems.push(`Life routines.${key} must be positive.`);
  }
  for (const key of ['childSmall', 'childOlder']) {
    if (!routines.tables[key]) problems.push(`Life routines.tables must include "${key}".`);
  }
  for (const [band, name] of Object.entries(routines.favouriteTable)) {
    if (!routines.tables[name])
      problems.push(`Life routines.favouriteTable.${band}: unknown table "${name}".`);
  }
  for (const [trait, weights] of Object.entries(routines.traitMul)) {
    if (!traitIds.has(trait)) problems.push(`Life routines.traitMul: unknown trait "${trait}".`);
    for (const place of Object.keys(weights)) {
      if (!places.includes(place))
        problems.push(`Life routines.traitMul.${trait}: unknown place "${place}".`);
    }
  }
  if (!traitIds.has(routines.eveningAlehouse.trait))
    problems.push(
      `Life routines.eveningAlehouse: unknown trait "${routines.eveningAlehouse.trait}".`,
    );
  const jobLists: [string, string[]][] = [
    ['alongJobs', routines.alongJobs],
    ['market.stallJobs', routines.market.stallJobs],
    ['market.foodJobs', routines.market.foodJobs],
    ['leave.jobBase', Object.keys(routines.leave.jobBase)],
  ];
  for (const [key, ids] of jobLists) {
    for (const id of ids) {
      if (!jobIds.has(id)) problems.push(`Life routines.${key}: unknown job "${id}".`);
    }
  }
  if (routines.market.every <= routines.market.offset)
    problems.push('Life routines.market: offset must be less than every.');
  return problems;
}

/** Items, jobs and the steward: unique ids, known abilities, items, goods, buildings and events. */
export function workProblems(content: ContentBundle): string[] {
  const { items, jobs, steward } = content;
  if (!items || !jobs || !steward) return ['Content has no work tables.'];
  const problems: string[] = [];
  const itemIds = new Set<string>();
  const abilityIds = new Set(content.abilities.map((a) => a.id));
  const covered = new Set<string>();
  for (const item of items) {
    if (itemIds.has(item.id)) problems.push(`Item ${item.id}: duplicate id.`);
    itemIds.add(item.id);
    if (!(GOODS as readonly string[]).includes(item.good))
      problems.push(`Item ${item.id}: unknown good "${item.good}".`);
    if (!(item.per > 0)) problems.push(`Item ${item.id}: per must be positive.`);
    for (const form of item.forms ?? []) covered.add(form);
    for (const effect of item.effects ?? []) {
      if (effect.kind === 'power' && effect.bonus > MAX_ITEM_POWER)
        problems.push(`Item ${item.id}: power bonus ${effect.bonus} is over ${MAX_ITEM_POWER}.`);
      if (effect.kind === 'ability' && !abilityIds.has(effect.abilityId))
        problems.push(`Item ${item.id}: unknown ability "${effect.abilityId}".`);
    }
  }
  const forms = [
    ...content.notables.artifactForms,
    ...Object.values(content.notables.bookForms).flat(),
  ];
  for (const form of forms) {
    if (!covered.has(form)) problems.push(`No item entry covers the form "${form}".`);
  }
  const jobIds = new Set<string>();
  for (const job of jobs) {
    if (jobIds.has(job.id)) problems.push(`Job ${job.id}: duplicate id.`);
    jobIds.add(job.id);
    if (job.skill !== undefined && !abilityIds.has(job.skill))
      problems.push(`Job ${job.id}: unknown skill "${job.skill}".`);
    for (const id of [...Object.keys(job.inputs ?? {}), ...Object.keys(job.outputs ?? {})]) {
      if (!itemIds.has(id)) problems.push(`Job ${job.id}: unknown item "${id}".`);
    }
  }
  for (const id of Object.keys(steward.materialTargets)) {
    if (!itemIds.has(id)) problems.push(`Steward materialTargets: unknown item "${id}".`);
  }
  const buildingIds = new Set(content.site.buildings.map((b) => b.id));
  for (const id of [steward.homeBuilding, steward.workshopBuilding]) {
    if (!buildingIds.has(id)) problems.push(`Steward: unknown building "${id}".`);
  }
  for (const [role, id] of Object.entries(steward.roles)) {
    if (!jobIds.has(id)) problems.push(`Steward roles.${role}: unknown job "${id}".`);
  }
  for (const [good, id] of Object.entries(steward.startItems)) {
    const item = items.find((i) => i.id === id);
    if (!item || item.good !== good)
      problems.push(`Steward startItems.${good}: "${id}" is not an item of that good.`);
  }
  for (const id of [...Object.keys(steward.repairCost)]) {
    if (!itemIds.has(id)) problems.push(`Steward repairCost: unknown item "${id}".`);
  }
  const traitIds = new Set(content.traits.map((t) => t.id));
  for (const job of jobs) {
    for (const trait of job.likedBy ?? []) {
      if (!traitIds.has(trait))
        problems.push(`Job ${job.id}: likedBy names unknown trait "${trait}".`);
    }
  }
  if (!traitIds.has(steward.envyTrait)) problems.push(`Steward: unknown envyTrait.`);
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const [key, id] of Object.entries(steward.events)) {
    if (!eventIds.has(id)) problems.push(`Steward events.${key}: unknown event type "${id}".`);
  }
  return problems;
}

/** Environment rules (M3.4): known event, item, memory and animal ids; food spoils at a sane rate. */
export function environmentProblems(content: ContentBundle): string[] {
  const env = content.environment;
  if (!env) return ['Content has no environment rules.'];
  const problems: string[] = [];
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const [key, id] of Object.entries(env.events)) {
    if (!eventIds.has(id)) problems.push(`Environment events.${key}: unknown event type "${id}".`);
  }
  const itemIds = new Set(content.items.map((i) => i.id));
  const mustHave = [env.firewood.item, env.spoilage.preserve.salt, env.spoilage.preserve.to];
  for (const id of [...mustHave, ...env.spoilage.preserve.from]) {
    if (!itemIds.has(id)) problems.push(`Environment: unknown item "${id}".`);
  }
  for (const item of content.items) {
    const rates = [item.spoilPerMonth, item.spoilPerDay];
    if (rates.some((r) => r !== undefined && !(r >= 0 && r <= 1)))
      problems.push(`Item ${item.id}: spoilage must be between 0 and 1.`);
    if (
      (item.spoilPerMonth !== undefined || item.spoilPerDay !== undefined) &&
      item.kind !== 'food'
    )
      problems.push(`Item ${item.id}: only food spoils.`);
  }
  const memoryIds = new Set(content.memories.map((m) => m.id));
  for (const id of [content.life.memoryOf.shortMeals, content.life.memoryOf.shortMealsHard]) {
    if (!memoryIds.has(id)) problems.push(`Life memoryOf: unknown memory "${id}".`);
  }
  const kinds = new Set(env.wild.animals.kinds.map((k) => k.id));
  for (const id of [
    ...env.wild.animals.fallback,
    ...Object.values(env.wild.animals.byBiome).flat(),
  ]) {
    if (!kinds.has(id)) problems.push(`Environment animals: unknown kind "${id}".`);
  }
  const { fieldYield, normalYearMargin, otherFoodShare } = env.crop;
  if (!(fieldYield > 0) || !(normalYearMargin > 0) || !(otherFoodShare >= 0 && otherFoodShare < 1))
    problems.push('Environment crop: need positive fieldYield and margin, otherFoodShare in 0-1.');
  if (!(env.meals.floor > 0 && env.meals.floor <= 1))
    problems.push('Environment meals: floor must be between 0 and 1.');
  return problems;
}

const INHERITANCE_RULES = [
  'all-children',
  'eldest-son',
  'eldest-child',
  'youngest-keeps-hearth',
  'sons-temple-tithe',
  'best-apprentice',
  'eldest-daughter',
] as const;

/** Interactions, opinions and family rules (M3.6): ids resolve, thresholds make hysteresis, every rule has its phrase. */
export function familyProblems(content: ContentBundle): string[] {
  const { interactions, social, family } = content;
  if (!interactions || !social || !family) return ['Content has no family tables.'];
  const problems: string[] = [];
  const memoryIds = new Set(content.memories.map((m) => m.id));
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  const traitIds = new Set(content.traits.map((t) => t.id));
  const memory = (where: string, id: string) => {
    if (!memoryIds.has(id)) problems.push(`${where}: unknown memory "${id}".`);
  };
  const event = (where: string, id: string) => {
    if (!eventIds.has(id)) problems.push(`${where}: unknown event type "${id}".`);
  };
  const trait = (where: string, id: string) => {
    if (!traitIds.has(id)) problems.push(`${where}: unknown trait "${id}".`);
  };
  const seen = new Set<string>();
  for (const def of interactions) {
    const where = `Interaction ${def.id}`;
    if (seen.has(def.id)) problems.push(`${where}: duplicate id.`);
    seen.add(def.id);
    if (!(def.weight > 0)) problems.push(`${where}: weight must be positive.`);
    if (def.memory?.target) memory(where, def.memory.target);
    if (def.memory?.actor) memory(where, def.memory.actor);
    for (const id of Object.keys(def.traitWeights ?? {})) trait(where, id);
  }
  if (!interactions.some((d) => d.id === 'chat'))
    problems.push('Interactions must include "chat".');
  if (!(social.perDay[0] >= 0 && social.perDay[0] <= social.perDay[1]))
    problems.push('Social perDay must be an ordered range from 0 up.');
  for (const id of [
    ...Object.keys(social.traitShift),
    social.grudge.hotTrait,
    ...social.grudge.forgiveTraits,
  ])
    trait('Social', id);
  for (const id of Object.keys(social.witnessed)) memory('Social witnessed', id);
  for (const id of Object.values(social.grudge.memoryOf)) memory('Social grudge', id);
  for (const id of Object.values(social.events)) event('Social events', id);
  const { friend, rival, enemy } = social.labels;
  if (!(friend.drop < friend.at))
    problems.push('Social labels: friend must be lost below where it is gained.');
  if (!(rival.drop > rival.at && enemy.drop > enemy.at && enemy.at < rival.at))
    problems.push(
      'Social labels: rival and enemy need hysteresis and the enemy line below the rival line.',
    );
  if (social.grudge.acts.length === 0)
    problems.push('Social grudge: needs at least one spiteful act.');
  memory('Family court', family.court.rejectedMemory);
  for (const id of Object.values(family.memoryOf)) memory('Family memoryOf', id);
  for (const id of Object.values(family.events)) event('Family events', id);
  for (const rule of INHERITANCE_RULES) {
    if (!family.inheritance[rule]) problems.push(`Family inheritance: no phrase for "${rule}".`);
  }
  for (const gift of ['none', 'bride-price', 'dowry'] as const) {
    if (!family.gifts[gift]) problems.push(`Family gifts: no phrase for "${gift}".`);
  }
  if (!(family.maxSpouses >= 1)) problems.push('Family maxSpouses must be at least 1.');
  return problems;
}

/** Society rules (M3.7): laws, holy days and rites name real cultures, religions, items, jobs, traits and ids. */
export function societyProblems(content: ContentBundle): string[] {
  const rules = content.society;
  if (!rules) return ['Content has no society tables.'];
  const problems: string[] = [];
  const known = (where: string, what: string, ok: boolean, id: string) => {
    if (!ok) problems.push(`${where}: unknown ${what} "${id}".`);
  };
  const cultures = new Set(content.cultures.map((c) => c.id));
  const religions = new Set(content.cultures.map((c) => c.religion.id));
  const items = new Set(content.items.map((i) => i.id));
  const memories = new Set(content.memories.map((m) => m.id));
  const events = new Set(content.eventTypes.map((e) => e.id));
  const traits = new Set(content.traits.map((t) => t.id));
  const conditions = new Set(content.conditions.map((c) => c.id));
  for (const law of rules.laws) {
    const where = `Law of ${law.cultureId}`;
    known(where, 'culture', cultures.has(law.cultureId), law.cultureId);
    for (const [crime, punishment] of Object.entries(law.punish)) {
      known(
        where,
        'punishment',
        (PUNISHMENTS as readonly string[]).includes(punishment),
        `${crime}: ${punishment}`,
      );
    }
    known(where, 'maximum', (PUNISHMENTS as readonly string[]).includes(law.max), law.max);
  }
  for (const id of cultures) {
    if (!rules.laws.some((l) => l.cultureId === id)) problems.push(`Society: no law for "${id}".`);
  }
  for (const f of rules.festivals) {
    const where = `Festival ${f.id}`;
    known(where, 'religion', religions.has(f.religionId), f.religionId);
    if (!(Number.isInteger(f.month) && f.month >= 0 && f.month <= 11))
      problems.push(`${where}: month must be 0-11.`);
    if (!(Number.isInteger(f.day) && f.day >= 1 && f.day <= 28))
      problems.push(`${where}: day must be 1-28.`);
  }
  for (const f of rules.funerals) {
    known(`Funeral rite`, 'religion', religions.has(f.religionId), f.religionId);
    for (const id of Object.keys(f.cost ?? {}))
      known(`Funeral rite ${f.religionId}`, 'item', items.has(id), id);
  }
  for (const id of Object.values(rules.memoryOf))
    known('Society memoryOf', 'memory', memories.has(id), id);
  for (const id of Object.values(rules.events))
    known('Society events', 'event type', events.has(id), id);
  known(
    'Society justice',
    'job',
    content.jobs.some((j) => j.id === rules.justice.labourJob),
    rules.justice.labourJob,
  );
  known('Society crime', 'trait', traits.has(rules.crime.murderTrait), rules.crime.murderTrait);
  for (const id of Object.keys(rules.crime.pilferTraits))
    known('Society pilferTraits', 'trait', traits.has(id), id);
  for (const id of rules.crime.brawlWounds)
    known('Society brawlWounds', 'condition', conditions.has(id), id);
  return problems;
}

/** Threat rules (M3.8): fractions in 0-1, signs for every great or legendary beast, known ids. */
export function threatsProblems(content: ContentBundle): string[] {
  const rules = content.threats;
  if (!rules) return ['Content has no threats tables.'];
  const problems: string[] = [];
  const known = (where: string, what: string, ok: boolean, id: string) => {
    if (!ok) problems.push(`${where}: unknown ${what} "${id}".`);
  };
  const fraction = (where: string, x: number) => {
    if (!(x >= 0 && x <= 1)) problems.push(`${where} must be 0-1, not ${x}.`);
  };
  const biomes = new Set(content.biomes.map((b) => b.id));
  const events = new Set(content.eventTypes.map((e) => e.id));
  const memories = new Set(content.memories.map((m) => m.id));
  const conditions = new Set(content.conditions.map((c) => c.id));
  const buildings = new Set(content.site.buildings.map((b) => b.id));
  fraction('Threats prowlers killShare', rules.prowlers.killShare);
  for (const kind of rules.prowlers.kinds) {
    for (const b of kind.biomes) known(`Prowler ${kind.id}`, 'biome', biomes.has(b), b);
    if (!(kind.danger > 0)) problems.push(`Prowler ${kind.id}: danger must be above 0.`);
  }
  for (const def of content.creatures) {
    if (def.tier !== 'beast' && (rules.beasts.signs[def.id] ?? []).length === 0)
      problems.push(`Threats: ${def.tier} creature "${def.id}" has no signs.`);
    if (!rules.beasts.glyphs[def.id]) problems.push(`Threats: creature "${def.id}" has no glyph.`);
  }
  const creatureIds = new Set(content.creatures.map((c) => c.id));
  for (const id of [...Object.keys(rules.beasts.signs), ...rules.beasts.fireBreath])
    known('Threats beasts', 'creature', creatureIds.has(id), id);
  fraction('Threats raids warnChance', rules.raids.warnChance);
  fraction('Threats raids retreatAt', rules.raids.retreatAt);
  fraction('Threats raids lootShare', rules.raids.lootShare);
  fraction('Threats raids bandShare', rules.raids.bandShare);
  fraction('Threats raids targetShare', rules.raids.targetShare);
  if (!(rules.combat.militiaOdds > 0)) problems.push('Threats combat militiaOdds must be above 0.');
  fraction('Threats combat fatigueBase', rules.combat.fatigueBase);
  fraction('Threats combat leavesAt', rules.combat.leavesAt);
  for (const [tier, x] of Object.entries(rules.combat.slainShare))
    fraction(`Threats combat slainShare ${tier}`, x);
  for (const id of Object.keys(rules.combat.woundShares))
    known('Threats woundShares', 'condition', conditions.has(id), id);
  if (rules.raids.band[0] > rules.raids.band[1])
    problems.push('Threats raids band must run low to high.');
  if (rules.beasts.warnDays[0] > rules.beasts.warnDays[1])
    problems.push('Threats beasts warnDays must run low to high.');
  if (rules.beasts.warnDays[0] <= rules.flight.judgeDaysAhead)
    problems.push('Threats beasts warnDays must start after flight judgeDaysAhead.');
  if (rules.compass.length !== 8) problems.push('Threats compass needs eight words.');
  known('Threats walls', 'building', buildings.has(rules.walls.building), rules.walls.building);
  for (const id of Object.values(rules.memoryOf))
    known('Threats memoryOf', 'memory', memories.has(id), id);
  for (const id of Object.values(rules.events))
    known('Threats events', 'event type', events.has(id), id);
  return problems;
}

/** Lore rules (M3.9): cantrips are known magic abilities; known event, memory and tier ids. */
export function loreProblems(content: ContentBundle): string[] {
  const rules = content.lore;
  if (!rules || !content.awakenings) return ['Content has no lore tables.'];
  const problems: string[] = [];
  const abilities = new Map(content.abilities.map((a) => [a.id, a]));
  const events = new Set(content.eventTypes.map((e) => e.id));
  const memories = new Set(content.memories.map((m) => m.id));
  const races = new Set(content.races.map((r) => r.id));
  const jobs = new Set(content.jobs.map((j) => j.id));
  for (const id of rules.cantrips) {
    const a = abilities.get(id);
    if (!a) problems.push(`Lore cantrips: unknown ability "${id}".`);
    else if (a.family !== 'magic') problems.push(`Lore cantrips: "${id}" is not a magic ability.`);
  }
  for (const id of Object.values(rules.events))
    if (!events.has(id)) problems.push(`Lore events: unknown event type "${id}".`);
  const dep = rules.dependencies;
  for (const id of [...Object.values(rules.memoryOf), dep.aura.memory, dep.ore.memory])
    if (!memories.has(id)) problems.push(`Lore memories: unknown memory "${id}".`);
  for (const id of [...dep.aura.races, ...dep.ore.races])
    if (!races.has(id)) problems.push(`Lore dependencies: unknown race "${id}".`);
  for (const id of dep.ore.jobs)
    if (!jobs.has(id)) problems.push(`Lore dependencies: unknown job "${id}".`);
  if (rules.knownAtEmbark < 0 || rules.knownAtEmbark > 1)
    problems.push('Lore knownAtEmbark must be 0-1.');
  for (const d of content.awakenings) {
    const tier = TIER_IDS.indexOf(d.maxFromTier);
    if (tier < 0 || tier >= TIER_IDS.indexOf('strong') + 1)
      problems.push(`Awakening ${d.id}: maxFromTier "${d.maxFromTier}" must be none to strong.`);
    if (d.monthlyChance < 0 || d.monthlyChance > 1)
      problems.push(`Awakening ${d.id}: monthlyChance must be 0-1.`);
  }
  return problems;
}

/** Politics rules (M3.10): known event types, items and goods; a title per government; sane ranges. */
export function politicsProblems(content: ContentBundle): string[] {
  const rules = content.politics;
  if (!rules) return ['Content has no politics tables.'];
  const problems: string[] = [];
  const events = new Set(content.eventTypes.map((e) => e.id));
  const items = new Map(content.items.map((i) => [i.id, i]));
  for (const id of Object.values(rules.events))
    if (!events.has(id)) problems.push(`Politics events: unknown event type "${id}".`);
  for (const culture of content.cultures) {
    if (!rules.leaderTitles[culture.government])
      problems.push(`Politics: no leader title for government "${culture.government}".`);
  }
  for (const [good, ids] of Object.entries(rules.caravans.carry)) {
    for (const id of ids) {
      const item = items.get(id);
      if (!item) problems.push(`Politics carry ${good}: unknown item "${id}".`);
      else if (item.good !== good)
        problems.push(`Politics carry ${good}: item "${id}" carries ${item.good}.`);
    }
  }
  const { share, seasons } = rules.caravans;
  if (!(share > 0 && share <= 1))
    problems.push(`Politics caravans share must be in (0, 1], not ${share}.`);
  if (seasons.length === 0 || seasons.some((x) => !(x >= 0 && x <= 3)))
    problems.push('Politics caravans seasons must be 0-3, at least one.');
  const chance = rules.succession.disputeChance;
  if (!(chance >= 0 && chance <= 1))
    problems.push(`Politics disputeChance must be 0-1, not ${chance}.`);
  return problems;
}

/** Spellbooks and lineages (M5.2): college spells name known magic abilities; numbers in range. */
export function lineageProblems(content: ContentBundle): string[] {
  const rules = content.history?.lineages;
  if (!rules) return ['Content has no lineage rules.'];
  const problems: string[] = [];
  const magic = new Set(content.abilities.filter((a) => a.family === 'magic').map((a) => a.id));
  for (const spell of content.history.colleges.spells) {
    if (spell.spells.length === 0) problems.push(`College spell ${spell.id}: names no spells.`);
    for (const id of spell.spells) {
      if (!magic.has(id))
        problems.push(`College spell ${spell.id}: unknown magic ability "${id}".`);
    }
  }
  const chances: [string, number][] = [
    ['learnChance', rules.learnChance],
    ['burnChance', rules.burnChance],
    ['legendApprenticeChance', rules.legendApprenticeChance],
    ['apprenticeShare', rules.apprenticeShare],
    ['elderMasterAge', rules.elderMasterAge],
  ];
  for (const [name, value] of chances) {
    if (!(value >= 0 && value <= 1)) problems.push(`Lineages ${name} must be 0-1, not ${value}.`);
  }
  const counts: [string, number][] = [
    ['minPower', rules.minPower],
    ['teacherPower', rules.teacherPower],
    ['maxApprentices', rules.maxApprentices],
    ['trainingYears', rules.trainingYears],
    ['lostPower', rules.lostPower],
  ];
  for (const [name, value] of counts) {
    if (!Number.isInteger(value) || value < 1)
      problems.push(`Lineages ${name} must be a whole number of 1 or more.`);
  }
  if (rules.oldLoreNames.length === 0) problems.push('Lineages oldLoreNames is empty.');
  return problems;
}

/** Health rules (M3.5): known condition, ailment, job, event and memory ids; sane ranges. */
export function healthProblems(content: ContentBundle): string[] {
  const rules = content.health;
  if (!rules || !content.conditions || !content.ailments) return ['Content has no health tables.'];
  const problems: string[] = [];
  const conditionIds = new Set<string>();
  for (const c of content.conditions) {
    if (conditionIds.has(c.id)) problems.push(`Condition ${c.id}: duplicate id.`);
    conditionIds.add(c.id);
    if (!(c.harm >= 0)) problems.push(`Condition ${c.id}: harm must be 0 or more.`);
    if (c.need && !content.needs.some((n) => n.id === c.need!.need))
      problems.push(`Condition ${c.id}: unknown need "${c.need.need}".`);
  }
  const known = (where: string, id: string) => {
    if (!conditionIds.has(id)) problems.push(`${where}: unknown condition "${id}".`);
  };
  for (const a of content.ailments) {
    known(`Ailment ${a.id}`, a.conditionId);
    for (const id of Object.keys(a.sources.condition ?? {})) known(`Ailment ${a.id} source`, id);
    if (a.duration[0] > a.duration[1] || a.peak[0] > a.peak[1])
      problems.push(`Ailment ${a.id}: ranges must run low to high.`);
  }
  for (const id of rules.woundTiers) known('Health woundTiers', id);
  for (const id of rules.chronic.conditions) known('Health chronic', id);
  for (const id of [
    rules.exhaustedCondition,
    rules.festering.condition,
    rules.frailty.condition,
    rules.disease.condition,
    rules.oldWound.condition,
  ]) {
    known('Health', id);
  }
  const eventIds = new Set(content.eventTypes.map((e) => e.id));
  for (const [key, id] of Object.entries(rules.events)) {
    if (!eventIds.has(id)) problems.push(`Health events.${key}: unknown event type "${id}".`);
  }
  if (!content.memories.some((m) => m.id === rules.griefMemory))
    problems.push(`Health: unknown memory "${rules.griefMemory}".`);
  if (!content.jobs.some((j) => j.id === content.steward.roles.heal))
    problems.push('Health: the steward has no healer job.');
  if (!(rules.patientsPerHealer >= 1))
    problems.push('Health: patientsPerHealer must be 1 or more.');
  const shares = rules.woundTiers.reduce(
    (sum, id) => sum + (content.conditions.find((c) => c.id === id)?.wound?.share ?? 0),
    0,
  );
  if (shares !== 100) problems.push(`Health: wound shares add to ${shares}, not 100.`);
  return problems;
}
