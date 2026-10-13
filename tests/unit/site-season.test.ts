import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { applySiteSnapshot, embark, siteSnapshot, type Building } from '../../src/engine';
import { cropLook, liveLayers } from '../../src/app/site-render';
import {
  fieldFacts,
  fireLine,
  mealWord,
  seasonRows,
  shortDate,
  stewardLine,
  weatherChip,
} from '../../src/app/site-season';
import { base, biggest } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
function fresh() {
  const world = structuredClone(base());
  const active = embark(world, C, biggest(world).id);
  return { world, active, ctx: { world, active, content: C } };
}
const fieldsOf = (active: { buildings: Map<number, Building> }) =>
  [...active.buildings.values()].filter((b) => b.crop && b.followed);

describe('weather chip', () => {
  it('shows temperature, sky and warning words, and warns only with a word', () => {
    const { active, ctx } = fresh();
    Object.assign(active.weather, { tempC: 12, lowC: 4, sky: 'clear', dryDays: 0 });
    expect(weatherChip(ctx, false)).toMatchObject({ text: '12 °C · clear', warn: false });
    Object.assign(active.weather, { tempC: -2, lowC: -7, sky: 'snow' });
    const cold = weatherChip(ctx, false);
    expect(cold.text).toBe('−7 °C at night · snow · cold');
    expect(cold.warn).toBe(true);
    expect(weatherChip(ctx, true).text).toBe('−7 °C · snow · cold');
  });

  it('says dry with the days on desktop and drops them on a phone', () => {
    const { active, ctx } = fresh();
    Object.assign(active.weather, { tempC: 27, lowC: 20, sky: 'clear', dryDays: 38 });
    expect(weatherChip(ctx, false).text).toBe('27 °C · dry · 38 days without rain');
    expect(weatherChip(ctx, true).text).toBe('27 °C · dry');
  });

  it('warns of frost only while a crop stands', () => {
    const { active, ctx } = fresh();
    Object.assign(active.weather, { tempC: 3, lowC: -4, sky: 'clear', dryDays: 0 });
    expect(weatherChip(ctx, true).warn).toBe(false);
    fieldsOf(active)[0]!.crop!.stage = 'growing';
    expect(weatherChip(ctx, true).text).toBe('−4 °C · frost');
  });

  it('writes the short date without "Year"', () => {
    expect(shortDate(336 * 251 + 13 * 1)).toMatch(/^\d+ [A-Z][a-z]+month 251$/);
  });
});

describe('season section', () => {
  it('counts the harvest, stores, firewood and wild land from the state', () => {
    const { world, active, ctx } = fresh();
    const [a, b, c] = fieldsOf(active);
    for (const [field, stage] of [
      [a, 'cut'],
      [b, 'ruined'],
      [c, 'ripe'],
    ] as const) {
      Object.assign(field!.crop!, { stage, sownThisYear: true, nearWater: false, expected: 100 });
    }
    active.weather.year.drought = true;
    world.day = 336 * 4 + 4 * 28 + 6;
    const rows = Object.fromEntries(seasonRows(ctx).map((r) => [r.term, r]));
    expect(rows['This year']!.text).toContain('A drought year');
    expect(rows['This year']!.warn).toBe(true);
    expect(rows['Harvest']!.text).toContain(
      '1 of 3 cut, 1 withered (far from the river), 1 standing',
    );
    expect(rows['Stores']!.text).toContain('days at full meals');
    expect(rows['Firewood']!.text).toContain('logs');
    expect(rows['Wild land']!.text).toContain('game 100%');
  });

  it('names short meals and their cause', () => {
    const { active, ctx } = fresh();
    expect(stewardLine(ctx, () => undefined)).toBeNull();
    active.mealShare = 0.75;
    active.shortMealsSince = 336 * 250 + 6 * 28;
    active.shortMealsEvent = 7;
    const line = stewardLine(ctx, (id) =>
      id === 7
        ? { type: 'site_meals_cut', causes: [5] }
        : { type: 'site_harvest_poor', causes: [] },
    )!;
    expect(line.text).toBe('Meals cut to ¾ since 1 Leaffall');
    expect(line.because).toEqual({ id: 5, phrase: 'a poor harvest' });
    expect(mealWord(0.67)).toBe('⅔');
  });
});

describe('map layers and tile facts', () => {
  it('draws each crop stage with its own tint and glyph, and nothing for bare ground', () => {
    expect(cropLook({ stage: 'bare' })).toBeNull();
    expect(cropLook({ stage: 'sown' })).toMatchObject({ glyph: ',', ink: 't-field-ink' });
    expect(cropLook({ stage: 'ripe' })!.bg).toBe('t-crop-ripe');
    expect(cropLook({ stage: 'cut' })).toMatchObject({ glyph: '.', ink: 't-field-ink' });
    expect(cropLook({ stage: 'ruined' })!.glyph).toBe('×');
    expect(cropLook({ stage: 'growing', frostBitten: true })!.glyph).toBe('*');
    expect(cropLook({ stage: 'ripe', frostBitten: true })!.glyph).toBe('"');
  });

  it('collects snow, burnt tiles, fire and animals for the renderer', () => {
    const { active } = fresh();
    active.weather.snowCover = 3;
    fieldsOf(active)[0]!.crop!.stage = 'cut';
    active.burnt = [{ tile: 11, day: 1 }];
    active.fire = {
      tiles: new Map([[12, 2]]),
      startedEvent: 1,
      cause: 'a hearth',
      home: null,
      hits: new Map(),
      trees: 0,
      crops: 0,
      start: 12,
      done: [],
      water: true,
      homes: [],
    };
    active.animals = [{ id: 1, kind: 'deer', x: 3, y: 4 }];
    const live = liveLayers(active, new Map([['deer', 'd']]));
    expect(live.snow).toBe(true);
    expect(live.fields).toHaveLength(1);
    expect(live.burnt.has(11)).toBe(true);
    expect(live.fire.has(12)).toBe(true);
    expect(live.animals).toEqual([{ x: 3, y: 4, glyph: 'd' }]);
  });

  it('describes a field and a fire with the engine state', () => {
    const { active, ctx } = fresh();
    const field = fieldsOf(active)[0]!;
    Object.assign(field.crop!, { stage: 'growing', growth: 0.4, health: 0.62, frostBitten: true });
    expect(fieldFacts(field)).toMatchObject({
      stage: 'growing, frost-bitten',
      growth: '40% grown',
      health: '62% healthy',
    });
    expect(fireLine(ctx)).toBeNull();
    active.fire = {
      tiles: new Map([[5, 2]]),
      startedEvent: 1,
      cause: 'a hearth',
      home: null,
      hits: new Map(),
      trees: 0,
      crops: 0,
      start: 5,
      done: [],
      water: false,
      homes: [],
    };
    expect(fireLine(ctx)).toContain('Neighbours are running for buckets');
  });

  it('mirrors the woods and the burn dates through a snapshot', () => {
    const { world, active } = fresh();
    active.woods.felled = [{ tile: 9, tree: 1, regrow: 5000 }];
    active.woods.wood = new Map([[4, 33]]);
    const home = [...active.buildings.values()].find((b) => b.defId === 'home')!;
    home.burnt = true;
    home.burntDay = 77;
    const copy = structuredClone(world);
    applySiteSnapshot(copy, siteSnapshot(world));
    expect(copy.activeSite!.woods.felled).toEqual([{ tile: 9, tree: 1, regrow: 5000 }]);
    expect(copy.activeSite!.woods.wood.get(4)).toBe(33);
    expect(copy.activeSite!.buildings.get(home.id)!.burntDay).toBe(77);
  });
});
