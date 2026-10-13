// Settlement rules (M2.2): how many peoples found sites, where, and how many live there.
// Tune the numbers here; the settle stage in engine/history/settle.ts reads only this table.

import type { SettlementRules } from '../engine';
import { FREE_CITIES } from './realms';

export const SETTLEMENT: SettlementRules = {
  // About one civ per 1,800 land cells: 9 on a default 256x256 map (a quarter land), 3 on 128x128;
  // jitter adds or drops up to 2. Denser than the first 3,500 so neighbours meet and fight (playtest 2026-10-13).
  civs: { min: 3, max: 10, landCellsPerCiv: 1800, jitter: 2 },
  // A map draws its peoples from the roster: humans are common, giants rare. A culture's weight
  // also scales with its home-ground share of the land, full at 15%; under 2% it stays away.
  peoples: {
    weight: { gwyllion: 0.6, fomori: 0.8, ghor: 0.8, hollin: 0.8, redcap: 0.8, cewri: 0.35 },
    fitFull: 0.15,
    fitMin: 0.02,
  },
  secondSiteChance: 0.5,
  secondSiteRange: [4, 10],
  // Was 32; 22 brings neighbouring capitals from about 62 to 43 cells apart.
  capitalSpacing: 22,
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
    foreignBiome: 0.5,
    // Dvergar trade ore and stone for food, so deposits in reach feed them.
    raceFeature: {
      dvergar: { deposit: 3 },
      // Fomori raid and fish the hard coasts, a modest boost.
      fomori: { coast: 1.2 },
    },
    // Tylwyth food scales with mean aura in reach (ref = typical capital, x1).
    raceAura: { tylwyth: { ref: 22, min: 0.3, max: 2 } },
    // Dvergar with no ore or stone in reach go hungry.
    raceWithout: { dvergar: { deposit: 0.4 } },
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
    'merchant-republic': 'Republic of {n}',
    queendom: 'Queendom of {n}',
    circle: 'Circle of {n}',
    warhost: 'Warhost of {n}',
    horde: 'Horde of {n}',
    steading: 'Steading of {n}',
    shire: 'Shire of {n}',
    warren: 'Warren of {n}',
  },
  territoryReach: 150,
  // Deep wilds (wildness at or above this) take no new sites in history and cost `deepWildClaim`
  // times as much for a border to reach, so some land stays unclaimed however long history runs.
  deepWild: 60,
  deepWildClaim: 4,
  freeCities: FREE_CITIES,
};
