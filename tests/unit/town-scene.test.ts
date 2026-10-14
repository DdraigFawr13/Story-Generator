import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { embark, type Building, type SimEvent } from '../../src/engine';
import {
  alongPath,
  buildingOf,
  defaultFollow,
  frameOf,
  glideAt,
  glideDone,
  isLabelled,
  placeName,
  recentTales,
  sharedRoom,
  townBuildings,
  type Resident,
} from '../../src/app/town/scene';
import { biggest, copy } from './helpers/site-fixture';

const DEFS = DEFAULT_CONTENT.site.buildings;

const building = (id: number, defId: string, x: number, y: number, w: number, h: number) =>
  ({ id, defId, x, y, w, h, followed: true, cells: [], owner: null, condition: 100 }) as Building;

describe('town scene: labels', () => {
  it('names the buildings with a purpose, and not homes, fields or walls', () => {
    for (const id of ['hall', 'alehouse', 'smithy', 'shrine', 'bakehouse', 'well']) {
      expect(isLabelled(id)).toBe(true);
    }
    for (const id of ['home', 'field', 'wall']) expect(isLabelled(id)).toBe(false);
  });

  it('writes the content name, and "Jarl’s hall" only where the ruler is a jarl', () => {
    expect(placeName(DEFS, 'alehouse', false)).toBe('Alehouse');
    expect(placeName(DEFS, 'hall', false)).toBe('Hall');
    expect(placeName(DEFS, 'hall', true)).toBe("Jarl's hall");
  });

  it('labels a built block, not one still being raised, and marks burnt ones', () => {
    const raising = { ...building(2, 'smithy', 20, 5, 5, 4), progress: 3 } as Building;
    const burnt = { ...building(3, 'bakehouse', 30, 5, 5, 4), burnt: true } as Building;
    const list = townBuildings(
      [building(1, 'alehouse', 10, 5, 7, 5), raising, burnt, building(4, 'home', 1, 1, 5, 4)],
      DEFS,
      false,
    );
    expect(list.map((b) => [b.defId, b.label, b.state])).toEqual([
      ['alehouse', 'Alehouse', 'built'],
      ['smithy', null, 'raising'],
      ['bakehouse', 'Bakehouse', 'burnt'],
      ['home', null, 'built'],
    ]);
  });

  it('labels exactly the purposeful blocks of a real embarked town', () => {
    const world = copy();
    const site = biggest(world);
    const active = embark(world, DEFAULT_CONTENT, site.id);
    const list = townBuildings(active.buildings.values(), DEFS, false);
    expect(list.length).toBe(active.buildings.size);
    for (const b of list) {
      expect(b.label !== null).toBe(!['home', 'field', 'wall'].includes(b.defId));
    }
    expect(list.some((b) => b.label === 'Alehouse' || b.label === 'Hall')).toBe(true);
  });
});

describe('town scene: who shares a room', () => {
  const blocks = townBuildings(
    [building(1, 'alehouse', 10, 10, 7, 5), building(2, 'home', 30, 10, 5, 4)],
    DEFS,
    false,
  );
  const people: Resident[] = [
    { id: 1, pos: [12, 12], placeId: 1 },
    { id: 2, pos: [13, 12], placeId: 1 },
    { id: 3, pos: [32, 11], placeId: 2 },
    { id: 4, pos: [50, 50], placeId: null },
    { id: 5, pos: [52, 51], placeId: null },
    { id: 6, pos: [80, 80], placeId: null },
    // No place from the engine, but standing inside the alehouse.
    { id: 7, pos: [11, 11], placeId: null },
  ];

  it('lists the others in the same building, by id', () => {
    const room = sharedRoom(people, blocks, 1);
    expect(room.building?.label).toBe('Alehouse');
    expect(room.ids).toEqual([2, 7]);
  });

  it('puts someone alone in their home with no company', () => {
    expect(sharedRoom(people, blocks, 3).ids).toEqual([]);
  });

  it('outdoors, shares with those outdoors and close, never with those indoors', () => {
    const room = sharedRoom(people, blocks, 4);
    expect(room.building).toBeNull();
    expect(room.ids).toEqual([5]);
  });

  it('finds the building by footprint when the engine named no place', () => {
    expect(buildingOf(people[6]!, blocks)?.id).toBe(1);
    expect(buildingOf(people[5]!, blocks)).toBeUndefined();
  });

  it('knows nobody who is not a resident', () => {
    expect(sharedRoom(people, blocks, 99)).toEqual({ building: null, ids: [] });
  });
});

describe('town scene: frame, follow and tales', () => {
  it('frames every building with a margin, inside the map', () => {
    const f = frameOf(
      [
        { x: 10, y: 20, w: 5, h: 4 },
        { x: 40, y: 30, w: 7, h: 5 },
      ],
      96,
      5,
    );
    expect(f).toEqual({ x: 5, y: 15, w: 47, h: 25 });
    expect(frameOf([{ x: 1, y: 1, w: 5, h: 4 }], 12, 5)).toEqual({ x: 0, y: 0, w: 11, h: 10 });
    expect(frameOf([], 96, 5)).toEqual({ x: 0, y: 0, w: 96, h: 96 });
  });

  it('follows the ruler when they live here, else the first resident', () => {
    expect(defaultFollow([4, 5, 6], 5)).toBe(5);
    expect(defaultFollow([4, 5, 6], 9)).toBe(4);
    expect(defaultFollow([], 9)).toBeNull();
  });

  it('keeps the recent, important tales from before the watch, newest first', () => {
    const ev = (id: number, day: number, importance: number) =>
      ({
        id,
        day,
        importance,
        type: 'x',
        actors: [],
        place: null,
        causes: [],
        data: {},
      }) as SimEvent;
    const all = new Map(
      [ev(1, 10, 9), ev(2, 30, 9), ev(3, 40, 2), ev(4, 50, 9), ev(5, 20, 9)].map((e) => [e.id, e]),
    );
    const got = recentTales([1, 2, 3, 4, 5, 6], (id) => all.get(id), 45, 5, 2);
    expect(got.map((e) => e.id)).toEqual([2, 5]);
  });
});

describe('town scene: easing', () => {
  it('eases between two points and never overshoots', () => {
    const g = { fx: 0, fy: 0, tx: 10, ty: 4, start: 100, duration: 200 };
    expect(glideAt(g, 100)).toEqual({ x: 0, y: 0 });
    expect(glideAt(g, 200)).toEqual({ x: 5, y: 2 });
    expect(glideAt(g, 300)).toEqual({ x: 10, y: 4 });
    expect(glideAt(g, 9999)).toEqual({ x: 10, y: 4 });
    expect(glideDone(g, 250)).toBe(false);
    expect(glideDone(g, 300)).toBe(true);
    let last = -1;
    for (let t = 100; t <= 300; t += 10) {
      const x = glideAt(g, t).x;
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
  });

  it('puts a zero-length glide at its end at once', () => {
    expect(glideAt({ fx: 1, fy: 1, tx: 3, ty: 3, start: 0, duration: 0 }, 0)).toEqual({
      x: 3,
      y: 3,
    });
  });

  it('walks along a route by length', () => {
    const path = [
      [0, 0],
      [4, 0],
      [4, 4],
    ] as const;
    expect(alongPath(path, 0.5)).toEqual({ x: 4, y: 0 });
    expect(alongPath(path, 0.75)).toEqual({ x: 4, y: 2 });
    expect(alongPath(path, 1)).toEqual({ x: 4, y: 4 });
    const g = { fx: 0, fy: 0, tx: 4, ty: 4, start: 0, duration: 100, path };
    expect(glideAt(g, 50)).toEqual({ x: 4, y: 0 });
  });
});
