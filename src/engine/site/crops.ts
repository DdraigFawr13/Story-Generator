// Crops at the watched site (M3.4): each followed field is sown in spring, grows on the weather,
// ripens, is cut by farmers and gives grain; the soil wears and recovers. The steward sows enough
// fields for a normal year to leave a small surplus. Farming no longer produces grain per block:
// a farmer's block sows, tends or cuts the field they stand in. Numbers: content/weather.ts.

import { clamp } from '../core/math';
import type { EmitInput } from '../core/context';
import { DAYS_PER_YEAR, MONTHS_PER_YEAR, dateOf } from '../core/clock';
import { streamFor } from '../core/rng';
import type { ActiveSite, Building, Crop, Id, SimEvent, WorldState } from '../core/types';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';
import { frostHarmShare } from './lore';
import { siteYear } from './weather';
import { addItem, itemCount, mealsPerDay, takeItem } from './stock';

type Emit = (input: EmitInput) => SimEvent;

const within = (month: number, [from, to]: readonly [number, number]) =>
  month >= from && month <= to;

/** "a field" or "3 fields". */
export function fieldsWord(n: number): string {
  return n === 1 ? 'a field' : `${n} fields`;
}

/** The yield factor of a soil of 0-100. */
export function soilFactor(content: Pick<SiteContent, 'environment'>, soil: number): number {
  const floor = content.environment.crop.soilFloor;
  return floor + ((1 - floor) * clamp(soil, 0, 100)) / 100;
}

/** Meals a healthy field of this soil gives. */
export function fieldYield(content: Pick<SiteContent, 'environment'>, soil: number): number {
  return content.environment.crop.fieldYield * soilFactor(content, soil);
}

/** The followed fields, in id order. */
export function followedFields(active: ActiveSite): Building[] {
  const fields: Building[] = [];
  for (const b of active.buildings.values()) {
    if (b.defId === 'field' && b.followed) fields.push(b);
  }
  return fields.sort((a, b) => a.id - b.id);
}

/** True when a river, lake or sea tile lies within `reach` tiles of the field's edge. */
function nearWater(active: ActiveSite, b: Building, reach: number): boolean {
  const { map } = active;
  for (let y = Math.max(0, b.y - reach); y < Math.min(map.height, b.y + b.h + reach); y += 1) {
    for (let x = Math.max(0, b.x - reach); x < Math.min(map.width, b.x + b.w + reach); x += 1) {
      if (map.water[y * map.width + x] !== 0) return true;
    }
  }
  return false;
}

/** Gives every followed field a bare crop with the cell's fertility as its soil. */
export function initCrops(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const cells = world.cells;
  if (!cells) throw new Error('No watched site.');
  const fertility = cells.fertility[active.map.cellY * cells.width + active.map.cellX] ?? 50;
  const reach = content.environment.crop.nearWaterTiles;
  const fields = followedFields(active);
  // Rank the fields by height: the lowest gets the most frost bias.
  const height = (b: Building) => {
    let sum = 0;
    for (const k of b.cells) sum += active.map.elevation[k]!;
    return sum / b.cells.length;
  };
  const ranked = [...fields].sort((a, b) => height(a) - height(b) || a.id - b.id);
  const spread = content.environment.crop.frostSpread;
  for (const b of fields) {
    const rank = ranked.indexOf(b);
    const frostBias = fields.length > 1 ? spread * (1 - (2 * rank) / (fields.length - 1)) : 0;
    b.crop = {
      stage: 'bare',
      growth: 0,
      health: 1,
      sownDay: -1,
      left: 0,
      soil: fertility,
      soilStart: fertility,
      sowProgress: 0,
      lastWorked: world.day,
      nearWater: nearWater(active, b, reach),
      frostBias,
      expected: 0,
      sownThisYear: false,
    };
  }
}

/** A crop that is standing and unfinished: sown, growing or ripe. */
const standing = (crop: Crop) =>
  crop.stage === 'sown' || crop.stage === 'growing' || crop.stage === 'ripe';

/** Picks the fields to sow this spring: enough that a normal year leaves a small surplus. */
function planSowing(world: WorldState, content: SiteContent, active: ActiveSite): void {
  const rules = content.environment.crop;
  const need = DAYS_PER_YEAR * mealsPerDay(world, content, active) * rules.normalYearMargin;
  let grain = need * (1 - rules.otherFoodShare);
  const bare = followedFields(active)
    .filter((b) => b.crop && b.crop.stage === 'bare')
    .sort((a, b) => b.crop!.soil - a.crop!.soil || a.id - b.id);
  const picked: Id[] = [];
  for (const b of bare) {
    if (grain <= 0) break;
    picked.push(b.id);
    grain -= fieldYield(content, b.crop!.soil) * rules.expectedHealth;
  }
  active.harvest.sowFields = picked;
  active.harvest.planned = true;
}

/** Fields that need a farmer now, in id order: to sow, to tend, to cut. */
export function fieldsNeedingWork(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
): { sow: Building[]; tend: Building[]; ripe: Building[] } {
  const out = { sow: [] as Building[], tend: [] as Building[], ripe: [] as Building[] };
  const month = dateOf(world.day).month;
  const sowing = within(month, content.environment.crop.sowMonths);
  const chosen = new Set(active.harvest.sowFields);
  for (const b of followedFields(active)) {
    const crop = b.crop;
    if (!crop) continue;
    if (crop.stage === 'bare') {
      if (sowing && chosen.has(b.id)) out.sow.push(b);
    } else if (crop.stage === 'sown' || crop.stage === 'growing') out.tend.push(b);
    else if (crop.stage === 'ripe') out.ripe.push(b);
  }
  return out;
}

/** A new, empty harvest year; the last poor harvest stays the cause of short meals until a fair one. */
export function newHarvest(year: number, poorEvent: Id | null = null) {
  return {
    year,
    planned: false,
    sownReported: false,
    sowFields: [] as Id[],
    sown: 0,
    expected: 0,
    cut: 0,
    done: false,
    causes: [] as Id[],
    poorEvent,
    share: 0,
    seedKept: 0,
    seedOpened: null as Id | null,
  };
}

/** Plants a sown-ready field if the stores hold its seed; returns true when it was planted. */
function plant(content: SiteContent, active: ActiveSite, b: Building, day: number): boolean {
  const crop = b.crop!;
  const rules = content.environment.crop;
  const grainItem = content.steward.startItems.food;
  const expected = fieldYield(content, crop.soil);
  const seed = expected * rules.seedShare;
  if (itemCount(active, grainItem) < seed) return false;
  takeItem(active, grainItem, seed);
  crop.stage = 'sown';
  crop.growth = 0;
  crop.health = 1;
  crop.sownDay = day;
  crop.left = 0;
  crop.expected = expected;
  crop.sownThisYear = true;
  active.harvest.sown += 1;
  active.harvest.expected += expected;
  return true;
}

/**
 * One farmer-block's work, summed per field (`work` maps a field's building id to the effectiveness
 * standing in it): sowing a chosen field in the window, tending a growing one, cutting a ripe one.
 */
export function farmBlock(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  work: ReadonlyMap<Id, number>,
  emit: Emit,
  label: SiteLabel,
): void {
  const rules = content.environment.crop;
  const day = world.day;
  const month = dateOf(day).month;
  const grainItem = content.steward.startItems.food;
  const chosen = new Set(active.harvest.sowFields);
  for (const id of [...work.keys()].sort((a, b) => a - b)) {
    const b = active.buildings.get(id);
    const crop = b?.crop;
    const eff = work.get(id) ?? 0;
    if (!b || !crop || !(eff > 0)) continue;
    if (crop.stage === 'bare') {
      if (
        !chosen.has(id) ||
        crop.sownThisYear ||
        !within(month, rules.sowMonths) ||
        active.weather.tempC < rules.sowMinC
      ) {
        continue;
      }
      crop.lastWorked = day;
      crop.sowProgress += eff;
      if (crop.sowProgress >= rules.sowWork && plant(content, active, b, day)) {
        crop.sowProgress = 0;
        if (
          !active.harvest.sownReported &&
          active.harvest.sown >= active.harvest.sowFields.length
        ) {
          reportSown(content, active, emit, label);
        }
      }
    } else if (crop.stage === 'sown' || crop.stage === 'growing') {
      crop.lastWorked = day;
    } else if (crop.stage === 'ripe') {
      crop.lastWorked = day;
      const share = Math.min(crop.left, eff / rules.cutWork);
      crop.left -= share;
      const grain = share * crop.expected * crop.health;
      addItem(active, grainItem, grain);
      active.harvest.cut += grain;
      if (crop.left <= 1e-9) {
        crop.left = 0;
        crop.stage = 'cut';
        crop.soil = Math.max(0, crop.soil - rules.soilPerHarvest);
      }
    }
  }
}

function reportSown(content: SiteContent, active: ActiveSite, emit: Emit, label: SiteLabel): void {
  const h = active.harvest;
  h.sownReported = true;
  if (h.sown <= 0) {
    // Nothing sown (no seed, or no hands): the year's harvest is lost now, and says so.
    if (h.sowFields.length === 0) return;
    h.done = true;
    h.share = 0;
    if (active.storesEmptyEvent !== null) h.causes.push(active.storesEmptyEvent);
    h.poorEvent = emit({
      type: content.environment.events.harvestPoor,
      place: label.cell,
      causes: [...new Set(h.causes)],
      data: { site: label.name, percent: 0 },
    }).id;
    return;
  }
  emit({
    type: content.environment.events.fieldsSown,
    place: label.cell,
    data: { site: label.name, fields: fieldsWord(active.harvest.sown) },
  });
}

/** Sums up the harvest: fair (rolls up) or poor (with the dry spell and frosts as causes). Returns true if fair. */
function finishHarvest(content: SiteContent, active: ActiveSite, emit: Emit, label: SiteLabel) {
  const h = active.harvest;
  h.done = true;
  if (h.sown <= 0) return false;
  h.share = h.expected > 0 ? h.cut / h.expected : 1;
  const percent = Math.round(h.share * 100);
  const fair = h.share >= content.environment.crop.fairShare;
  const event = emit({
    type: fair ? content.environment.events.harvest : content.environment.events.harvestPoor,
    place: label.cell,
    causes: fair ? [] : [...new Set(h.causes)],
    data: { site: label.name, percent },
  });
  h.poorEvent = fair ? null : event.id;
  return fair;
}

/**
 * The day's work on the crops, after the weather is rolled: a new year resets the fields, the
 * steward plans the sowing, fields grow, take frost, dry spells and storms, ripen or are ruined, and
 * a finished harvest is summed up. Returns true on the day a harvest closes (farmers are proud).
 */
export function dailyCrops(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: Emit,
  label: SiteLabel,
): boolean {
  const rules = content.environment.crop;
  const w = active.weather;
  const day = world.day;
  const date = dateOf(day);
  const month = date.month;
  const fields = followedFields(active).filter((b) => b.crop);
  let harvested = false;

  // A new year: fields start bare, a field left bare all year rests, the harvest starts again.
  if (day % DAYS_PER_YEAR === 0) {
    if (!active.harvest.done && active.harvest.sown > 0)
      finishHarvest(content, active, emit, label);
    for (const b of fields) {
      const crop = b.crop!;
      if (!crop.sownThisYear && crop.stage === 'bare') {
        crop.soil = Math.min(crop.soilStart, crop.soil + rules.soilRecover);
      }
      crop.stage = 'bare';
      crop.growth = 0;
      crop.health = 1;
      crop.left = 0;
      crop.sowProgress = 0;
      crop.sownThisYear = false;
      crop.frostBitten = false;
    }
    active.harvest = newHarvest(siteYear(world, active), active.harvest.poorEvent);
  }
  // Seed for every field with no crop in it is kept back, so a poor year still leaves next year's sowing.
  let seedKept = 0;
  for (const b of fields) {
    const stage = b.crop!.stage;
    if (stage !== 'sown' && stage !== 'growing' && stage !== 'ripe')
      seedKept += fieldYield(content, b.crop!.soil) * rules.seedShare;
  }
  // Once anyone starves the seed is food too (M3.7), said once until the hunger passes.
  const starving = active.residents.some((id) =>
    world.people.get(id)?.detail?.conditions.some((c) => c.defId === rules.seedOpenCondition),
  );
  if (starving && seedKept > 0 && (active.harvest.seedOpened ?? null) === null) {
    active.harvest.seedOpened = emit({
      type: content.environment.events.seedOpened,
      place: label.cell,
      causes: active.storesEmptyEvent === null ? [] : [active.storesEmptyEvent],
      data: { site: label.name },
    }).id;
  } else if (!starving) active.harvest.seedOpened = null;
  active.harvest.seedKept = starving ? 0 : seedKept;
  if (!active.harvest.planned && within(month, rules.sowMonths)) planSowing(world, content, active);
  // The sowing window closing is also the end of the sowing news.
  if (month === rules.sowMonths[1] + 1 && date.dayOfMonth === 1 && !active.harvest.sownReported) {
    reportSown(content, active, emit, label);
  }

  const rng = streamFor(world, 'site.weather');
  const dryLimit = w.year.drought ? rules.droughtDryDays : rules.dryDays;
  const dry = w.dryDays > dryLimit;
  const storm = w.sky === 'storm';
  let frostHits = 0;
  let frostRuined = 0;
  let frostShare: number | undefined;
  for (const b of fields) {
    const crop = b.crop!;
    if (crop.stage === 'sown' || crop.stage === 'growing') {
      let tf = clamp((w.tempC - rules.growBelowC) / rules.growSpanC, 0, 1);
      if (w.tempC > rules.heatAboveC) tf *= 0.5;
      let water = 1;
      if (dry) {
        const set = crop.nearWater ? rules.waterNear : rules.waterFar;
        water = set.growth;
        crop.health -= set.healthLoss;
        if (w.spellEvent !== null && !active.harvest.causes.includes(w.spellEvent)) {
          active.harvest.causes.push(w.spellEvent);
        }
      }
      crop.growth += (tf * water) / rules.growthDays;
      if (w.lowC <= rules.frostC + crop.frostBias) {
        // A weather-reader at the site softens the harm (the ruin threshold is unchanged).
        frostShare ??= frostHarmShare(world, content, active, emit, label);
        crop.health -= rules.frostHealth * frostShare;
        crop.frostBitten = true;
        frostHits += 1;
      }
      if (storm && rng.chance(rules.stormChance)) crop.health -= rules.stormHealth;
      if (day - crop.lastWorked > rules.untendedDays) crop.health -= rules.untendedLoss;
      crop.health = Math.max(0, crop.health);
      if (crop.health <= 0 || month >= rules.witherMonth) {
        crop.stage = 'ruined';
      } else if (crop.growth >= 1) {
        crop.stage = 'ripe';
        crop.growth = 1;
        crop.left = 1;
      } else crop.stage = crop.growth < rules.sproutAt ? 'sown' : 'growing';
    } else if (crop.stage === 'ripe') {
      crop.health = Math.max(0, crop.health - rules.ripeLoss);
      if (w.lowC <= rules.ruinC + crop.frostBias) {
        crop.stage = 'ruined';
        crop.left = 0;
        frostRuined += 1;
      }
    }
  }
  const events = content.environment.events;
  if (
    frostHits > 0 &&
    (w.frostEventDay < 0 || day - w.frostEventDay >= content.environment.weather.frostEventGap)
  ) {
    w.frostEventDay = day;
    const e = emit({
      type: events.frostCrops,
      place: label.cell,
      data: { site: label.name, fields: fieldsWord(frostHits) },
    });
    active.harvest.causes.push(e.id);
  }
  if (frostRuined > 0) {
    const e = emit({
      type: events.frostField,
      place: label.cell,
      data: { site: label.name, fields: fieldsWord(frostRuined) },
    });
    active.harvest.causes.push(e.id);
  }

  // The harvest closes when no sown field is left standing, or when Harvestmonth ends.
  const h = active.harvest;
  if (!h.done && h.sown > 0) {
    const open = fields.some((b) => b.crop!.sownThisYear && standing(b.crop!));
    const [, lastCut] = rules.harvestMonths;
    const monthEnd = month === lastCut && date.dayOfMonth === 28;
    if (!open || monthEnd || (month > lastCut && month < MONTHS_PER_YEAR)) {
      harvested = finishHarvest(content, active, emit, label);
    }
  }
  return harvested;
}
