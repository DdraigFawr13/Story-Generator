import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '../../src/content';
import {
  embark,
  layoutSite,
  siteCodes,
  stepBlock,
  type ActiveSite,
  type LayoutInput,
  type LocalMap,
} from '../../src/engine';
import { baseB, biggest } from './helpers/site-fixture';

const C = DEFAULT_CONTENT;
const code = siteCodes(C.site);
const SIZE = 96;

/** A flat, dry, open 96x96 map: every tile grass. `ore` tiles carry ore. */
function flatMap(ore: number[] = []): LocalMap {
  const n = SIZE * SIZE;
  const map: LocalMap = {
    width: SIZE,
    height: SIZE,
    elevation: new Int16Array(n),
    terrain: new Uint8Array(n).fill(code.grass),
    water: new Uint8Array(n),
    tree: new Uint8Array(n),
    mineral: new Uint8Array(n),
    building: new Uint16Array(n),
    cellX: 3,
    cellY: 4,
    bridges: [],
  };
  for (const k of ore) map.mineral[k] = code.ore;
  return map;
}

const lay = (pop: number, over: Partial<LayoutInput> = {}, ore: number[] = []) =>
  layoutSite(flatMap(ore), C.site, {
    pop,
    followedHouseholds: 20,
    isCapital: false,
    coast: false,
    kind: 'town',
    ...over,
  });

const count = (b: { defId: string }[], id: string) => b.filter((x) => x.defId === id).length;

describe('places grow with the town', () => {
  it('lays out more wells, alehouses and an inn in a big town, one of each in a small one', () => {
    const big = lay(1200).buildings;
    expect(count(big, 'well')).toBeGreaterThan(1);
    expect(count(big, 'alehouse')).toBeGreaterThan(1);
    expect(count(big, 'inn')).toBe(1);
    expect(count(big, 'shrine')).toBeGreaterThan(1);
    const small = lay(150).buildings;
    for (const id of ['alehouse', 'smithy', 'bakehouse', 'shrine'])
      expect(count(small, id)).toBe(1);
    expect(count(small, 'inn')).toBe(0);
    // Each def stays within its cap.
    for (const def of C.site.buildings) {
      if (def.maxCount) expect(count(big, def.id)).toBeLessThanOrEqual(def.maxCount);
    }
  });

  it('gives extra copies a door and keeps every building clear of the others', () => {
    const { buildings } = lay(1200);
    const seen = new Set<number>();
    for (const b of buildings) {
      for (const k of b.cells) {
        if (b.defId !== 'home' && b.defId !== 'inn') expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      if (b.defId === 'inn') expect(b.door).toBeDefined();
    }
  });

  it('raises a mine head beside ore at a mining or hold site only', () => {
    const ore = [48 * SIZE + 60, 48 * SIZE + 61];
    const mine = lay(300, { kind: 'mine' }, ore).buildings.find((b) => b.defId === 'mine');
    expect(mine).toBeDefined();
    // Within a few tiles of the ore, and on no ore tile.
    expect(Math.abs(mine!.x + 2 - 60)).toBeLessThanOrEqual(8);
    for (const k of mine!.cells) expect(ore).not.toContain(k);
    expect(count(lay(300, { kind: 'hold' }, ore).buildings, 'mine')).toBe(1);
    expect(count(lay(300, { kind: 'village' }, ore).buildings, 'mine')).toBe(0);
    expect(count(lay(300, { kind: 'mine' }).buildings, 'mine')).toBe(0);
  });

  it('stamps a double home for a big household and a plain one otherwise', () => {
    const wide = (sizes: number[]) => {
      const homes = lay(400, { householdSizes: sizes }).buildings.filter((b) => b.defId === 'home');
      return homes.map((b) => Math.max(b.w, b.h));
    };
    const plain = Math.max(C.site.buildings.find((b) => b.id === 'home')!.w, 0);
    expect(Math.max(...wide([3, 4, 5, 2, 6]))).toBe(plain);
    const sizes = Array.from({ length: 20 }, () => C.site.bigHousehold + 2);
    expect(Math.max(...wide(sizes))).toBe(2 * plain - 1);
  });
});

describe('people use the place nearest their home', () => {
  it('sends well-goers to the well nearest home', () => {
    const world = structuredClone(baseB());
    const site = biggest(world);
    const active: ActiveSite = embark(world, C, site.id);
    const wells = [...active.buildings.values()].filter((b) => b.defId === 'well');
    expect(wells.length).toBeGreaterThan(1);
    const centre = (b: { x: number; y: number; w: number; h: number }) => [
      b.x + (b.w >> 1),
      b.y + (b.h >> 1),
    ];
    let checked = 0;
    for (let i = 0; i < 4 * 14; i += 1) {
      stepBlock(world, C);
      for (const id of active.residents) {
        const person = world.people.get(id)!;
        const home = active.buildings.get(
          active.households.get(person.family.householdId ?? -1)?.home ?? -1,
        );
        const [x, y] = person.detail!.pos!;
        const at = wells.find(
          (w) => x >= w.x - 1 && x <= w.x + w.w && y >= w.y - 1 && y <= w.y + w.h,
        );
        if (!at || !home || person.detail!.where !== C.life.routines.where.well) continue;
        const [hx, hy] = centre(home);
        const dist = (w: (typeof wells)[number]) => {
          const [wx, wy] = centre(w);
          return Math.abs(wx! - hx!) + Math.abs(wy! - hy!);
        };
        const nearest = [...wells].sort((a, b) => dist(a) - dist(b) || a.id - b.id)[0]!;
        expect(at.id).toBe(nearest.id);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('personal rhythm', () => {
  it('gives each person their own habit, stable across days, and varies it between people', () => {
    const R = C.life.routines;
    const flat = {
      ...C,
      life: { ...C.life, routines: { ...R, leave: { ...R.leave, jitter: 0 } } },
    };
    const world = structuredClone(baseB());
    const active = embark(world, flat, biggest(world).id);
    const byPerson = new Map<number, Set<number>>();
    for (let i = 0; i < 4 * 6; i += 1) {
      const block = active.block;
      stepBlock(world, flat);
      // Night blocks have no job or age part: only the personal habit remains.
      if (block !== 0) continue;
      for (const id of active.residents) {
        const leave = world.people.get(id)!.detail!.leaveAt!;
        (byPerson.get(id) ?? byPerson.set(id, new Set()).get(id)!).add(leave);
      }
    }
    const all = new Set<number>();
    for (const set of byPerson.values()) {
      // A person asleep may skip a block, but their habit is one number.
      expect(set.size).toBeLessThanOrEqual(1);
      for (const v of set) {
        expect(v).toBeLessThanOrEqual(R.leave.personal);
        all.add(v);
      }
    }
    expect(all.size).toBeGreaterThan(10);
  });

  it('varies leave times between people on the same day and block', () => {
    const world = structuredClone(baseB());
    const active = embark(world, C, biggest(world).id);
    stepBlock(world, C);
    stepBlock(world, C);
    const leaves = new Set(active.residents.map((id) => world.people.get(id)!.detail!.leaveAt));
    expect(leaves.size).toBeGreaterThan(10);
  });
});
