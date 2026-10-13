// Climate epochs (M2.4b): slow dry or cold spells over part of the map. Inside one, the drought or
// harsh-winter chance of a harvest rises, and the epoch's opening event is a cause of the famines.

import { cellDistance } from './settle';
import { epochCovers } from '../core/math';
import { liveSites, type Epoch, type HistoryRun } from './state';

/** Name of the live site nearest a cell (ties to the lowest id), or ''. */
function nearestSiteName(run: HistoryRun, cell: number): string {
  let name = '';
  let nearest = Infinity;
  for (const site of liveSites(run)) {
    const distance = cellDistance(run.cells.width, cell, site.cell);
    if (distance < nearest) {
      nearest = distance;
      name = site.name;
    }
  }
  return name;
}

/** The active epoch of a kind covering a cell, or undefined. */
export function epochAt(run: HistoryRun, cell: number, kind: Epoch['kind']): Epoch | undefined {
  const { width } = run.cells;
  const x = cell % width;
  const y = (cell - x) / width;
  for (const epoch of run.epochs) {
    if (epoch.kind !== kind || epoch.ended || run.year < epoch.start || run.year > epoch.end) {
      continue;
    }
    if (epochCovers(epoch, x, y, width)) return epoch;
  }
  return undefined;
}

/** Ends spells that ran out, then maybe starts a new one. Runs first each year. */
export function runClimate(run: HistoryRun): void {
  const { rules, rng, search } = run;
  const climate = rules.climate;
  for (const epoch of run.epochs) {
    if (epoch.ended || epoch.end >= run.year) continue;
    epoch.ended = true;
    run.emit({
      type: `${epoch.kind}_years_ended`,
      place: epoch.cell,
      causes: [epoch.began],
      data: {
        site: nearestSiteName(run, epoch.cell),
        years: epoch.end - epoch.start + 1,
      },
    });
  }
  const active = run.epochs.filter((e) => !e.ended).length;
  if (active >= climate.maxActive || search.candidates.length === 0) return;
  if (!rng.climate.chance(climate.startChance)) return;
  const cell = search.candidates[rng.climate.int(search.candidates.length)]!;
  const radius = rng.climate.between(climate.radius[0], climate.radius[1]);
  const length = rng.climate.between(climate.years[0], climate.years[1]);
  const kind: Epoch['kind'] = rng.climate.chance(climate.dryShare) ? 'dry' : 'cold';
  const began = run.emit({
    type: `${kind}_years_began`,
    place: cell,
    data: { site: nearestSiteName(run, cell), years: length },
  });
  run.epochs.push({
    id: run.epochs.length + 1,
    kind,
    cell,
    radius,
    start: run.year,
    end: run.year + length - 1,
    began: began.id,
  });
}
