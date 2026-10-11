// Invariant checker for generated world layers, used by tests and dev builds.
// Returns human-readable problems; an empty list means the world is sound.

import type { Region, RouteGraph, WorldCells, WorldState } from '../core/types';
import { D8_DX, D8_DY } from './grid';
import { saddleAxis } from './regions';

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
    ['biome', cells.biome],
    ['volcano', cells.volcano],
    ['aura', cells.aura],
    ['fertility', cells.fertility],
    ['wildness', cells.wildness],
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
    ['biome', cells.biome, 0, 254],
    ['volcano', cells.volcano, 0, 1],
    ['aura', cells.aura, 0, 100],
    ['fertility', cells.fertility, 0, 100],
    ['wildness', cells.wildness, 0, 100],
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
    if (sea && cells.biome[i]! > 1) {
      report(
        'sea biome',
        `sea cell ${i} has biome ${cells.biome[i]}, expected 0 (ocean) or 1 (coast)`,
      );
    }
    if (sea && cells.fertility[i] !== 0) {
      report('sea fertility', `sea cell ${i} has fertility ${cells.fertility[i]}, expected 0`);
    }
    if (sea && cells.wildness[i] !== 0) {
      report('sea wildness', `sea cell ${i} has wildness ${cells.wildness[i]}, expected 0`);
    }
  }

  let previous = -1;
  for (const [cell, deposits] of cells.resources) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= size || cell <= previous) {
      report('resource cell', `resource key ${cell} is not a new valid cell`);
    }
    previous = cell;
    if (deposits.length === 0) report('resource list', `resource cell ${cell} has no deposits`);
    for (const deposit of deposits) {
      if (!(deposit.amount >= 1 && deposit.amount <= 100)) {
        report('resource amount', `resource cell ${cell} amount ${deposit.amount}, outside 1..100`);
      }
    }
  }
  for (const spot of cells.auraSpots) {
    if (!(spot.cell >= 0 && spot.cell < size))
      report('aura spot', `aura spot at ${spot.cell} is off the map`);
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

/** Smallest ridge and basin margin (m) any pass may have been found with (see REGION_RULES.pass). */
const PASS_CHECK_MARGIN = 60;

/** Invariant checker for named regions and strategic features; empty means sound. */
export function checkRegions(cells: WorldCells, regions: readonly Region[]): string[] {
  const { width, height } = cells;
  const size = width * height;
  const problems: string[] = [];
  const names = new Set<string>();
  const seaNeighbour = (cell: number): boolean => {
    const x = cell % width;
    const y = (cell - x) / width;
    for (let d = 0; d < 8; d += 2) {
      const nx = x + D8_DX[d]!;
      const ny = y + D8_DY[d]!;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && cells.water[ny * width + nx] === 3) {
        return true;
      }
    }
    return false;
  };
  regions.forEach((region, n) => {
    const label = `${region.kind} "${region.name}"`;
    if (region.id !== n + 1) problems.push(`${label} has id ${region.id}, expected ${n + 1}`);
    if (names.has(region.name)) problems.push(`name "${region.name}" is used twice`);
    names.add(region.name);
    if (region.cells.length === 0) problems.push(`${label} has no cells`);
    if (
      region.cells.some((c, k) => !(c >= 0 && c < size) || (k > 0 && c <= region.cells[k - 1]!))
    ) {
      problems.push(`${label} has cells that are off the map or not ascending`);
      return;
    }
    if (!region.cells.includes(region.anchor))
      problems.push(`${label} anchor is not one of its cells`);
    const anchor = region.anchor;
    if (region.kind === 'pass' && saddleAxis(cells, anchor, PASS_CHECK_MARGIN) < 0) {
      problems.push(`${label} at ${anchor} is not lower than a ridge on both sides`);
    }
    if (region.kind === 'harbour' && !(cells.water[anchor] === 0 && seaNeighbour(anchor))) {
      problems.push(`${label} at ${anchor} is not land touching the sea`);
    }
    if (region.kind === 'ford' && cells.water[anchor] !== 1) {
      problems.push(`${label} at ${anchor} is not a river cell`);
    }
    if (region.kind === 'strait' && region.cells.some((c) => cells.water[c] !== 3)) {
      problems.push(`${label} includes cells that are not sea`);
    }
  });
  return problems;
}

/** Invariant checker for the route graph, travel costs and roads; empty means sound. */
export function checkRoutes(cells: WorldCells, routes: RouteGraph): string[] {
  const { width, height } = cells;
  const size = width * height;
  const problems: string[] = [];
  if (cells.travelCost.length !== size || cells.roads.length !== size) {
    return [`travelCost/roads have ${cells.travelCost.length}/${cells.roads.length} values`];
  }
  const report = (text: string) => {
    if (problems.length < MAX_PER_RULE * 4) problems.push(text);
  };
  const { nodes, edges } = routes;
  nodes.forEach((node, n) => {
    if (node.id !== n) report(`route node ${n} has id ${node.id}`);
    if (!(node.cell >= 0 && node.cell < size)) report(`route node ${n} is off the map`);
    else if (cells.water[node.cell] !== 0 && cells.water[node.cell] !== 1) {
      report(`route node ${n} at ${node.cell} is not on dry land or a river`);
    }
  });
  const expected = new Uint8Array(size);
  edges.forEach((edge, n) => {
    const label = `${edge.sea ? 'sea' : 'land'} route ${edge.a}-${edge.b}`;
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    if (!a || !b || edge.a >= edge.b) return report(`${label} has bad endpoints`);
    const before = edges[n - 1];
    if (before && (before.a > edge.a || (before.a === edge.a && before.b > edge.b))) {
      report(`${label} is out of order`);
    }
    const { path } = edge;
    if (path.length < 2 || path[0] !== a.cell || path[path.length - 1] !== b.cell) {
      return report(`${label} does not run from its first node to its second`);
    }
    for (let k = 0; k < path.length; k += 1) {
      const c = path[k]!;
      if (!(c >= 0 && c < size)) return report(`${label} leaves the map`);
      if (k > 0) {
        const p = path[k - 1]!;
        const dx = Math.abs((c % width) - (p % width));
        const dy = Math.abs(Math.floor(c / width) - Math.floor(p / width));
        if (Math.max(dx, dy) !== 1) return report(`${label} jumps between ${p} and ${c}`);
      }
      const w = cells.water[c];
      const ends = k === 0 || k === path.length - 1;
      if (edge.sea ? !ends && w !== 3 : w === 2 || w === 3) {
        report(`${label} crosses ${w === 3 ? 'sea' : w === 2 ? 'a lake' : 'land'} at ${c}`);
      }
      if (!edge.sea) expected[c] = Math.min(255, expected[c]! + 1);
    }
  });
  for (let i = 0; i < size; i += 1) {
    if (expected[i] !== cells.roads[i]) {
      report(`roads[${i}] is ${cells.roads[i]}, the routes make it ${expected[i]}`);
      break;
    }
  }
  return problems;
}

/** Invariant checker for civs, sites and territory (M2.2, M2.3); empty means sound. */
export function checkSites(world: Pick<WorldState, 'cells' | 'civs' | 'sites'>): string[] {
  const { cells, civs, sites } = world;
  if (!cells) return ['the world has no cells'];
  const size = cells.width * cells.height;
  const problems: string[] = [];
  const report = (text: string) => {
    if (problems.length < MAX_PER_RULE * 4) problems.push(text);
  };
  if (cells.territory.length !== size) {
    return [`territory has ${cells.territory.length} values, expected ${size}`];
  }
  const perCiv = new Map<number, number>();
  for (const site of sites.values()) {
    const label = `site ${site.id} "${site.name}"`;
    if (!(site.cell >= 0 && site.cell < size)) {
      report(`${label} is off the map`);
      continue;
    }
    if (cells.water[site.cell] !== 0) report(`${label} at ${site.cell} is not on dry land`);
    if (site.civId !== null) {
      if (civs.has(site.civId)) {
        if (site.ruinedYear === undefined)
          perCiv.set(site.civId, (perCiv.get(site.civId) ?? 0) + 1);
      } else report(`${label} belongs to unknown civ ${site.civId}`);
    }
    let pop = 0;
    for (const band of site.pop) {
      if (!Number.isInteger(band.count) || band.count < 0) {
        report(`${label} has ${band.band} count ${band.count}`);
      }
      pop += band.count;
    }
    if (site.ruinedYear !== undefined && pop !== 0) report(`${label} is ruined but holds ${pop}`);
    if (!(site.stores >= 0)) report(`${label} has stores ${site.stores}`);
    if (!(site.peakPop >= pop)) report(`${label} has peak population ${site.peakPop} below ${pop}`);
    if (!(site.capacity >= 0)) report(`${label} has capacity ${site.capacity}`);
  }
  for (const civ of civs.values()) {
    const label = `civ ${civ.id} "${civ.name}"`;
    const capital = sites.get(civ.capital);
    if (!capital) report(`${label} has no capital site`);
    else if (civ.fell === undefined) {
      if (capital.civId !== civ.id) report(`${label} capital belongs to another civ`);
      if (capital.ruinedYear !== undefined) report(`${label} capital is in ruins`);
      if ((perCiv.get(civ.id) ?? 0) < 1) report(`${label} has no live site`);
    }
  }
  for (let i = 0; i < size; i += 1) {
    const owner = cells.territory[i]!;
    if (owner !== 0 && !civs.has(owner)) {
      report(`territory[${i}] is ${owner}, not a civ`);
      break;
    }
  }
  return problems;
}
