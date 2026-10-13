// Building footprints (M3.1) and, from M3.3, what raising one takes. Footprints are in tiles; the
// glyph shows at the building's centre. `SITE.buildings` is this list.

import type { BuildingDef } from '../engine';

export const BUILDINGS: BuildingDef[] = [
  { id: 'hall', name: 'hall', glyph: 'H', w: 9, h: 6 },
  // 30 builder-blocks: three builders raise a home in about five days.
  {
    id: 'home',
    name: 'home',
    glyph: 'h',
    w: 4,
    h: 3,
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
  // A wall segment is raised against threats from M3.8; the steward never orders one yet.
  { id: 'wall', name: 'wall', glyph: '#', w: 1, h: 1, work: 4, cost: { stone: 40 } },
];
