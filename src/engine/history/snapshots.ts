// Decade snapshots (M2.5): borders and site populations every ten years, kept on the world for the
// M2.7 year slider. Territory is run-length encoded, so 26 snapshots stay small in saves.

import type { DecadeSnapshot, WorldCells, WorldState } from '../core/types';
import { totalPop } from './pop';

/** Longest run one pair can hold. */
const MAX_RUN = 0xffff;

/** Row-major [value, runLength] pairs; a run longer than 65535 is split. */
export function encodeTerritory(territory: Uint16Array): Uint16Array {
  const out: number[] = [];
  let i = 0;
  while (i < territory.length) {
    const value = territory[i]!;
    let run = 1;
    while (i + run < territory.length && territory[i + run] === value && run < MAX_RUN) run += 1;
    out.push(value, run);
    i += run;
  }
  return Uint16Array.from(out);
}

export function decodeTerritory(runs: Uint16Array, size: number): Uint16Array {
  const out = new Uint16Array(size);
  let at = 0;
  for (let k = 0; k + 1 < runs.length; k += 2) {
    out.fill(runs[k]!, at, at + runs[k + 1]!);
    at += runs[k + 1]!;
  }
  return out;
}

/** The world's borders and sites as of `year`. */
export function takeSnapshot(world: WorldState, cells: WorldCells, year: number): DecadeSnapshot {
  const sites: number[] = [];
  for (const site of world.sites.values()) {
    if (site.founded > year) continue;
    const ruined = site.ruinedYear !== undefined;
    sites.push(site.id, site.civId ?? 0, ruined ? 0 : totalPop(site), ruined ? 1 : 0);
  }
  return { year, territory: encodeTerritory(cells.territory), sites: Uint32Array.from(sites) };
}
