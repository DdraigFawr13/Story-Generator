import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import { embark, sitePopulation, type Building, type SimEvent } from '../../src/engine';
import {
  alongPath,
  boxesHit,
  buildingOf,
  clampView,
  crowds,
  defaultFollow,
  frameOf,
  glideAlpha,
  glideAt,
  glideDone,
  isLabelled,
  keepInside,
  labelRank,
  leaveDelay,
  pacing,
  pathLength,
  peopleLine,
  placeLabels,
  placeName,
  recentTales,
  sharedRoom,
  snapSheet,
  townBuildings,
  walkMs,
  zoomAt,
  type LabelAsk,
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

describe('town scene: honest counts', () => {
  it('never offers more people to follow than there are', () => {
    expect(peopleLine(12, 36)).toEqual({ people: 36, followed: 36, all: true });
    expect(peopleLine(1064, 150)).toEqual({ people: 1064, followed: 150, all: false });
    expect(peopleLine(0, 0)).toEqual({ people: 0, followed: 0, all: true });
    for (const total of [0, 3, 12, 150, 1064]) {
      for (const drawn of [0, 1, 12, 36, 150, 2000]) {
        const line = peopleLine(total, drawn);
        expect(line.followed).toBeLessThanOrEqual(line.people);
      }
    }
  });

  it('keeps the followable count within the people of a real embarked town', () => {
    const world = copy();
    const site = biggest(world);
    const active = embark(world, DEFAULT_CONTENT, site.id);
    const line = peopleLine(sitePopulation(site), active.residents.length);
    expect(line.followed).toBeLessThanOrEqual(line.people);
    expect(line.followed).toBe(active.residents.length);
  });
});

describe('town scene: labels', () => {
  const ask = (key: string, rank: number, x: number, y: number, w = 60, h = 20): LabelAsk => ({
    key,
    rank,
    x,
    y,
    w,
    h,
  });

  it('ranks the hall, then the alehouse, then the shrine, then the rest', () => {
    expect(
      ['smithy', 'shrine', 'alehouse', 'hall', 'well'].sort((a, b) => labelRank(a) - labelRank(b)),
    ).toEqual(['hall', 'alehouse', 'shrine', 'smithy', 'well']);
  });

  it('keeps the higher-ranked label and skips the one that overlaps it', () => {
    const { kept, skipped } = placeLabels([
      ask('well', 3, 0, 0),
      ask('hall', 0, 30, 5),
      ask('shrine', 2, 200, 0),
    ]);
    expect(kept).toEqual(['hall', 'shrine']);
    expect(skipped).toEqual(['well']);
  });

  it('never keeps two labels that overlap, however crowded', () => {
    const asks: LabelAsk[] = [];
    for (let i = 0; i < 40; i += 1) {
      asks.push(ask(`b${i}`, i % 4, (i * 37) % 200, (i * 53) % 120, 40 + (i % 5) * 10, 18));
    }
    const { kept, skipped } = placeLabels(asks);
    expect(kept.length + skipped.length).toBe(asks.length);
    const boxes = kept.map((k) => asks.find((a) => a.key === k)!);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesHit(boxes[i]!, boxes[j]!)).toBe(false);
      }
    }
    // The first label asked for at the best rank is always kept.
    expect(kept).toContain('b0');
  });

  it('lets boxes that only touch both stay', () => {
    expect(boxesHit({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it('keeps a label inside a 390 px canvas, shifting it sideways', () => {
    const left = keepInside({ x: -30, y: 100, w: 70, h: 20 }, 390, 600, 3);
    expect(left.x).toBe(3);
    const right = keepInside({ x: 370, y: 100, w: 70, h: 20 }, 390, 600, 3);
    expect(right.x + right.w).toBe(387);
    const low = keepInside({ x: 100, y: 610, w: 70, h: 20 }, 390, 600, 3);
    expect(low.y + low.h).toBe(597);
  });
});

describe('town scene: pace and stagger', () => {
  it('gives each person their own delay inside part of the block, steady for an id', () => {
    const spread = pacing(0.25).spreadMs;
    expect(spread).toBeGreaterThan(0);
    const delays = Array.from({ length: 200 }, (_, id) => leaveDelay(id + 1, spread));
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(spread);
    }
    expect(new Set(delays).size).toBeGreaterThan(100);
    expect(leaveDelay(77, spread)).toBe(leaveDelay(77, spread));
    // Nobody leaves on the beat: not more than a few of 200 have no delay.
    expect(delays.filter((d) => d === 0).length).toBeLessThan(5);
  });

  it('uses the engine leave time when there is one, and the id hash when not', () => {
    const spread = 1000;
    expect(leaveDelay(5, spread, 0)).toBe(0);
    expect(leaveDelay(5, spread, 0.375)).toBe(500);
    expect(leaveDelay(5, spread, 0.75)).toBe(spread);
    expect(leaveDelay(5, spread, 2)).toBe(spread);
    expect(leaveDelay(5, spread, undefined)).toBe(leaveDelay(5, spread));
  });

  it('spreads departures over less than a block, and fades instead of walking at fast speeds', () => {
    for (const speed of [0.125, 0.25, 0.5, 1]) {
      const pace = pacing(speed);
      expect(pace.fade).toBe(false);
      expect(pace.spreadMs).toBeLessThan((250 / speed) * 0.5);
      expect(pace.spreadMs).toBeGreaterThan(0);
    }
    for (const speed of [4, 16]) {
      expect(pacing(speed)).toMatchObject({ fade: true, spreadMs: 0 });
    }
  });

  it('never lets a walk exceed the on-screen speed cap', () => {
    const tiles = 40;
    const px = 10;
    const ms = walkMs(260, tiles, px);
    expect((tiles * px * 1000) / ms).toBeLessThanOrEqual(200 + 1e-9);
    expect(walkMs(900, 1, px)).toBe(900);
    expect(
      pathLength([
        [0, 0],
        [3, 4],
        [3, 6],
      ]),
    ).toBe(7);
  });

  it('fades a dot out where it was and in where it is going', () => {
    const g = { fx: 0, fy: 0, tx: 9, ty: 9, start: 100, duration: 200, fade: true };
    expect(glideAt(g, 120)).toEqual({ x: 0, y: 0 });
    expect(glideAt(g, 250)).toEqual({ x: 9, y: 9 });
    expect(glideAlpha(g, 100)).toBe(1);
    expect(glideAlpha(g, 200)).toBeLessThan(0.3);
    expect(glideAlpha(g, 300)).toBe(1);
    expect(glideAlpha({ ...g, fade: false }, 200)).toBe(1);
  });

  it('holds a dot at its start until its delayed departure', () => {
    const g = { fx: 1, fy: 1, tx: 5, ty: 5, start: 500, duration: 200 };
    expect(glideAt(g, 100)).toEqual({ x: 1, y: 1 });
    expect(glideDone(g, 100)).toBe(false);
  });
});

describe('town scene: crowds, zoom and sheet', () => {
  it('counts a building only past three people', () => {
    const inside = [1, 1, 1, 2, 2, 2, 2, 3, null, null, null, null, null];
    expect([...crowds(inside)]).toEqual([[2, 4]]);
  });

  it('keeps a zoomed town covering the canvas', () => {
    const frame = { x: 12, y: 100, w: 366, h: 300 };
    expect(clampView({ k: 1, x: 40, y: 40 }, frame, 390, 600)).toEqual({ k: 1, x: 0, y: 0 });
    const far = clampView({ k: 3, x: 5000, y: -5000 }, frame, 390, 600);
    expect(far.k).toBe(3);
    // Left edge at or left of the canvas edge, right edge at or past the other.
    expect(frame.x * 3 + far.x).toBeLessThanOrEqual(0);
    const away = clampView({ k: 3, x: -5000, y: -5000 }, frame, 390, 600);
    expect((frame.x + frame.w) * 3 + away.x).toBeGreaterThanOrEqual(390);
    expect(clampView({ k: 99, x: 0, y: 0 }, frame, 390, 600).k).toBe(5);
  });

  it('zooms about a point so it stays under the finger', () => {
    const v = zoomAt({ k: 1, x: 0, y: 0 }, 2, 100, 50);
    expect(v).toEqual({ k: 2, x: -100, y: -50 });
    expect(zoomAt(v, 0.1, 0, 0).k).toBe(1);
  });

  it('snaps a dragged sheet to peek or open', () => {
    expect(snapSheet(300, 190, 557, 0)).toBe('peek');
    expect(snapSheet(400, 190, 557, 0)).toBe('open');
    expect(snapSheet(250, 190, 557, -0.9)).toBe('open');
    expect(snapSheet(500, 190, 557, 0.9)).toBe('peek');
  });
});
