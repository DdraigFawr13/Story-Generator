import { describe, expect, it } from 'vitest';
import {
  D8_DX,
  D8_DY,
  computeWater,
  generateWorld,
  oceanMask,
  type WorldCells,
} from '../../src/engine';

const SMALL = { width: 96, height: 96 };

/** Cell reached by following one step of flowDir, or -1 at the end of a path. */
function downstream(cells: WorldCells, i: number): number {
  const dir = cells.flowDir[i]!;
  if (dir < 0) return -1;
  const x = (i % cells.width) + D8_DX[dir]!;
  const y = Math.floor(i / cells.width) + D8_DY[dir]!;
  return y * cells.width + x;
}

/** 12x8 ramp rising from a sea column, with a 1-cell pit and a 3x3 basin. */
function fixture() {
  const width = 12;
  const height = 8;
  const elevation = new Int16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) elevation[y * width + x] = x === 0 ? -10 : x * 10;
  }
  const pit = 1 * width + 4;
  elevation[pit] = 5;
  for (let y = 3; y <= 5; y += 1) for (let x = 8; x <= 10; x += 1) elevation[y * width + x] = 20;
  const ocean = oceanMask(width, height, elevation);
  const rainfall = new Uint16Array(width * height).fill(100);
  return { width, height, elevation, ocean, rainfall, pit };
}

describe('water fixture', () => {
  it('fills a pit, turns a basin into a lake and drains everything to the sea', () => {
    const { width, height, elevation, ocean, rainfall, pit } = fixture();
    const result = computeWater(width, height, elevation, rainfall, ocean);
    // The pit is levelled to its spill height and is plain land.
    expect(elevation[pit]).toBeGreaterThan(5);
    expect(result.water[pit]).toBe(0);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 8; x <= 10; x += 1) expect(result.water[y * width + x]).toBe(2);
    }
    for (let y = 0; y < height; y += 1) expect(result.water[y * width]).toBe(3);
    for (let start = 0; start < width * height; start += 1) {
      let i = start;
      let steps = 0;
      while (result.water[i] !== 3 && steps <= width * height) {
        const dir = result.flowDir[i]!;
        expect(dir).toBeGreaterThanOrEqual(0);
        i += D8_DX[dir]! + D8_DY[dir]! * width;
        steps += 1;
      }
      expect(result.water[i]).toBe(3);
    }
    // Everything upstream of the sea column is counted in the flow reaching it.
    let total = 0;
    for (let y = 0; y < height; y += 1) total += result.flow[y * width]!;
    expect(total).toBe((width - 1) * height);
  });
});

describe('water on generated worlds', () => {
  for (const seed of ['A', 'B', 'C']) {
    it(`never runs uphill and ends rivers in sea or lake (seed ${seed})`, () => {
      const cells = generateWorld(seed, SMALL).cells!;
      const size = cells.width * cells.height;
      let rivers = 0;
      for (let i = 0; i < size; i += 1) {
        if (cells.water[i] === 3) continue;
        const n = downstream(cells, i);
        expect(n).toBeGreaterThanOrEqual(0);
        // Lakes sit below their rim, so only compare dry ground to dry ground.
        if (cells.water[i] !== 2 && cells.water[n] !== 2) {
          expect(cells.elevation[n]).toBeLessThanOrEqual(cells.elevation[i]!);
        }
        if (cells.water[i] !== 1) continue;
        rivers += 1;
        let at = i;
        let steps = 0;
        while (cells.water[at] === 1 && steps <= size) {
          at = downstream(cells, at);
          steps += 1;
        }
        expect([2, 3]).toContain(cells.water[at]);
      }
      expect(rivers).toBeGreaterThan(20);
    });
  }

  it('keeps every flow value positive on land and floodplains beside rivers', () => {
    const cells = generateWorld('A', SMALL).cells!;
    let floodplain = 0;
    for (let i = 0; i < cells.water.length; i += 1) {
      if (cells.water[i] !== 3) expect(cells.flow[i]).toBeGreaterThan(0);
      if (cells.floodplain[i]) {
        floodplain += 1;
        expect(cells.elevation[i]).toBeLessThan(400);
        expect([0, 1]).toContain(cells.water[i]);
      }
    }
    expect(floodplain).toBeGreaterThan(0);
  });
});
