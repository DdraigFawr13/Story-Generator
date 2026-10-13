// Weather, crops, stores, firewood, fire and wild land at the watched site (M3.4). The engine in
// engine/site/{weather,crops,fire,wild}.ts reads only these tables; add a number or a chronicle
// type here, not an engine special case. Months are 0-11 (Thawmonth is 0, Goldmonth 4).

import type { EnvironmentRules, EventTypeDef } from '../engine';

export const ENVIRONMENT: EnvironmentRules = {
  weather: {
    // A day's temperature is the seasonal curve plus a slow swing: 85% of yesterday's, plus about +-1.6 degrees.
    anomalyKeep: 0.85,
    anomalySd: 1.6,
    // The night is 4 degrees colder than the day.
    nightBelow: 4,
    // A hard winter is 5 degrees colder from Firstfrost to Lastsnow, and 4 colder in Thawmonth and Seedmonth after.
    hardWinter: { months: [8, 11], offsetC: -5, carryMonths: [0, 1], carryOffsetC: -4 },
    // A drought year is 2 degrees warmer from Bloommonth to Harvestmonth.
    drought: { months: [2, 5], offsetC: 2 },
    // Rain falls on rainfall/1400 of days (12% to 60%); a drought year has a fifth as much from Bloommonth to Leaffall.
    rain: { perMm: 1 / 1400, min: 0.12, max: 0.6, droughtMonths: [2, 6], droughtMul: 0.2 },
    // Wet days at 1 degree or colder bring snow.
    snowAtC: 1,
    // A storm on 3.5% of days at storm risk 100.
    stormPerRisk: 0.035,
    // Snow or a storm costs 30% more warmth outdoors.
    outdoorExtraLoss: 0.3,
    // Day length swings 8 hours from 12 at 90 degrees of latitude; outdoor work stops under 9 hours.
    daylight: { swingPerDegree: 8 / 90, outdoorMinHours: 9, indoor: ['workshop', 'kitchen'] },
    // 20 dry days in spring or summer is a dry spell; 30 dry days sink a well with no river or sea near.
    drySpell: { days: 20, months: [1, 6] },
    wellLowDays: 30,
    // A frost on the crops is reported once a week at most.
    frostEventGap: 7,
    // Snow from Firstfrost on is the winter's first.
    winterFrom: 8,
    // Lying snow banks at most a fortnight's melt, so a thaw clears it in about five days.
    snowMeltCap: 14,
  },
  crop: {
    // Sow in Seedmonth and Bloommonth once the day reaches 6 degrees.
    sowMonths: [1, 2],
    sowMinC: 6,
    // Cut in Goldmonth and Harvestmonth.
    harvestMonths: [4, 5],
    // Crops not ripe by Deepwinter wither.
    witherMonth: 9,
    // A normal year leaves a small surplus: harvest and wild food are 115% of the people's year.
    normalYearMargin: 1.15,
    // Fish, game and berries are expected to give 15% of that.
    otherFoodShare: 0.15,
    // A healthy field of 7x5 tiles gives about this many meals (13 people's year).
    fieldYield: 4800,
    // Poor soil costs yield: 70% at soil 0, 100% at soil 100.
    soilFloor: 0.7,
    // Fields reach the harvest at about 95% health in a normal year.
    expectedHealth: 0.95,
    // One farmer tends each growing field.
    tendersPerField: 1,
    // Seed is 8% of a field's expected grain.
    seedShare: 0.08,
    // Once anyone starves, the seed corn is food: a town no longer dies beside next year's sowing.
    seedOpenCondition: 'starving',
    // Four farmers sow a field in about 3 days (6.4 work a day), and cut it in about 2.
    sowWork: 18,
    cutWork: 11,
    // About 70 warm days to ripen.
    growthDays: 70,
    // No growth at 4 degrees, full growth at 11, half above 30.
    growBelowC: 4,
    growSpanC: 7,
    heatAboveC: 30,
    // Young grain shows as sprouts for the first 15% of growth.
    sproutAt: 0.15,
    // Water runs short after 12 dry days (6 in a drought year).
    dryDays: 12,
    droughtDryDays: 6,
    // A field within 8 tiles of water holds up in a dry spell.
    nearWaterTiles: 8,
    // Near water: 80% growth and 0.3% health a day lost; far: 50% and 0.9%.
    waterNear: { growth: 0.8, healthLoss: 0.003 },
    waterFar: { growth: 0.5, healthLoss: 0.009 },
    // Low-lying fields freeze up to 1.5 degrees sooner than high ones, so a light frost bites only some.
    frostSpread: 1.5,
    // A night of -3 degrees bites young grain (8% health); -5 ruins ripe grain still standing.
    frostC: -3,
    frostHealth: 0.06,
    ruinC: -5,
    // 15% of fields lose 8% health on a storm day.
    stormChance: 0.15,
    stormHealth: 0.08,
    // A growing field not worked for 10 days loses 0.3% health a day; ripe grain left standing 0.4%.
    untendedDays: 10,
    untendedLoss: 0.003,
    ripeLoss: 0.004,
    // Each harvest takes 3 soil; a field left bare all year gets 3 back.
    soilPerHarvest: 3,
    soilRecover: 3,
    // A harvest of 85% of a normal year or more is fair.
    fairShare: 0.85,
  },
  spoilage: {
    // Food spoils half as fast in frost and half as fast again in heat.
    warmAboveC: 18,
    warmMul: 1.5,
    coldBelowC: 0,
    coldMul: 0.5,
    // A month with over 300 meals spoiled is a chronicle line.
    reportAbove: 300,
    // Cooks smoke or salt fish and game with salt in store: 1 salt for 10 items, up to 12 items a block.
    preserve: {
      salt: 'salt',
      itemsPerSalt: 10,
      perBlock: 12,
      from: ['fish', 'game'],
      to: 'preserved',
    },
  },
  meals: {
    // The steward weighs the stores against the next harvest on the first of each month.
    planEveryDays: 28,
    harvestMonth: 4,
    // Never under two thirds of a meal; a projection over 97% counts as full meals.
    floor: 0.67,
    roundUpAbove: 0.97,
    // Under three quarters is the harder memory.
    hardBelow: 0.75,
  },
  firewood: {
    item: 'logs',
    // Homes burn logs on days under 12 degrees...
    burnBelowC: 12,
    // ...a quarter log at 0 degrees (about 1,200 logs a winter for 45 homes).
    logsPerHomeDay: 0.25,
    // A home out of logs loses warmth indoors three times as fast.
    coldHomeMul: 3,
    // Until a winter has been counted, a followed home is expected to burn 27 logs.
    expectedWinterPerHome: 27,
    // Leaffall to Lastsnow.
    winterMonths: [6, 11],
    // Reserve and the steward's log target = last winter's burn + 300 for building (review 9).
    buildingLogs: 300,
    headroom: 0,
  },
  fire: {
    // A lit hearth on a day under 5 degrees: about one fire every one to two years at 150 people.
    hearthBelowC: 5,
    hearthFireChance: 0.00004,
    // One storm in twelve strikes something that burns.
    lightningChance: 0.08,
    // A burning tile lights each burnable neighbour at 25% a block, times dryness and fuel.
    spreadBase: 0.25,
    dry: { days: 20, mul: 1.6 },
    rainMul: 0.3,
    snowMul: 0.15,
    // A tile burns 2 to 4 blocks.
    burnBlocks: [2, 4],
    // Ten fighters, each putting out a tile in 15% of blocks (5% with no water near), and halving the spread beside them.
    fighters: 10,
    putOutChance: 0.15,
    noWaterChance: 0.05,
    nearFighterMul: 0.5,
    waterReach: 30,
    // A building with half its tiles burnt is burnt down.
    burntShare: 0.5,
    burntDays: 30,
    // Homes and workshops burn; stone (well, shrine), the hall's stone and the stockpile yard do not.
    buildingFuel: { home: 1, workshop: 1 },
    treeFuel: 1,
    ripeFuel: 1.2,
    growingFuel: 0.5,
    scrubFuel: 0.6,
    grassFuel: 0.4,
    grassWinterFuel: 0.1,
    // Grass is dry from Highsun to Harvestmonth.
    grassMonths: [3, 5],
  },
  wild: {
    // Each work block takes this much from the pool (1 is untouched wild land)...
    drawPerBlock: { game: 0.00015, berries: 0.00012, fish: 0.0001 },
    // ...and each month it grows back this share of the gap, at least from a floor of 10%.
    regrow: { game: 0.5, berries: 0.6, fish: 0.5 },
    regrowFloor: 0.1,
    // Berries ripen from Bloommonth to Mistmonth; fish bite 40% less in winter (Firstfrost to Lastsnow).
    berryMonths: [2, 7],
    winterMonths: [8, 11],
    fishWinter: 0.6,
    // A tree gives 70 logs; felled ground grows back in 8 to 15 years.
    woodPerTree: 70,
    regrowYears: [8, 15],
    // Trees within 40 tiles of the stockpile are the woods in reach; under 70% of that at embark they are thin.
    woodsReach: 40,
    woodsThinBelow: 0.7,
    animals: {
      kinds: [
        { id: 'deer', name: 'deer', glyph: 'd' },
        { id: 'hare', name: 'hare', glyph: 'h' },
        { id: 'boar', name: 'boar', glyph: 'b' },
        { id: 'fowl', name: 'fowl', glyph: 'f' },
      ],
      byBiome: {
        'temperate-forest': ['deer', 'boar', 'hare'],
        taiga: ['deer', 'hare', 'fowl'],
        grassland: ['deer', 'hare', 'fowl'],
        jungle: ['boar', 'deer', 'fowl'],
        swamp: ['fowl', 'boar'],
      },
      fallback: ['deer', 'hare'],
      // 4 animals on a bare map, up to 10 on rich game.
      base: 4,
      perPool: 6,
      // They wander up to 3 tiles a block.
      step: 3,
    },
  },
  events: {
    drySpell: 'site_dry_spell',
    wellLow: 'site_well_low',
    frostCrops: 'site_frost_crops',
    frostField: 'site_frost_field',
    firstSnow: 'site_first_snow',
    hardWinter: 'site_hard_winter',
    storm: 'site_storm',
    fieldsSown: 'site_fields_sown',
    seedOpened: 'site_seed_opened',
    harvest: 'site_harvest',
    harvestPoor: 'site_harvest_poor',
    spoiled: 'site_spoiled',
    firewoodShort: 'site_firewood_short',
    mealsCut: 'site_meals_cut',
    mealsRestored: 'site_meals_restored',
    fire: 'site_fire',
    fireWild: 'site_wildfire',
    fireOut: 'site_fire_out',
    takenIn: 'site_taken_in',
    woodsThin: 'site_woods_thin',
  },
};

/** Site-tier events of weather, harvest, stores and fire; `{site}` is the watched site. */
export const WEATHER_EVENTS: EventTypeDef[] = [
  {
    id: 'site_dry_spell',
    baseImportance: 2,
    title: "{site}'s fields go dry",
    causeWord: 'because of',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'No rain had fallen on {site} for {days} days. The grain stood thin in the fields.',
      'The rains held off at {site}; {days} days had passed without a drop.',
      'At {site} the ground cracked after {days} dry days.',
    ],
  },
  {
    id: 'site_well_low',
    baseImportance: 3,
    title: "{site}'s well runs low",
    causeWord: 'after',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'After {days} dry days the well at {site} ran low; people drank what they could.',
      'The well at {site} sank after {days} days without rain, and water was measured out.',
      'With no rain for {days} days, {site} drew the last of its well.',
    ],
  },
  {
    id: 'site_frost_crops',
    baseImportance: 3,
    title: "Frost takes {site}'s young grain",
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'A hard frost fell on {site} in the night. It bit the young grain in {fields}.',
      'Frost came down on {site} after the sowing and burned the green shoots in {fields}.',
      'A cold night at {site} left the sprouts black in {fields}.',
    ],
  },
  {
    id: 'site_frost_field',
    baseImportance: 3,
    title: "Frost takes the last of {site}'s grain",
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'Frost took the grain still standing in {fields} at {site}.',
      'A killing frost caught the uncut grain of {fields} at {site}.',
      'The cold came before the sickles did: {fields} at {site} were lost.',
    ],
  },
  {
    id: 'site_first_snow',
    baseImportance: 1,
    title: 'Snow settles on {site}',
    category: 'nature',
    rollup: ['first snow', 'first snows'],
    links: { site: 'site' },
    templates: [
      'Snow came to {site} and stayed.',
      'The first snow of the winter fell on {site}.',
      'White settled over the roofs of {site}.',
    ],
  },
  {
    id: 'site_hard_winter',
    baseImportance: 3,
    title: 'A hard winter at {site}',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The winter at {site} was hard: {low} degrees at its worst and snow on the ground for {days} days.',
      'At {site} the cold reached {low} degrees, and snow lay for {days} days.',
      'People at {site} will remember this winter: {low} degrees, and {days} days of snow.',
    ],
  },
  {
    id: 'site_storm',
    baseImportance: 1,
    title: 'A storm over {site}',
    category: 'nature',
    rollup: ['storm', 'storms'],
    links: { site: 'site' },
    templates: [
      'A storm broke over {site}.',
      'Thunder rolled across {site} and the rain came down hard.',
      'Wind and rain lashed {site} for a day.',
    ],
  },
  {
    id: 'site_fields_sown',
    baseImportance: 1,
    title: "{site}'s fields sown",
    category: 'life',
    rollup: ['sowing', 'sowings'],
    links: { site: 'site' },
    templates: [
      'The farmers of {site} finished sowing {fields} of grain.',
      'Sowing was done at {site}: {fields} of grain in the ground.',
      'At {site}, {fields} were sown for the year.',
    ],
  },
  {
    id: 'site_seed_opened',
    baseImportance: 4,
    title: '{site} opened the seed corn',
    causeWord: 'because of',
    category: 'life',
    links: { site: 'site' },
    templates: [
      'With people starving, the steward of {site} opened the seed corn.',
      'At {site}, the grain kept back for sowing went into the pot: people were starving.',
      'Hunger won at {site}: the seed corn was eaten.',
    ],
  },
  {
    id: 'site_harvest',
    baseImportance: 1,
    title: 'A fair harvest at {site}',
    category: 'life',
    rollup: ['harvest', 'harvests'],
    links: { site: 'site' },
    templates: [
      'The harvest at {site} came in at {percent} percent of a normal year.',
      'Farmers at {site} brought in a fair harvest, {percent} percent of a normal year.',
      'At {site} the barns filled; the harvest was {percent} percent of a normal year.',
    ],
  },
  {
    id: 'site_harvest_poor',
    baseImportance: 4,
    title: 'Poor harvest at {site}',
    causeWord: 'because of',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The harvest at {site} came in at {percent} percent of a normal year.',
      'At {site} the fields gave little: {percent} percent of a normal year.',
      'Farmers at {site} brought in {percent} percent of a normal harvest.',
    ],
  },
  {
    id: 'site_spoiled',
    baseImportance: 1,
    title: "{site}'s stores spoiling",
    category: 'nature',
    rollup: ['spoiled store', 'spoiled stores'],
    links: { site: 'site' },
    templates: [
      'Damp got into the stores at {site}; about {meals} meals of food spoiled this month.',
      'About {meals} meals of food went bad in the stores of {site}.',
      'At {site}, {meals} meals spoiled before they could be eaten.',
    ],
  },
  {
    id: 'site_firewood_short',
    baseImportance: 3,
    title: 'Firewood runs short at {site}',
    causeWord: 'after',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      '{site} burned through its firewood; {count} homes went cold.',
      'The logs ran out at {site}, and {count} homes had no fire.',
      'At {site}, {count} homes sat cold for want of firewood.',
    ],
  },
  {
    id: 'site_meals_cut',
    baseImportance: 4,
    title: 'Meals cut at {site}',
    causeWord: 'because of',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'With the stores short, the steward of {site} cut meals to {percent} percent until the next harvest.',
      'The stores of {site} would not last to the harvest, so meals were cut to {percent} percent.',
      'At {site}, everyone ate {percent} percent of a meal while the stores were stretched.',
    ],
  },
  {
    id: 'site_meals_restored',
    baseImportance: 2,
    title: 'Full meals again at {site}',
    causeWord: 'after',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The steward of {site} gave full meals again.',
      'At {site} the stores held, and meals were full once more.',
      'The shortage at {site} eased and the tables were laid in full.',
    ],
  },
  {
    id: 'site_fire',
    baseImportance: 4,
    title: "{household}'s home caught fire",
    causeWord: 'because of',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'A fire caught the thatch of the home of {household} at {site}, from {cause}. Neighbours ran for buckets.',
      'At {site}, the home of {household} took fire from {cause}.',
      "{household}'s home at {site} caught fire from {cause}; the whole street turned out.",
    ],
  },
  {
    id: 'site_wildfire',
    baseImportance: 4,
    title: 'Fire breaks out at {site}',
    causeWord: 'because of',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'A fire broke out near {site}, from {cause}. Neighbours ran for buckets.',
      'Fire took hold at {site}, from {cause}, and spread through the dry ground.',
      'At {site}, {cause} started a fire, and people ran to fight it.',
    ],
  },
  {
    id: 'site_fire_out',
    baseImportance: 3,
    title: 'The fire at {site} is out',
    causeWord: 'after',
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The fire at {site} burned out. {lost} burned.',
      'By evening the fire at {site} was out. {lost} burned.',
      'The fire at {site} died down at last. {lost} burned.',
    ],
  },
  {
    id: 'site_taken_in',
    baseImportance: 2,
    title: '{household} taken in',
    causeWord: 'after',
    category: 'life',
    links: { site: 'site' },
    dataKeys: ['site'],
    templates: [
      '{household} will sleep at the home of {host} until their own is rebuilt.',
      'With their home burnt, {household} were taken in by {host} at {site}.',
      '{host} opened their door to {household} after the fire at {site}.',
    ],
  },
  {
    id: 'site_woods_thin',
    baseImportance: 2,
    title: "{site}'s woods thinning",
    category: 'nature',
    links: { site: 'site' },
    templates: [
      'The woods near {site} have thinned; woodcutters now walk {tiles} tiles for timber.',
      'Trees near {site} are scarce; the woodcutters walk {tiles} tiles to find them.',
      'The nearest good timber is now {tiles} tiles from {site}.',
    ],
  },
];
