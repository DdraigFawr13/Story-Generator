import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import type { Building, LocalMap } from '../../src/engine';
import {
  clampViewport,
  elevationBands,
  fieldLabelSpots,
  formatSelection,
  initials,
  buildPercent,
  makeLookCtx,
  tileName,
  parseSelection,
  quarterOf,
  relation,
  rulerWord,
  tileAtPoint,
  tileLook,
  zoomSteps,
} from '../../src/app/site-render';

const RULES = DEFAULT_CONTENT.site;
const code = (list: { id: string }[], id: string) => list.findIndex((e) => e.id === id);
const T = (id: string) => code(RULES.terrains, id);

/** An 12x12 map: grass everywhere, a river column, a pine, ore rock, a field, a followed and a counted home. */
function smallMap() {
  const size = 12;
  const total = size * size;
  const map: LocalMap = {
    width: size,
    height: size,
    elevation: new Int16Array(total),
    terrain: new Uint8Array(total),
    water: new Uint8Array(total),
    tree: new Uint8Array(total),
    mineral: new Uint8Array(total),
    building: new Uint16Array(total),
    cellX: 5,
    cellY: 5,
    bridges: [],
  };
  const at = (x: number, y: number) => y * size + x;
  // Heights rise from the west edge (0 m) to the east edge (110 m), so all four bands appear.
  for (let k = 0; k < total; k += 1) map.elevation[k] = (k % size) * 10;
  map.water[at(0, 5)] = code(RULES.waters, 'river');
  map.terrain[at(2, 2)] = T('rock');
  map.mineral[at(2, 2)] = code(RULES.minerals, 'ore');
  map.tree[at(3, 3)] = code(RULES.trees, 'conifer');
  map.water[at(0, 6)] = code(RULES.waters, 'river');
  map.terrain[at(0, 6)] = T('path');
  map.bridges.push(at(0, 6));
  const buildings = new Map<number, Building>();
  const stamp = (
    id: number,
    defId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    followed: boolean,
  ) => {
    const cells: number[] = [];
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        cells.push(at(xx, yy));
        map.building[at(xx, yy)] = id;
        const edge = yy === y || yy === y + h - 1 || xx === x || xx === x + w - 1;
        map.terrain[at(xx, yy)] = defId === 'field' ? T('field') : edge ? T('wall') : T('floor');
      }
    }
    buildings.set(id, { id, defId, cells, owner: null, condition: 100, x, y, w, h, followed });
  };
  stamp(1, 'home', 6, 1, 4, 3, true);
  stamp(2, 'home', 6, 6, 4, 3, false);
  stamp(3, 'field', 1, 8, 3, 2, true);
  return { map, buildings, at };
}

describe('zoomSteps', () => {
  it('fits the whole 96-tile site at the largest whole scale, between 3 and 8 px', () => {
    expect(zoomSteps(640, 96)).toEqual([6, 9, 14, 20, 28]);
    expect(zoomSteps(300, 96)).toEqual([3, 9, 14, 20, 28]);
    expect(zoomSteps(100, 96)).toEqual([3, 9, 14, 20, 28]);
    expect(zoomSteps(1200, 96)).toEqual([8, 9, 14, 20, 28]);
  });
});

describe('view and hit testing', () => {
  it('finds the tile under a point and nothing off the map', () => {
    const view = { z: 2, cx: 48, cy: 48 };
    // 14 px tiles in a 280 px box: the centre point is the corner of tile 48, 48.
    expect(tileAtPoint(140, 140, view, 14, 280, 280, 96)).toEqual({ x: 48, y: 48 });
    expect(tileAtPoint(139, 139, view, 14, 280, 280, 96)).toEqual({ x: 47, y: 47 });
    expect(tileAtPoint(0, 0, { z: 2, cx: 0, cy: 0 }, 14, 280, 280, 96)).toBeNull();
  });

  it('keeps the view over the map and centres a map smaller than the view', () => {
    expect(clampViewport({ z: 3, cx: 0, cy: 200 }, 20, 400, 400, 96)).toEqual({
      z: 3,
      cx: 10,
      cy: 86,
    });
    expect(clampViewport({ z: 0, cx: 5, cy: 5 }, 3, 600, 600, 96)).toEqual({
      z: 0,
      cx: 48,
      cy: 48,
    });
  });
});

describe('tile looks', () => {
  const { map, buildings, at } = smallMap();
  const ctx = makeLookCtx(map, RULES, buildings);

  it('shades land in four elevation bands', () => {
    const bands = elevationBands(map);
    expect(bands[at(1, 0)]).toBe(0);
    expect(bands[at(11, 0)]).toBe(3);
    expect(new Set(bands)).toEqual(new Set([0, 1, 2, 3]));
  });

  it('draws terrain, trees, ore, water and bridges from tokens', () => {
    const grass = tileLook(ctx, at(1, 0));
    expect([grass.bg, grass.ink]).toEqual(['t-grass', 't-grass-ink']);
    expect(grass.band).toBe(0);
    const pine = tileLook(ctx, at(3, 3));
    expect([pine.bg, pine.glyph, pine.ink]).toEqual(['t-wood', RULES.trees[2]!.glyph, 't-pine']);
    const ore = tileLook(ctx, at(2, 2));
    expect([ore.bg, ore.glyph, ore.ink]).toEqual(['t-rock', '*', 't-ore']);
    expect(tileLook(ctx, at(0, 5)).bg).toBe('t-river');
    const bridge = tileLook(ctx, at(0, 6));
    expect([bridge.bg, bridge.glyph]).toEqual(['t-path', RULES.bridgeGlyph]);
  });

  it('draws followed homes as walls and doors, counted homes hatched', () => {
    const wall = tileLook(ctx, at(6, 1));
    expect([wall.bg, wall.glyph, wall.ink, wall.under]).toEqual([
      't-wall',
      '#',
      't-wall-ink',
      null,
    ]);
    const door = tileLook(ctx, at(8, 3));
    expect([door.bg, door.glyph, door.ink]).toEqual(['t-floor', '∩', 't-door']);
    const counted = tileLook(ctx, at(6, 6));
    expect([counted.bg, counted.under]).toEqual(['t-cwall', 't-counted']);
    expect(tileLook(ctx, at(7, 7)).bg).toBe('t-counted');
    expect(tileLook(ctx, at(8, 8)).glyph).toBe('∩');
    expect(tileLook(ctx, at(2, 8)).bg).toBe('t-field');
  });

  it('shows a building being raised as bare ground and names its progress', () => {
    const home = ctx.buildings.get(1)!;
    home.progress = 12;
    const work = RULES.buildings.find((d) => d.id === 'home')!.work!;
    expect(tileLook(ctx, at(6, 1)).bg).toBe('t-grass');
    expect(buildPercent(RULES, home)).toBe(Math.round((12 / work) * 100));
    expect(tileName(ctx, at(6, 1), 'the river', 'the sea')).toBe(
      `Home (being built, ${buildPercent(RULES, home)}%)`,
    );
    delete home.progress;
    expect(tileLook(ctx, at(6, 1)).bg).toBe('t-wall');
  });

  it('outlines the hall quarter around the followed homes', () => {
    expect(quarterOf([...buildings.values()])).toEqual([6, 1, 4, 3]);
    expect(quarterOf([])).toEqual([0, 0, 0, 0]);
  });
});

describe('small helpers', () => {
  it('writes and reads selections for the link', () => {
    expect(formatSelection({ kind: 'person', id: 776 }, 96)).toBe('person:776');
    expect(formatSelection({ kind: 'tile', id: 47 * 96 + 65 }, 96)).toBe('tile:65,47');
    expect(parseSelection('tile:65,47', 96)).toEqual({ kind: 'tile', id: 47 * 96 + 65 });
    expect(parseSelection('household:3', 96)).toEqual({ kind: 'household', id: 3 });
    expect(parseSelection('tile:200,3', 96)).toBeNull();
    expect(parseSelection('person:3,4', 96)).toBeNull();
    expect(parseSelection('nope:1', 96)).toBeNull();
    expect(parseSelection(null, 96)).toBeNull();
  });

  it('shows adults capitalised and children in lower case', () => {
    expect(initials('Stenna Ormsdottir', 2, false)).toBe('St');
    expect(initials('Stenna', 1, false)).toBe('S');
    expect(initials('Stenna', 2, true)).toBe('st');
    expect(initials('', 2, false)).toBe('?');
  });

  it('calls a jarldom ruler a jarl and any other ruler a ruler', () => {
    expect(rulerWord('jarldom')).toBe('jarl');
    expect(rulerWord('khanate')).toBe('ruler');
    expect(rulerWord(undefined)).toBe('ruler');
  });

  it('names how a household member relates to the head', () => {
    const head = { id: 1, spouses: [2], children: [3], parents: [10] };
    const person = (id: number, sex: 'f' | 'm', parents: number[], spouses: number[] = []) => ({
      id,
      sex,
      parents,
      spouses,
    });
    const parentsOf = (id: number) => (id === 10 ? [20] : []);
    expect(relation(head, person(1, 'f', [10]), parentsOf)).toBe('head of the household');
    expect(relation(head, person(2, 'm', [], [1]), parentsOf)).toBe('spouse');
    expect(relation(head, person(3, 'f', [1]), parentsOf)).toBe('daughter');
    expect(relation(head, person(10, 'm', [20]), parentsOf)).toBe('father');
    expect(relation(head, person(4, 'm', [3]), parentsOf)).toBe('grandchild');
    expect(relation(head, person(20, 'f', []), parentsOf)).toBe('grandmother');
    expect(relation(head, person(5, 'm', [10]), parentsOf)).toBe('brother');
    expect(relation(head, person(6, 'f', []), parentsOf)).toBe('relative');
  });

  it('labels each cluster of touching fields once', () => {
    const field = (id: number, x: number, y: number, w: number, h: number) =>
      ({
        id,
        defId: 'field',
        x,
        y,
        w,
        h,
        cells: [],
        owner: null,
        condition: 1,
        followed: true,
      }) as Building;
    const spots = fieldLabelSpots([
      field(1, 0, 0, 4, 4),
      field(2, 4, 1, 2, 2), // shares an edge with 1
      field(3, 10, 10, 3, 3), // alone
      field(4, 6, 3, 2, 2), // only touches 2 at a corner
    ]);
    expect(spots).toEqual([
      { x: 2, y: 0 },
      { x: 11.5, y: 10 },
      { x: 7, y: 3 },
    ]);
  });
});
