// Settlement rules (M2.2): how many peoples found sites, where, and how many live there.
// Tune the numbers here; the settle stage in engine/history/settle.ts reads only this table.

import type { SettlementRules } from '../engine';

export const SETTLEMENT: SettlementRules = {
  // About one civ per 3,500 land cells: 6 on a default 256x256 map, 3 on 128x128.
  civs: { min: 3, max: 8, landCellsPerCiv: 3500 },
  secondSiteChance: 0.5,
  secondSiteRange: [4, 10],
  capitalSpacing: 32,
  minCapitalSpacing: 6,
  siteSpacing: 3,
  reach: 3,
  featureRadius: {
    river: 1,
    coast: 1,
    harbour: 1,
    ford: 2,
    pass: 2,
    deposit: 2,
    aura: 3,
    routeNode: 1,
  },
  auraMin: 50,
  heightsMin: 700,
  plainsBiomes: ['grassland', 'steppe', 'savanna'],
  plainsMaxTravel: 4,
  mineCategories: ['metal', 'stone'],
  fishId: 'fish',
  gameId: 'game',
  capacity: {
    perFertility: 0.25,
    fishPerAmount: 0.6,
    gamePerAmount: 0.3,
    port: 1.25,
    ford: 1.1,
    road: 1.1,
  },
  suitability: { fertility: 1, preferredBiome: 25, preference: 30, routeNode: 20, jitter: 10 },
  capitalPop: [150, 300],
  secondPop: [40, 90],
  popCapacityShare: 0.6,
  minPop: 20,
  storesYears: 0.5,
  ageBands: { childFactor: 1.5, childMin: 0.15, childMax: 0.45, elderShare: 0.1 },
  kindByPop: [
    [100, 'hamlet'],
    [500, 'village'],
    [2000, 'town'],
  ],
  capitalKind: { dvergar: 'fortress' },
  civNames: {
    chieftaincy: 'Chieftaincy of {n}',
    jarldom: 'Jarldom of {n}',
    khanate: '{n} Khanate',
    'priest-kingdom': 'Kingdom of {n}',
    'elder-council': 'Council of {n}',
    thanedom: 'Thanedom of {n}',
  },
  territoryReach: 150,
};
