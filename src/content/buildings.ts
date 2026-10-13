// Building footprints (M3.1) and, from M3.3, what raising one takes. Footprints are in tiles; the
// glyph shows at the building's centre. `SITE.buildings` is this list.

import type { BuildingDef } from '../engine';

export const BUILDINGS: BuildingDef[] = [
  { id: 'hall', name: 'hall', glyph: 'H', w: 9, h: 6, walled: true, houses: ['kitchen'] },
  // 30 builder-blocks: three builders raise a home in about five days. Village life: 5 x 4 with a
  // 3 x 2 room (was 4 x 3 with a 2 x 1 room); homes in a row share their side walls.
  {
    id: 'home',
    name: 'home',
    glyph: 'h',
    w: 5,
    h: 4,
    walled: true,
    work: 30,
    cost: { logs: 250 },
    buildable: true,
  },
  { id: 'well', name: 'well', glyph: 'O', w: 2, h: 2 },
  { id: 'stockpile', name: 'stockpile', glyph: '=', w: 5, h: 4 },
  { id: 'shrine', name: 'shrine', glyph: '+', w: 4, h: 4 },
  // A field is sown, not built: no cost, and it never wears.
  { id: 'field', name: 'field', glyph: '"', w: 7, h: 5, work: 10 },
  { id: 'dock', name: 'dock', glyph: '≡', w: 2, h: 2 },
  {
    id: 'workshop',
    name: 'workshop',
    glyph: 'W',
    w: 5,
    h: 4,
    work: 40,
    cost: { logs: 300, stone: 200 },
    buildable: true,
  },
  // Village life: places to spend the day, laid out at embark once the site is this big.
  // The alehouse is where adults meet after work and on rest days.
  { id: 'alehouse', name: 'alehouse', glyph: 'A', w: 7, h: 5, walled: true, minPop: 40 },
  // The smith makes tools here (the toolmaking job), else in the workshop.
  {
    id: 'smithy',
    name: 'smithy',
    glyph: 'S',
    w: 5,
    h: 4,
    walled: true,
    houses: ['forge'],
    minPop: 60,
  },
  // The cooks bake here, else at the hall's hearth, else in the stockpile yard.
  {
    id: 'bakehouse',
    name: 'bakehouse',
    glyph: 'B',
    w: 5,
    h: 4,
    walled: true,
    houses: ['kitchen'],
    minPop: 80,
  },
  // A wall segment is raised against threats from M3.8; the steward never orders one yet.
  { id: 'wall', name: 'wall', glyph: '#', w: 1, h: 1, work: 4, cost: { stone: 40 } },
];
