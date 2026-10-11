// Invariant checker for generated world layers, used by tests and dev builds.
// Returns human-readable problems; an empty list means the world is sound.

import type { WorldCells } from '../core/types';
import { D8_DX, D8_DY } from './grid';

/** Report at most this many problems per rule, then a count of the rest. */
const MAX_PER_RULE = 5;

export function checkWorldCells(cells: WorldCells): string[] {
  const { width, height } = cells;
  const size = width * height;
  const problems: string[] = [];
  const counts = new Map<string, number>();
  const report = (rule: string, text: string) => {
    const n = (counts.get(rule) ?? 0) + 1;
    counts.set(rule, n);
    if (n <= MAX_PER_RULE) problems.push(text);
    else if (n === MAX_PER_RULE + 1) problems.push(`${rule}: more problems not shown`);
  };

  const layers: [string, ArrayLike<number>][] = [
    ['elevation', cells.elevation],
    ['plate', cells.plate],
    ['seaDistance', cells.seaDistance],
    ['tempSummer', cells.tempSummer],
    ['tempWinter', cells.tempWinter],
    ['rainfall', cells.rainfall],
    ['risk.drought', cells.risk.drought],
    ['risk.storm', cells.risk.storm],
    ['risk.snow', cells.risk.snow],
    ['flowDir', cells.flowDir],
    ['flow', cells.flow],
    ['water', cells.water],
    ['floodplain', cells.floodplain],
  ];
  let sizesOk = true;
  for (const [name, layer] of layers) {
    if (layer.length !== size) {
      problems.push(`${name} has ${layer.length} values, expected ${size}`);
      sizesOk = false;
    }
  }
  if (!sizesOk) return problems;

  const ranges: [string, ArrayLike<number>, number, number][] = [
    ['risk.drought', cells.risk.drought, 0, 100],
    ['risk.storm', cells.risk.storm, 0, 100],
    ['risk.snow', cells.risk.snow, 0, 100],
    ['water', cells.water, 0, 3],
    ['floodplain', cells.floodplain, 0, 1],
    ['flowDir', cells.flowDir, -1, 7],
  ];
  for (const [name, layer, lo, hi] of ranges) {
    for (let i = 0; i < size; i += 1) {
      const v = layer[i]!;
      if (v < lo || v > hi) report(`${name} range`, `${name}[${i}] = ${v}, outside ${lo}..${hi}`);
    }
  }

  for (let i = 0; i < size; i += 1) {
    const sea = cells.water[i] === 3;
    const m = cells.elevation[i]!;
    if (sea && m > 0) report('sea height', `sea cell ${i} is ${m} m, expected 0 or below`);
    if (!sea && m < 1) report('land height', `land cell ${i} is ${m} m, expected 1 or above`);
  }

  // Follow flowDir from every non-sea cell: 0 unknown, 1 on the current path, 2 reaches the sea.
  const state = new Uint8Array(size);
  const path: number[] = [];
  const next = (i: number): number => {
    const dir = cells.flowDir[i]!;
    if (dir < 0 || dir > 7) return -1;
    const x = (i % width) + D8_DX[dir]!;
    const y = Math.floor(i / width) + D8_DY[dir]!;
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    return y * width + x;
  };
  for (let start = 0; start < size; start += 1) {
    if (cells.water[start] === 3 || state[start] !== 0) continue;
    path.length = 0;
    let at = start;
    let reached = false;
    let looped = false;
    while (path.length <= size) {
      if (cells.water[at] === 3 || state[at] === 2) {
        reached = true;
        break;
      }
      if (state[at] === 1) {
        looped = true;
        break;
      }
      state[at] = 1;
      path.push(at);
      const n = next(at);
      if (n < 0) break;
      at = n;
    }
    // Broken paths are marked done too, so each is reported once.
    for (const cell of path) state[cell] = 2;
    if (!reached) {
      const why = looped ? 'loops' : 'ends before the sea';
      report('flow path', `flow from cell ${start} ${why} (stopped at ${at})`);
    }
  }

  for (let i = 0; i < size; i += 1) {
    if (cells.water[i] !== 1) continue;
    const n = next(i);
    if (n < 0 || cells.water[n] === 2 || cells.water[n] === 3) continue;
    if (cells.elevation[n]! > cells.elevation[i]!) {
      report(
        'river slope',
        `river cell ${i} (${cells.elevation[i]} m) flows uphill to ${n} (${cells.elevation[n]} m)`,
      );
    }
  }
  return problems;
}
