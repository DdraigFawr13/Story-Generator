// Weather at the watched site (M3.4): one roll a day at block 0. The temperature is the cell's
// seasonal curve plus a slow swing and the year's character (drought, hard winter); rain, snow and
// storms follow the cell's rainfall and risks; a dry spell can sink a well. History's climate
// epochs that were still running when it ended shift the odds of a bad year, as they did there.
// All numbers are in content/weather.ts.

import type { EmitInput } from '../core/context';
import { DAYS_PER_YEAR, MONTHS_PER_YEAR, dateOf } from '../core/clock';
import { streamFor } from '../core/rng';
import type {
  ActiveSite,
  ClimateEpoch,
  Id,
  SimEvent,
  SiteWeather,
  Sky,
  WorldState,
} from '../core/types';
import { latitudeOfRow } from '../worldgen/climate';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';

type Emit = (input: EmitInput) => SimEvent;

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const round1 = (x: number) => Math.round(x * 10) / 10;
const within = (month: number, [from, to]: readonly [number, number]) =>
  month >= from && month <= to;

/** The world cell index of the watched site. */
function cellIndex(world: WorldState, active: ActiveSite): number {
  const cells = world.cells;
  if (!cells) throw new Error('No watched site.');
  return active.map.cellY * cells.width + active.map.cellX;
}

/** The day's temperature (°C) at the watched site's cell, from its summer high and winter low. */
export function siteTemperature(world: WorldState, content: SiteContent, day: number): number {
  const active = world.activeSite;
  const cells = world.cells;
  if (!active || !cells) throw new Error('No watched site.');
  const k = cellIndex(world, active);
  const summer = cells.tempSummer[k]!;
  const winter = cells.tempWinter[k]!;
  const half = MONTHS_PER_YEAR / 2;
  const gap = Math.abs(dateOf(day).month - content.life.warmth.coldestMonth);
  const w = 1 - Math.min(gap, MONTHS_PER_YEAR - gap) / half;
  return summer + (winter - summer) * w;
}

/** The calendar year of the watched site: history's last year on the day of embarking. */
export function siteYear(world: WorldState, active: ActiveSite): number {
  return world.params.historyYears + Math.floor((world.day - active.enteredDay) / DAYS_PER_YEAR);
}

/** The climate epoch of a kind over the site's cell in `year`, if one is running (history/climate.ts `epochAt`). */
export function climateEpochAt(
  world: WorldState,
  active: ActiveSite,
  kind: ClimateEpoch['kind'],
  year: number,
): ClimateEpoch | undefined {
  const cells = world.cells;
  if (!cells) return undefined;
  const k = cellIndex(world, active);
  const x = k % cells.width;
  const y = (k - x) / cells.width;
  for (const epoch of world.climateEpochs ?? []) {
    if (epoch.kind !== kind || year < epoch.start || year > epoch.end) continue;
    const dx = x - (epoch.cell % cells.width);
    const dy = y - Math.floor(epoch.cell / cells.width);
    if (dx * dx + dy * dy <= epoch.radius * epoch.radius) return epoch;
  }
  return undefined;
}

/** Hours of daylight at the site's latitude on a day: 12 at the equinoxes, longest at midsummer. */
export function daylightHours(world: WorldState, content: SiteContent, day: number): number {
  const active = world.activeSite;
  const cells = world.cells;
  if (!active || !cells) throw new Error('No watched site.');
  const latitude = latitudeOfRow(active.map.cellY, cells.height);
  const month = dateOf(day).month;
  const gap = Math.abs(month - content.life.warmth.coldestMonth);
  const w = 1 - Math.min(gap, MONTHS_PER_YEAR - gap) / (MONTHS_PER_YEAR / 2);
  // w is 1 in midwinter and 0 in midsummer; the swing flips south of the equator.
  const swing = latitude * content.environment.weather.daylight.swingPerDegree;
  return round1(12 + swing * (1 - 2 * w));
}

const waterSites = new WeakMap<object, boolean>();
/** True when the local map has a river, lake or sea tile: such a site's well does not run low. */
export function hasSurfaceWater(active: ActiveSite): boolean {
  let found = waterSites.get(active.map);
  if (found === undefined) {
    found = false;
    for (let k = 0; k < active.map.water.length && !found; k += 1) {
      if (active.map.water[k] !== 0) found = true;
    }
    waterSites.set(active.map, found);
  }
  return found;
}

/** The weather before the first day. */
export function initWeather(): SiteWeather {
  return {
    tempC: 0,
    lowC: 0,
    anomaly: 0,
    sky: 'clear',
    dryDays: 0,
    snowCover: 0,
    daylightH: 12,
    outdoorDark: false,
    year: { drought: false, hardWinter: false },
    priorHardWinter: false,
    wellLow: false,
    rainDaysThisYear: 0,
    spellEvent: null,
    stormEvent: null,
    frostEventDay: -1,
    snowEventYear: -1,
    winterColdest: 99,
    winterSnowDays: 0,
  };
}

/** The odds of a bad year, raised inside an epoch as history/harvest.ts `inEpoch` raises them. */
function inEpoch(
  chance: number,
  epoch: ClimateEpoch | undefined,
  effect: { mul: number; floor: number },
) {
  return epoch ? Math.max(chance * effect.mul, effect.floor) : chance;
}

/**
 * Rolls the day's weather and says what it brings. Call once a day at block 0 before anything that
 * reads `active.weather`.
 */
export function rollWeather(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): void {
  const cells = world.cells;
  if (!cells) throw new Error('No watched site.');
  const { weather: rules } = content.environment;
  const w = active.weather;
  const rng = streamFor(world, 'site.weather');
  const day = world.day;
  const date = dateOf(day);
  const month = date.month;
  const year = siteYear(world, active);
  const k = cellIndex(world, active);
  const place = label.cell;

  // The kind of year, each Thawmonth (and on the day of embarking).
  if (day % DAYS_PER_YEAR === 0) {
    const hist = content.history;
    const dry = climateEpochAt(world, active, 'dry', year);
    const cold = climateEpochAt(world, active, 'cold', year);
    const droughtP = inEpoch(
      (cells.risk.drought[k]! / 100) * hist.droughtScale,
      dry,
      hist.climate.dry,
    );
    const winterP = inEpoch(
      (cells.risk.snow[k]! / 100) * hist.winterScale,
      cold,
      hist.climate.cold,
    );
    const drought = rng.chance(droughtP);
    const hardWinter = rng.chance(winterP);
    w.priorHardWinter = w.year.hardWinter;
    w.year = { drought, hardWinter };
    if (drought && dry) w.year.droughtCause = dry.began;
    if (hardWinter && cold) w.year.winterCause = cold.began;
    w.rainDaysThisYear = 0;
  }
  if (month === rules.winterFrom && date.dayOfMonth === 1) {
    w.winterColdest = 99;
    w.winterSnowDays = 0;
  }

  // Temperature: the seasonal curve, a slow swing and the year's character.
  let sum = 0;
  for (let i = 0; i < 4; i += 1) sum += rng.int(1_000_000) / 1_000_000;
  w.anomaly = rules.anomalyKeep * w.anomaly + rules.anomalySd * (sum - 2) * 1.732;
  let temp = siteTemperature(world, content, day) + w.anomaly;
  if (w.year.hardWinter && within(month, rules.hardWinter.months)) temp += rules.hardWinter.offsetC;
  if (w.priorHardWinter && within(month, rules.hardWinter.carryMonths)) {
    temp += rules.hardWinter.carryOffsetC;
  }
  if (w.year.drought && within(month, rules.drought.months)) temp += rules.drought.offsetC;
  w.tempC = round1(temp);
  w.lowC = round1(temp - rules.nightBelow);
  w.daylightH = daylightHours(world, content, day);
  w.outdoorDark = w.daylightH < rules.daylight.outdoorMinHours;

  // Sky: rain by the cell's rainfall, storms by its storm risk (always both draws).
  const r = rules.rain;
  let p = clamp(cells.rainfall[k]! * r.perMm, r.min, r.max);
  if (w.year.drought && within(month, r.droughtMonths)) p *= r.droughtMul;
  const wet = rng.chance(p);
  const storm = rng.chance((cells.risk.storm[k]! / 100) * rules.stormPerRisk);
  const cold = w.tempC <= rules.snowAtC;
  const sky: Sky = (wet || storm) && cold ? 'snow' : storm ? 'storm' : wet ? 'rain' : 'clear';
  w.sky = sky;
  const precipitation = sky !== 'clear';
  if (precipitation) {
    w.dryDays = 0;
    w.wellLow = false;
    w.spellEvent = null;
  } else w.dryDays += 1;
  if (sky === 'rain' || sky === 'storm') w.rainDaysThisYear += 1;
  // Snow lies while it stays cold and melts a few days' worth when it warms, up to a cap.
  const cap = rules.snowMeltCap;
  if (sky === 'snow') w.snowCover = Math.min(cap, w.snowCover + 1);
  else if (w.snowCover > 0)
    w.snowCover = w.tempC <= 2 ? Math.min(cap, w.snowCover + 1) : Math.max(0, w.snowCover - 3);
  if (month >= rules.winterFrom) {
    w.winterColdest = Math.min(w.winterColdest, w.lowC);
    if (w.snowCover > 0) w.winterSnowDays += 1;
  }

  // What a person would notice.
  const dryEpoch = climateEpochAt(world, active, 'dry', year);
  if (w.dryDays === rules.drySpell.days && within(month, rules.drySpell.months)) {
    const cause = w.year.droughtCause ?? dryEpoch?.began;
    w.spellEvent = emit({
      type: content.environment.events.drySpell,
      place,
      causes: cause === undefined ? [] : [cause],
      data: { site: label.name, days: w.dryDays },
    }).id;
  }
  if (!w.wellLow && w.dryDays >= rules.wellLowDays && !hasSurfaceWater(active)) {
    w.wellLow = true;
    const causes: Id[] = w.spellEvent === null ? [] : [w.spellEvent];
    emit({
      type: content.environment.events.wellLow,
      place,
      causes,
      data: { site: label.name, days: w.dryDays },
    });
  }
  w.stormEvent =
    sky === 'storm'
      ? emit({ type: content.environment.events.storm, place, data: { site: label.name } }).id
      : null;
  if (sky === 'snow' && month >= rules.winterFrom && w.snowEventYear !== year) {
    w.snowEventYear = year;
    emit({ type: content.environment.events.firstSnow, place, data: { site: label.name } });
  }
  // The last day of Lastsnow closes a hard winter.
  if (month === MONTHS_PER_YEAR - 1 && date.dayOfMonth === 28 && w.year.hardWinter) {
    emit({
      type: content.environment.events.hardWinter,
      place,
      causes: w.year.winterCause === undefined ? [] : [w.year.winterCause],
      data: { site: label.name, low: Math.round(w.winterColdest), days: w.winterSnowDays },
    });
  }
}
