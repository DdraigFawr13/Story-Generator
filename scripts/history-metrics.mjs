// Per-seed history numbers shared by drama (tables, baseline) and sweep.
// Trivial events may be pruned from world.events; each year_summary event carries data.n_<type>
// for the trivial ones, so a type's true count = kept important events + summed n_<type>.

/** Count events by type, adding back the trivial events that year_summary events stand for. */
export function countEvents(world, { rollupBelow, DAYS_PER_YEAR }) {
  const counts = {};
  for (const e of world.events) {
    if (e.type === 'year_summary') {
      for (const [key, value] of Object.entries(e.data ?? {})) {
        if (key.startsWith('n_') && typeof value === 'number') {
          const type = key.slice(2);
          counts[type] = (counts[type] ?? 0) + value;
        }
      }
      continue;
    }
    if (rollupBelow !== undefined && e.importance < rollupBelow) continue;
    // Settle's second sites are dated day 0; history founds from year 1 on.
    if (e.type === 'site_founded' && e.day < DAYS_PER_YEAR) continue;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

const round1 = (v) => Math.round(v * 10) / 10;

export function historyMetrics(
  world,
  { startPop, peakPop, historyMs, rollupBelow, DAYS_PER_YEAR, raceIds },
) {
  const n = countEvents(world, { rollupBelow, DAYS_PER_YEAR });
  const c = (type) => n[type] ?? 0;
  // Longest chain of causes: events are in id order and causes are older, so one pass works.
  const depth = new Map();
  let chain = 0;
  for (const e of world.events) {
    const d = 1 + Math.max(0, ...e.causes.map((id) => depth.get(id) ?? 0));
    depth.set(e.id, d);
    chain = Math.max(chain, d);
  }
  let liveSites = 0;
  let ruinedSites = 0;
  let finalPop = 0;
  const raceTotals = {};
  for (const site of world.sites.values()) {
    if (site.ruinedYear === undefined) liveSites += 1;
    else ruinedSites += 1;
    for (const band of site.pop) {
      finalPop += band.count;
      raceTotals[band.raceId] = (raceTotals[band.raceId] ?? 0) + band.count;
    }
  }
  const ids = raceIds ?? Object.keys(raceTotals).sort();
  const shares = ids.map((id) => (finalPop ? (100 * (raceTotals[id] ?? 0)) / finalPop : 0));
  const out = {
    civs: world.civs.size,
    civsFell: [...world.civs.values()].filter((civ) => civ.fell !== undefined).length,
    liveSites,
    ruinedSites,
    startPop,
    peakPop: Math.max(peakPop, finalPop),
    finalPop,
    famine: c('famine'),
    disease: c('plague') + c('fever') + c('pox'),
    plague: c('plague'),
    migration: c('migration'),
    siteFounded: c('site_founded'),
    wars: c('war_declared'),
    battles: c('battle'),
    conquered: c('site_conquered'),
    razed: c('site_razed'),
    epochs: c('dry_years_began') + c('cold_years_began'),
    ruinsAny: ruinedSites > 0 ? 1 : 0,
    chain,
    events: world.events.length,
  };
  ids.forEach((id, i) => {
    out[`share_${id}`] = round1(shares[i]);
  });
  out.minShare = round1(shares.length ? Math.min(...shares) : 0);
  out.historyMs = historyMs;
  return out;
}

/** Round every metric to one decimal and drop timing, for the baseline file. */
export function baselineMetrics(metrics) {
  const out = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (key !== 'historyMs') out[key] = round1(value);
  }
  return out;
}
