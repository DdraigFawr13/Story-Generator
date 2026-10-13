// Yearly record for the world-map playback: display borders, sites and capitals every year,
// plus each decade's trades. Display only: the borders here are computed apart from the rules'
// own territory (which is refreshed only when a site changes hands or at a decade), so the
// history itself is unchanged. Borders are stored only in the years they move.

import type { PlaybackYear, WorldState } from '../core/types';
import { computeTerritory } from './settle';
import { encodeTerritory, takeSnapshot } from './snapshots';
import { isLive, type HistoryRun } from './state';

export interface PlaybackRecorder {
  /** Live sites of standing civs as `id:civ` the last time borders were computed. */
  key: string;
}

export function createPlaybackRecorder(): PlaybackRecorder {
  return { key: '' };
}

/** Appends `year` to `world.playback`, creating the log at year 0. */
export function recordPlaybackYear(
  run: HistoryRun,
  recorder: PlaybackRecorder,
  year: number,
): void {
  const { world, cells, content } = run;
  world.playback ??= { years: [], trade: new Uint32Array(0) };
  const standing = [...world.sites.values()].filter((site) => {
    if (!isLive(site) || site.founded > year || site.civId === null) return false;
    const civ = world.civs.get(site.civId);
    return civ !== undefined && civ.fell === undefined;
  });
  // Territory depends only on which sites stand and who owns them.
  const key = standing.map((site) => `${site.id}:${site.civId}`).join(',');
  const entry: PlaybackYear = {
    year,
    sites: takeSnapshot(world, cells, year).sites,
    seats: seatsOf(world),
  };
  if (key !== recorder.key) {
    recorder.key = key;
    entry.territory = encodeTerritory(
      computeTerritory(cells, standing, content.settlement.territoryReach),
    );
  }
  world.playback.years.push(entry);
}

/** Moves the run's trade rows onto the log once the last year is done. */
export function finishPlayback(run: HistoryRun): void {
  if (run.world.playback) run.world.playback.trade = Uint32Array.from(run.tradeRows);
}

function seatsOf(world: WorldState): Uint32Array {
  const out: number[] = [];
  for (const civ of world.civs.values()) if (civ.fell === undefined) out.push(civ.id, civ.capital);
  return Uint32Array.from(out);
}
