import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  MAX_SOLDIER_EQUIVALENT,
  RngStream,
  TIERS,
  meetsRequirements,
  raceBalanceProblems,
  rollAptitude,
  soldierEquivalent,
  tierOfPower,
  validateContent,
  type Attributes,
  type ContentBundle,
  type TierId,
} from '../../src/engine';

const human = DEFAULT_CONTENT.races.find((race) => race.id === 'human')!;
const rng = (name: string) => RngStream.detached('PEOPLE', name);
const avg: Attributes = {
  strength: 10,
  agility: 10,
  endurance: 10,
  intellect: 10,
  willpower: 10,
  perception: 10,
  charisma: 10,
};

function tierShares(input: Parameters<typeof rollAptitude>[0], n = 40000) {
  const stream = rng('shares');
  const counts: Record<TierId, number> = {
    none: 0,
    faint: 0,
    gifted: 0,
    strong: 0,
    exceptional: 0,
    legendary: 0,
  };
  for (let i = 0; i < n; i += 1) counts[tierOfPower(rollAptitude(input, stream).magic.power)] += 1;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n])) as Record<
    TierId,
    number
  >;
}

describe('aptitude (R-13, R-26)', () => {
  it('makes most humans mundane or faint, with real talent rare', () => {
    const shares = tierShares({ race: human });
    expect(shares.none).toBeGreaterThan(0.55);
    expect(shares.none + shares.faint).toBeGreaterThan(0.93);
    expect(shares.gifted).toBeLessThan(0.07);
    expect(shares.exceptional).toBeLessThan(0.003);
    expect(shares.legendary).toBe(0);
  });

  it('passes talent through bloodlines and high-aura birthplaces', () => {
    const giftedParent = { potential: avg, magic: { power: 5, affinities: { life: 5 } } };
    const base = tierShares({ race: human });
    const bloodline = tierShares({ race: human, parents: [giftedParent, giftedParent] });
    const aura = tierShares({ race: human, birthplaceAura: 95 });
    expect(bloodline.gifted).toBeGreaterThan(base.gifted * 1.5);
    expect(aura.gifted).toBeGreaterThan(base.gifted);
  });

  it('keeps attributes within race bounds and potential at or above current', () => {
    const stream = rng('bounds');
    for (let i = 0; i < 2000; i += 1) {
      const { attributes, potential } = rollAptitude({ race: human }, stream);
      for (const key of Object.keys(attributes) as (keyof Attributes)[]) {
        expect(attributes[key]).toBeGreaterThanOrEqual(human.attributeRange[0]);
        expect(attributes[key]).toBeLessThanOrEqual(human.attributeRange[1]);
        expect(potential[key]).toBeGreaterThanOrEqual(attributes[key]);
      }
    }
  });

  it('gates abilities by attributes and affinity (R-25)', () => {
    const healing = DEFAULT_CONTENT.abilities.find((a) => a.id === 'healing_touch')!;
    const mundane = { attributes: avg, magic: { power: 0, affinities: {} } };
    const healer = { attributes: avg, magic: { power: 5, affinities: { life: 5 } } };
    expect(meetsRequirements(mundane, healing)).toBe(false);
    expect(meetsRequirements(healer, healing)).toBe(true);
  });
});

describe('scale ceiling (R-24)', () => {
  const person = (power: number, fighting = 8, attrs = avg) => ({
    attributes: attrs,
    magic: { power, affinities: {} },
    skills: { fighting },
    health: 100,
  });

  it('follows the tier-equivalence table', () => {
    expect(soldierEquivalent(person(0))).toBeCloseTo(1, 0);
    expect(soldierEquivalent(person(10))).toBeGreaterThanOrEqual(5);
    expect(soldierEquivalent(person(10))).toBeLessThanOrEqual(15);
    expect(soldierEquivalent(person(15))).toBeLessThanOrEqual(80);
    expect(soldierEquivalent(person(20))).toBe(MAX_SOLDIER_EQUIVALENT);
  });

  it('caps the greatest mundane warrior near three soldiers', () => {
    const peak = { ...avg, strength: 18, agility: 18, endurance: 18 };
    expect(soldierEquivalent(person(0, 20, peak))).toBeLessThanOrEqual(3.5);
  });

  it('never exceeds one low-end field army', () => {
    expect(TIERS.legendary.soldiers[1]).toBeLessThanOrEqual(MAX_SOLDIER_EQUIVALENT);
    expect(soldierEquivalent(person(99))).toBe(MAX_SOLDIER_EQUIVALENT);
  });

  it('rejects spells beyond their tier caps and self-taught magic', () => {
    const broken: ContentBundle = {
      ...DEFAULT_CONTENT,
      abilities: [
        {
          id: 'cantrip_fireball',
          name: 'Overpowered cantrip',
          family: 'magic',
          school: 'fire',
          requirements: { power: 1 },
          learnAttributes: ['willpower'],
          learnFrom: ['practice'],
          effect: { kind: 'damage', damage: 5, areaRadius: 5 },
        },
      ],
    };
    const problems = validateContent(broken).join('\n');
    expect(problems).toMatch(/self-taught/);
    expect(problems).toMatch(/damage/);
    expect(problems).toMatch(/area/);
  });
});

describe('race biomes', () => {
  it('rejects a preferred biome id that does not exist', () => {
    const broken: ContentBundle = {
      ...DEFAULT_CONTENT,
      races: DEFAULT_CONTENT.races.map((race) =>
        race.id === 'human' ? { ...race, preferredBiomes: ['river_valley'] } : race,
      ),
    };
    expect(validateContent(broken).join('\n')).toMatch(/human: unknown biome "river_valley"/);
  });
});

describe('race balance (R-29)', () => {
  it('requires a downside from races stronger than humans', () => {
    const tylwyth = DEFAULT_CONTENT.races.find((race) => race.id === 'tylwyth')!;
    expect(raceBalanceProblems(tylwyth, human)).toEqual([]);
    const free = { ...tylwyth, fertility: 1, maturityYears: 10, foodNeed: 1, dependencies: [] };
    expect(raceBalanceProblems(free, human)).toHaveLength(1);
  });

  it('flags a dvergar copy that is strong with no downside', () => {
    const dvergar = DEFAULT_CONTENT.races.find((race) => race.id === 'dvergar')!;
    expect(raceBalanceProblems(dvergar, human)).toEqual([]);
    const free = { ...dvergar, fertility: 1, maturityYears: 10, foodNeed: 1, dependencies: [] };
    expect(raceBalanceProblems(free, human)).toHaveLength(1);
  });
});
