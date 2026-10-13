// The site's stock (M3.3): items by id. Food is counted in meals, one meal item per person-day
// at a food need of 1. Everything here clamps at zero, so no caller can drive a count negative.

import type { ActiveSite, GoodId, WorldState } from '../core/types';
import type { ItemDef } from '../core/content-types';
import type { SiteContent } from './defs';

/** Raw food in the order it is eaten and cooked: grain first. */
const RAW_FOOD_ORDER = ['grain', 'fish', 'game', 'berries'];

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

/** Meals in store: every food item counts once. */
export function foodMeals(active: ActiveSite, content: Pick<SiteContent, 'items'>): number {
  let meals = 0;
  for (const item of foodItems(content)) meals += itemCount(active, item.id);
  return meals;
}

/** Raw (uncooked) food items in store. */
export function rawFood(active: ActiveSite, content: Pick<SiteContent, 'items'>): number {
  let n = 0;
  for (const item of foodItems(content)) if (!item.cooked) n += itemCount(active, item.id);
  return n;
}

/**
 * Takes up to `meals` food items: cooked meals first when `cookedFirst`, else raw first; raw goes
 * grain, fish, game, berries. Returns what was taken and how much of it was cooked.
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
      const got = takeItem(active, item.id, meals - taken);
      taken += got;
      if (item.cooked) cooked += got;
    }
  }
  return { taken, cooked };
}

/** Takes up to `count` raw food items, grain first (what a cook works from). */
export function takeRawFood(
  active: ActiveSite,
  content: Pick<SiteContent, 'items'>,
  count: number,
): number {
  let taken = 0;
  for (const item of foodItems(content)) {
    if (item.cooked || taken >= count) continue;
    taken += takeItem(active, item.id, count - taken);
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
