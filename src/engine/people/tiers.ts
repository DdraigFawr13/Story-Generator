// The scale ceiling (R-24) and magic tiers (§5.4A) in one place. Every combat,
// spell and history system should read these instead of inventing numbers.

export const TIER_IDS = ['none', 'faint', 'gifted', 'strong', 'exceptional', 'legendary'] as const;
export type TierId = (typeof TIER_IDS)[number];
/** Legendary is reached only through a lifetime of growth, never at birth. */
export type BirthTierId = Exclude<TierId, 'legendary'>;
export const BIRTH_TIER_IDS: readonly BirthTierId[] = [
  'none',
  'faint',
  'gifted',
  'strong',
  'exceptional',
];

export interface TierSpec {
  id: TierId;
  minPower: number;
  maxPower: number;
  /** Rough combat equivalence in average trained soldiers, at min and max power. */
  soldiers: [number, number];
  /** Per-use limits enforced by content validation. */
  caps: { maxDamage: number; maxAreaRadius: number; maxUsesPerDay: number };
}

export const TIERS: Record<TierId, TierSpec> = {
  none: {
    id: 'none',
    minPower: 0,
    maxPower: 0,
    soldiers: [1, 1],
    caps: { maxDamage: 0, maxAreaRadius: 0, maxUsesPerDay: 0 },
  },
  faint: {
    id: 'faint',
    minPower: 1,
    maxPower: 2,
    soldiers: [1, 1],
    caps: { maxDamage: 0.5, maxAreaRadius: 0, maxUsesPerDay: 3 },
  },
  gifted: {
    id: 'gifted',
    minPower: 3,
    maxPower: 6,
    soldiers: [1, 2],
    caps: { maxDamage: 1, maxAreaRadius: 0, maxUsesPerDay: 5 },
  },
  strong: {
    id: 'strong',
    minPower: 7,
    maxPower: 12,
    soldiers: [5, 15],
    caps: { maxDamage: 3, maxAreaRadius: 3, maxUsesPerDay: 6 },
  },
  exceptional: {
    id: 'exceptional',
    minPower: 13,
    maxPower: 16,
    soldiers: [30, 80],
    caps: { maxDamage: 6, maxAreaRadius: 10, maxUsesPerDay: 12 },
  },
  legendary: {
    id: 'legendary',
    minPower: 17,
    maxPower: 20,
    soldiers: [500, 1000],
    caps: { maxDamage: 10, maxAreaRadius: 40, maxUsesPerDay: 3 },
  },
};

/** At most this many Legendary individuals alive in a world at once (R-24). */
export const LEGEND_CAP = 3;
/** Absolute ceiling: one low-end field army. Nothing may exceed it. */
export const MAX_SOLDIER_EQUIVALENT = 1000;

export function tierOfPower(power: number): TierId {
  for (const id of TIER_IDS) {
    if (power <= TIERS[id].maxPower) return id;
  }
  return 'legendary';
}

/** True when another person may grow into Legendary now (world-tier check). */
export function legendSlotOpen(livingLegendCount: number): boolean {
  return livingLegendCount < LEGEND_CAP;
}
