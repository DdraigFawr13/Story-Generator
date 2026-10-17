// Yearly history rules (M2.3, M2.4): harvests, births and deaths, famine, disease, migration and
// expansion; beasts, trade, grievance and war.
// Tune the numbers here; the history stage in engine/history/ reads only this table.

import type { HistoryRules } from '../engine';
import { DIPLOMACY } from './diplomacy';
import { FEUDS } from './feuds';
import { INTRIGUE } from './intrigue';
import { LINEAGES } from './lineages';
import { ORDERS } from './orders';
import { CITY_STATES, CIVIL_WARS, COLLEGES } from './realms';

export const HISTORY: HistoryRules = {
  harvestVariance: 0.1,
  droughtScale: 0.25,
  droughtYield: 0.5,
  winterScale: 0.2,
  winterYield: 0.7,
  workerOutput: 1.3,
  storesCapYears: 1.5,
  birthRate: 0.12,
  crowdingBirthCut: 1,
  crowdingFrom: 0.6,
  childDeath: 0.02,
  adultDeath: 0.006,
  crowdingDeathRise: 0.5,
  referenceLifespan: 70,
  elderLifeShare: 0.25,
  minAdultYears: 5,
  minElderYears: 10,
  famineDeathShare: 0.4,
  // How far back a famine without a bad year this year looks for its cause.
  famineCauseYears: 5,
  outbreakSizeCap: 4,
  migrantShare: 0.2,
  // Without this, a drought-struck town with spare room drew migrants every year and never shrank.
  famineShunYears: 5,
  // Below the crowding at which births fall (0.6-1), so slow-breeding races still send settlers.
  expandAt: 0.65,
  // A hold sends clansfolk to carve a new hold along the range long before it is full.
  expandAtKind: { hold: 0.3 },
  expandCooldown: 15,
  expandChance: 0.2,
  expandRange: [4, 12],
  expandShare: 0.25,
  newSiteStoresYears: 0.5,
  newSiteSpacing: 5,
  minNewSiteCapacity: 100,
  // Years between new sites of one civ; caps live sites near 40-120 after 250 years.
  civFoundCooldown: 15,
  shortStoresYears: 0.25,
  climate: {
    startChance: 0.08,
    maxActive: 2,
    years: [5, 20],
    // A radius of 25-60 cells covers roughly 3-17% of a 256x256 map each.
    radius: [25, 60],
    dryShare: 0.65,
    dry: { mul: 3, floor: 0.25, yield: 0.8 },
    cold: { mul: 2.5, floor: 0.2, yield: 0.85 },
  },
  importance: {
    kindFame: { town: 1, city: 2, fortress: 1 },
    capitalFame: 1,
    scale: [
      [50, 1],
      [500, 2],
      [5000, 3],
    ],
    novelty: 2,
    repeatYears: 10,
    repeatPenalty: 1,
    rollupBelow: 3,
  },
  kindHysteresis: 0.1,
  abandonBelow: 8,
  linkReach: 60,
  seaLinkRange: 40,
  beastSpawnTries: 400,
  lairSpacing: 5,
  raidKillCap: 0.15,
  raidKillPerDanger: 0.5,
  raidStoresLoss: 0.2,
  slayBase: 0.5,
  slayAdultsPerDanger: 2,
  slayTierFactor: { beast: 1, great: 0.6, legendary: 0.15 },
  // A second beast near the same town is "the Second", never the dead one come back.
  beastNameOrdinals: [
    'the Second',
    'the Third',
    'the Fourth',
    'the Fifth',
    'the Sixth',
    'the Seventh',
    'the Eighth',
    'the Ninth',
    'the Tenth',
  ],
  // A roamer shifts its haunt about once a decade.
  beastRoamChance: 0.1,
  // Wolf packs roam unremarked (their raids show where they went); greater beasts are news.
  beastRoamNoticed: ['great', 'legendary'],
  tradeGoodsRange: 8,
  tradeKeepYears: 1,
  goodValue: { food: 0.01, ore: 1, timber: 0.5, salt: 2, luxury: 8 },
  wealthDecay: 0.2,
  luxuryTradeShare: 0.3,
  goodsPerWorker: { food: 0, ore: 0.3, timber: 0.6, salt: 0.15, luxury: 0.05 },
  depositsForFull: 3,
  goodsCapYears: 3,
  need: { food: 0, ore: 0.1, timber: 0.15, salt: 0.05, luxury: 0 },
  saltShortStoresCap: 0.9,
  oreStrength: 0.3,
  luxuryWealthShare: 0.02,
  envyRatio: 3,
  envyMinWealth: 10,
  raidWarValue: 4,
  civRaidChance: 0.6,
  // Orc hordes raid their richest neighbour about one year in seven, famine or not.
  raidHabit: { ghor: 0.15 },
  raidLootShare: 0.4,
  civRaidDeaths: [0.01, 0.05],
  grievance: { raid: 1, border: 0.8, insult: 0.6, envy: 0.4, vengeance: 1.5 },
  borderCells: 12,
  borderClashChance: 0.6,
  insultChance: 0.2,
  grievanceDecay: 0.97,
  // Culture values between peoples (engine/history/values.ts).
  cultureValues: {
    // Gwerin and Skarn differ by about 2; two human cultures count half as strange.
    typicalStrangeness: 1.5,
    sameRaceStrangeness: 0.5,
    // Honour 9 keeps a grudge at 0.986 a year (half-life about 50 years), honour 2 at 0.958.
    honourMemory: 0.004,
    envyWealth: 5,
    kinNeutral: 4,
    // Tarqai (freedom 9, order 3) dispute 1.5x as often; Ushani (2, 9) at 0.44x.
    disputeSlope: 0.08,
    slightSlope: 0.1,
    slights: {
      faith: ['by mocking {faith}', 'by scorning the rites of {faith}'],
      kin: ['by shaming a kinswoman of their ruler', 'by refusing a kinsman hospitality'],
      order: ['by flouting their laws', 'by ignoring the precedence of their court'],
      freedom: ['by demanding tribute', 'by treating their envoys as subjects'],
      honour: ['by calling their warriors cowards', 'by breaking a sworn word'],
    },
  },
  soldierBase: 30,
  levyShare: 0.2,
  maxStrengthRatio: 3,
  crossingPenalty: 0.5,
  warThreshold: 0.8,
  campaignShare: 0.5,
  // freeCity: a free city lives or dies by its walls, so it keeps them high (halved without timber).
  defence: {
    fortress: 1.5,
    hold: 1.6,
    heights: 1.25,
    pass: 1.4,
    ford: 1.2,
    capital: 1.2,
    freeCity: 1.5,
  },
  battleLuck: 0.25,
  loserLoss: 0.3,
  winnerLoss: 0.1,
  razeChance: 0.4,
  razeDeathShare: 0.5,
  maxWarYears: 8,
  wearyShare: 0.15,
  peaceYears: 30,
  colleges: COLLEGES,
  lineages: LINEAGES,
  cityStates: CITY_STATES,
  civilWar: CIVIL_WARS,
  intrigue: INTRIGUE,
  diplomacy: DIPLOMACY,
  feuds: FEUDS,
  orders: ORDERS,
};
