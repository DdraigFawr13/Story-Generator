// The site's stock (M3.3): items by id. Food is counted in meals, one meal item per person-day
// at a food need of 1. Everything here clamps at zero, so no caller can drive a count negative.

import type { EmitInput } from '../core/context';
import { DAYS_PER_MONTH, dateOf } from '../core/clock';
import type { ActiveSite, GoodId, Id, SimEvent, WorldState } from '../core/types';
import type { ItemDef } from '../core/content-types';
import type { SiteLabel } from './build';
import type { SiteContent } from './defs';

/**
 * Raw food in the order it is eaten and cooked: what spoils fastest first (fish, game, berries),
 * then grain, then preserved food, which keeps best (M3.4; M3.3 ate grain first, which left the
 * fish to rot beside a full granary).
 */
const RAW_FOOD_ORDER = ['fish', 'game', 'berries', 'grain', 'preserved'];

const foodOrders = new WeakMap<readonly ItemDef[], ItemDef[]>();

/** Food items, cooked first and then raw in `RAW_FOOD_ORDER`; the list is shared, do not change it. */
function foodItems(content: Pick<SiteContent, 'items'>): readonly ItemDef[] {
  let order = foodOrders.get(content.items);
  if (!order) {
    const rank = (i: ItemDef) =>
      i.cooked ? -1 : RAW_FOOD_ORDER.includes(i.id) ? RAW_FOOD_ORDER.indexOf(i.id) : 99;
    order = content.items.filter((i) => i.kind === 'food').sort((a, b) => rank(a) - rank(b));
    foodOrders.set(content.items, order);
  }
  return order;
}

export function itemCount(active: ActiveSite, id: string): number {
  return active.stock.get(id) ?? 0;
}

/** Adds `count` items (a non-positive count adds nothing). */
export function addItem(active: ActiveSite, id: string, count: number): void {
  if (count > 0) active.stock.set(id, itemCount(active, id) + count);
}

/** Takes up to `count` items and returns how many came out; the stock never goes below zero. */
export function takeItem(active: ActiveSite, id: string, count: number): number {
  const taken = Math.max(0, Math.min(count, itemCount(active, id)));
  if (taken > 0) active.stock.set(id, itemCount(active, id) - taken);
  return taken;
}

/** What the stock is worth in one world good (Σ count × per). */
export function goodAmount(
  active: ActiveSite,
  content: Pick<SiteContent, 'items'>,
  good: GoodId,
): number {
  let total = 0;
  for (const item of content.items) {
    if (item.good !== good) continue;
    const count = active.stock.get(item.id);
    if (count) total += count * item.per;
  }
  return total;
}

/** The grain item holds the seed corn (M3.4). */
export const SEED_ITEM = 'grain';

/** Food items of a kind that may be eaten or cooked: grain less the seed kept back for sowing. */
function eatable(active: ActiveSite, id: string): number {
  const n = itemCount(active, id);
  return id === SEED_ITEM ? Math.max(0, n - active.harvest.seedKept) : n;
}

/** Meals in store: every food item counts once; seed corn is not food. */
export function foodMeals(active: ActiveSite, content: Pick<SiteContent, 'items'>): number {
  let meals = 0;
  for (const item of foodItems(content)) meals += eatable(active, item.id);
  return meals;
}

/** Raw (uncooked) food items in store, less the seed corn. */
export function rawFood(active: ActiveSite, content: Pick<SiteContent, 'items'>): number {
  let n = 0;
  for (const item of foodItems(content)) if (!item.cooked) n += eatable(active, item.id);
  return n;
}

/**
 * Takes up to `meals` food items: cooked meals first when `cookedFirst`, else raw first; raw goes
 * in `RAW_FOOD_ORDER`, leaving the seed corn. Returns what was taken and how much of it was cooked.
 */
export function takeFood(
  active: ActiveSite,
  content: Pick<SiteContent, 'items'>,
  meals: number,
  cookedFirst: boolean,
): { taken: number; cooked: number } {
  const order = foodItems(content);
  let taken = 0;
  let cooked = 0;
  // Two sweeps: the preferred kind first (the list is cooked, then raw in eating order).
  for (const wantCooked of [cookedFirst, !cookedFirst]) {
    for (const item of order) {
      if (taken >= meals) break;
      if (!!item.cooked !== wantCooked) continue;
      const got = takeItem(active, item.id, Math.min(meals - taken, eatable(active, item.id)));
      taken += got;
      if (item.cooked) cooked += got;
    }
  }
  return { taken, cooked };
}

/** Takes up to `count` raw food items in `RAW_FOOD_ORDER`, leaving the seed corn (what a cook works from). */
export function takeRawFood(
  active: ActiveSite,
  content: Pick<SiteContent, 'items'>,
  count: number,
): number {
  let taken = 0;
  for (const item of foodItems(content)) {
    if (item.cooked || taken >= count) continue;
    taken += takeItem(active, item.id, Math.min(count - taken, eatable(active, item.id)));
  }
  return taken;
}

/** Days the stores feed the followed residents at one meal a day; Infinity when nobody eats. */
export function foodDaysLeft(
  world: WorldState,
  content: Pick<SiteContent, 'items' | 'races'>,
): number {
  const active = world.activeSite;
  if (!active) return Infinity;
  const races = new Map(content.races.map((r) => [r.id, r]));
  let perDay = 0;
  for (const id of active.residents) {
    const person = world.people.get(id);
    const race = person && races.get(person.raceId);
    if (race) perDay += race.foodNeed;
  }
  return perDay > 0 ? foodMeals(active, content) / perDay : Infinity;
}

// ---- Spoilage, preserving and short meals (M3.4) ----

/**
 * Spoils the day's share of every food item: the item's monthly rate over 28 days (its daily rate
 * if it has one), faster in heat and slower in frost. Spoiled raw food is counted for the month.
 */
export function spoilStock(
  active: ActiveSite,
  content: Pick<SiteContent, 'items' | 'environment'>,
  tempC: number,
  day: number,
): void {
  const rules = content.environment.spoilage;
  // The counts start again on the first of the month and of the year, so the Site tab and the
  // month's chronicle line (on its last day) count the same days.
  if (day % DAYS_PER_MONTH === 0) active.spoiled.month = 0;
  if (dateOf(day).month === 0 && day % DAYS_PER_MONTH === 0) active.spoiled.year = 0;
  const weather =
    tempC > rules.warmAboveC ? rules.warmMul : tempC < rules.coldBelowC ? rules.coldMul : 1;
  for (const item of content.items) {
    if (item.kind !== 'food') continue;
    const rate = item.spoilPerDay ?? (item.spoilPerMonth ?? 0) / DAYS_PER_MONTH;
    const count = active.stock.get(item.id);
    if (!count || rate <= 0) continue;
    const lost = Math.min(count, count * rate * weather);
    active.stock.set(item.id, count - lost);
    if (!item.cooked) {
      active.spoiled.month += lost;
      active.spoiled.year += lost;
      active.spoiled.total += lost;
    }
  }
}

/** On the last day of a month, after the day's spoilage, says so when the month's spoilage was large. */
export function reportSpoilage(
  content: Pick<SiteContent, 'environment'>,
  active: ActiveSite,
  emit: (input: EmitInput) => SimEvent,
  label: SiteLabel,
  day: number,
): void {
  if ((day + 1) % DAYS_PER_MONTH !== 0) return;
  const meals = Math.round(active.spoiled.month);
  if (meals <= content.environment.spoilage.reportAbove) return;
  emit({
    type: content.environment.events.spoiled,
    place: label.cell,
    data: { site: label.name, meals },
  });
}

/**
 * A cook's block turns fish and game into preserved food while salt lasts (1 salt for
 * `itemsPerSalt` items, up to `perBlock` items at effectiveness 1). Returns how many were made.
 */
export function preserveFood(
  active: ActiveSite,
  content: Pick<SiteContent, 'environment'>,
  effectiveness: number,
): number {
  const rules = content.environment.spoilage.preserve;
  let room = Math.min(
    rules.perBlock * effectiveness,
    itemCount(active, rules.salt) * rules.itemsPerSalt,
  );
  let made = 0;
  for (const id of rules.from) {
    if (!(room > 0)) break;
    const got = takeItem(active, id, room);
    made += got;
    room -= got;
  }
  if (made > 0) {
    takeItem(active, rules.salt, made / rules.itemsPerSalt);
    addItem(active, rules.to, made);
  }
  return made;
}

/** Meals the followed residents eat in a day at full meals. */
export function mealsPerDay(
  world: WorldState,
  content: Pick<SiteContent, 'races'>,
  active: ActiveSite,
): number {
  const races = new Map(content.races.map((r) => [r.id, r]));
  let perDay = 0;
  for (const id of active.residents) {
    const person = world.people.get(id);
    const race = person && races.get(person.raceId);
    if (race) perDay += race.foodNeed;
  }
  return perDay;
}

/** Days from `day` to the first day of the next harvest month, or 0 inside the harvest months. */
export function daysToHarvest(content: Pick<SiteContent, 'environment'>, day: number): number {
  const { harvestMonth } = content.environment.meals;
  const [, lastCut] = content.environment.crop.harvestMonths;
  const date = dateOf(day);
  if (date.month >= harvestMonth && date.month <= lastCut) return 0;
  const monthsAhead = (harvestMonth - date.month + 12) % 12;
  return monthsAhead * DAYS_PER_MONTH - (date.dayOfMonth - 1);
}

/**
 * The steward weighs the stores against the days to the next harvest (on the first of each month
 * and the day of embarking) and sets the share of a meal everyone eats, from a full meal down to
 * `floor`. Never in the harvest months. Says so when meals are cut and when they are full again.
 */
export function planMeals(
  world: WorldState,
  content: SiteContent,
  active: ActiveSite,
  emit: (input: EmitInput) => SimEvent,
  label: SiteLabel,
): void {
  const rules = content.environment.meals;
  const day = world.day;
  if (day % rules.planEveryDays !== 0 && day !== active.enteredDay) return;
  const perDay = mealsPerDay(world, content, active);
  const days = daysToHarvest(content, day);
  let share = 1;
  if (days > 0 && perDay > 0) {
    // What is in store, plus the fish, game and berries expected before then, less what spoils.
    const stored = foodMeals(active, content);
    const spoilRate =
      (content.items.find((i) => i.id === 'grain')?.spoilPerMonth ?? 0) / DAYS_PER_MONTH;
    const projected =
      stored + perDay * content.environment.crop.otherFoodShare * days - stored * spoilRate * days;
    share = Math.min(1, Math.max(rules.floor, projected / (perDay * days)));
    if (share > rules.roundUpAbove) share = 1;
  }
  const was = active.mealShare;
  active.mealShare = share;
  if (share < 1 && was >= 1) {
    const causes: Id[] = [];
    if (active.harvest.poorEvent !== null) causes.push(active.harvest.poorEvent);
    else if (active.storesEmptyEvent !== null) causes.push(active.storesEmptyEvent);
    active.shortMealsSince = day;
    active.shortMealsEvent = emit({
      type: content.environment.events.mealsCut,
      place: label.cell,
      causes,
      data: { site: label.name, percent: Math.round(share * 100), days },
    }).id;
  } else if (share >= 1 && was < 1) {
    emit({
      type: content.environment.events.mealsRestored,
      place: label.cell,
      causes: active.shortMealsEvent === null ? [] : [active.shortMealsEvent],
      data: { site: label.name },
    });
    active.shortMealsEvent = null;
    active.shortMealsSince = -1;
  }
}
