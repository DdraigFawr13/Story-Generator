// Items (M3.3): what a site keeps in stock and what notables carry. Stock entries convert to the
// world's five goods through `good` and `per` when a site is left; artifact and book entries are
// never stocked, they stand for the world `Item` records by form. Add entries freely.

import type { ItemDef } from '../engine';
import { NOTABLES } from './notables';

// One meal is one food item, and a person-year of food is 336 meals (the year is 336 days).
const MEAL = 1 / 336;

export const ITEMS: ItemDef[] = [
  // Raw food and the cooked meal (4 meals from 3 raw, see the cook job).
  // Spoilage (M3.4): grain loses 0.6% a month; fish, game and berries a quarter; smoked or salted
  // food 1%; a cooked meal keeps two days (half is gone each day).
  { id: 'grain', name: 'grain', good: 'food', per: MEAL, kind: 'food', spoilPerMonth: 0.006 },
  { id: 'fish', name: 'fish', good: 'food', per: MEAL, kind: 'food', spoilPerMonth: 0.25 },
  { id: 'game', name: 'game', good: 'food', per: MEAL, kind: 'food', spoilPerMonth: 0.25 },
  { id: 'berries', name: 'berries', good: 'food', per: MEAL, kind: 'food', spoilPerMonth: 0.25 },
  {
    id: 'preserved',
    name: 'preserved food',
    good: 'food',
    per: MEAL,
    kind: 'food',
    spoilPerMonth: 0.01,
  },
  {
    id: 'meal',
    name: 'cooked meals',
    good: 'food',
    per: MEAL,
    kind: 'food',
    cooked: true,
    spoilPerDay: 0.5,
  },
  // Non-food values are set so one block of work is worth a small, round share of a world good;
  // they keep a year of site work in the order of history's goodsPerWorker (content/history.ts).
  { id: 'logs', name: 'logs', good: 'timber', per: 0.01, kind: 'material' },
  // The goods vector has no stone, so it counts as cheap ore.
  { id: 'stone', name: 'stone', good: 'ore', per: 0.002, kind: 'material' },
  { id: 'ore', name: 'ore', good: 'ore', per: 0.01, kind: 'material' },
  { id: 'salt', name: 'salt', good: 'salt', per: 0.01, kind: 'material' },
  { id: 'tools', name: 'tools', good: 'ore', per: 0.02, kind: 'tool' },
  { id: 'wares', name: 'wares', good: 'luxury', per: 0.002, kind: 'goods' },
  { id: 'herbs', name: 'herbs', good: 'luxury', per: 0.001, kind: 'goods' },
  // Artifacts, by form (notables.ts artifactForms). Envy and theft follow the valuable ones, and
  // magic has a price (R-29): the ring and the cup curse their holders.
  {
    id: 'blade',
    name: 'blade',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['sword', 'axe'],
    effects: [{ kind: 'combat', value: 2 }],
    downsides: ['envy', 'theftDraw'],
  },
  {
    id: 'bow',
    name: 'bow',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['bow'],
    effects: [
      { kind: 'combat', value: 1 },
      { kind: 'attribute', attribute: 'perception', bonus: 1 },
    ],
    downsides: ['envy'],
  },
  {
    id: 'helm',
    name: 'helm',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['helm'],
    effects: [
      { kind: 'combat', value: 1 },
      { kind: 'attribute', attribute: 'endurance', bonus: 1 },
    ],
  },
  {
    id: 'crown',
    name: 'crown',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['crown', 'torc'],
    effects: [{ kind: 'attribute', attribute: 'charisma', bonus: 2 }],
    downsides: ['envy', 'theftDraw'],
  },
  {
    id: 'ring',
    name: 'ring',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['ring'],
    effects: [{ kind: 'power', bonus: 3 }],
    downsides: ['curse'],
  },
  {
    id: 'cup',
    name: 'cup',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['cup'],
    effects: [{ kind: 'attribute', attribute: 'willpower', bonus: 1 }],
    downsides: ['curse'],
  },
  {
    id: 'harp',
    name: 'harp',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['harp'],
    effects: [{ kind: 'attribute', attribute: 'charisma', bonus: 1 }],
  },
  {
    id: 'banner',
    name: 'banner',
    good: 'luxury',
    per: 1,
    kind: 'artifact',
    forms: ['banner'],
    effects: [
      { kind: 'attribute', attribute: 'charisma', bonus: 1 },
      { kind: 'attribute', attribute: 'willpower', bonus: 1 },
    ],
    downsides: ['envy'],
  },
  // Every book form is one entry. A book teaches no ability yet: learning from books is M3.9.
  {
    id: 'book',
    name: 'book',
    good: 'luxury',
    per: 1,
    kind: 'book',
    forms: [...new Set(Object.values(NOTABLES.bookForms).flat())],
    effects: [{ kind: 'attribute', attribute: 'intellect', bonus: 1 }],
  },
];
