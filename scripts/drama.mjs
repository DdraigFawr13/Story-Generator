// World stats per seed: npm run drama -- --seeds 5 [--size 256] [--years 250] [--seed NAME]
//   [--write-baseline FILE] [--baseline FILE [--tolerance 0.1]]
// Site tier: npm run drama -- --seeds 3 --site --years 3 [--history-years 250] (years = site play)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEngine, parseArgs } from './load-engine.mjs';
import { baselineMetrics, countEvents, historyMetrics } from './history-metrics.mjs';
import { diffBaseline, formatDiff } from './baseline-diff.mjs';
import { domainMap, siteMetrics } from './site-metrics.mjs';

// --site is a bare flag: pull it out first so parseArgs never swallows the next flag as its value.
const argv = process.argv.slice(2).filter((a) => a !== '--site');
const siteMode = argv.length !== process.argv.length - 2;
const args = parseArgs(argv);
const size = Number(args.size || 256);
const count = Number(args.seeds || 5);
const siteYears = Number(args.years || 3);
const years = siteMode ? Number(args['history-years'] || 250) : Number(args.years || 250);
const seeds = args.seed ? [args.seed] : Array.from({ length: count }, (_, i) => `S${i + 1}`);

const {
  generateWorld,
  runHistory,
  DAYS_PER_YEAR,
  checkWorldCells,
  checkRegions,
  checkRoutes,
  checkSites,
  sitePopulation,
  D8_DX,
  D8_DY,
  DEFAULT_CONTENT,
  BIOMES,
  RESOURCES,
  embark,
  stepSite,
  LIFE_EVENTS,
  WORK_EVENTS,
  HEALTH_EVENTS,
  FAMILY_EVENTS,
  SOCIAL_EVENTS,
  SOCIETY_EVENTS,
  THREAT_EVENTS,
  LORE_EVENTS,
  POLITICS_EVENTS,
  WEATHER_EVENTS,
} = await loadEngine();

// Site-tier stats for one seed: embark on the most populous live site and step whole days.
function siteStats(world) {
  let site = null;
  for (const s of world.sites.values()) {
    if (s.ruinedYear !== undefined) continue;
    if (!site || sitePopulation(s) > sitePopulation(site)) site = s;
  }
  if (!site) return null;
  const active = embark(world, DEFAULT_CONTENT, site.id);
  const startFollowed = active.residents.length;
  const first = world.events.length;
  const days = Math.round(siteYears * DAYS_PER_YEAR);
  const t0 = performance.now();
  for (let i = 0; i < days; i += 1) stepSite(world, DEFAULT_CONTENT);
  const seconds = Math.max((performance.now() - t0) / 1000, 1e-6);
  const domains = domainMap({
    life: LIFE_EVENTS,
    work: WORK_EVENTS,
    health: HEALTH_EVENTS,
    family: FAMILY_EVENTS,
    social: SOCIAL_EVENTS,
    society: SOCIETY_EVENTS,
    threats: THREAT_EVENTS,
    lore: LORE_EVENTS,
    politics: POLITICS_EVENTS,
    environment: WEATHER_EVENTS,
  });
  const months = days / (DAYS_PER_YEAR / 12);
  const m = siteMetrics(world, active, world.events.slice(first), {
    months,
    domains,
    startFollowed,
  });
  return { site, days, daysPerSecond: days / seconds, ...m };
}

function stats(seed) {
  const ms = {};
  let last = performance.now();
  let stage = null;
  // Each callback reports the stage about to run (or just finished); charge elapsed time to
  // whichever stage was last announced.
  // The history stage runs below, so the start population can be read first.
  const world = generateWorld(
    seed,
    { width: size, height: size, historyYears: 0 },
    DEFAULT_CONTENT,
    (name) => {
      const now = performance.now();
      if (stage) ms[stage] = (ms[stage] ?? 0) + now - last;
      stage = name;
      last = now;
    },
  );
  if (stage) ms[stage] = (ms[stage] ?? 0) + performance.now() - last;
  const livePop = () => {
    let n = 0;
    for (const site of world.sites.values()) n += sitePopulation(site);
    return n;
  };
  const startPop = livePop();
  let peakPop = startPop;
  world.params.historyYears = years;
  const historyStart = performance.now();
  runHistory(world, DEFAULT_CONTENT, () => {
    peakPop = Math.max(peakPop, livePop());
  });
  ms.history = performance.now() - historyStart;
  peakPop = Math.max(peakPop, livePop());
  const rollupBelow = DEFAULT_CONTENT.history.importance?.rollupBelow;
  const typeCount = countEvents(world, { rollupBelow, DAYS_PER_YEAR });
  const metrics = historyMetrics(world, {
    startPop,
    peakPop,
    historyMs: ms.history,
    rollupBelow,
    DAYS_PER_YEAR,
    raceIds: DEFAULT_CONTENT.races.map((race) => race.id),
  });
  // Wars: first year of each war, and the years any war was under way (declared to its last event).
  const warSpan = new Map();
  for (const e of world.events) {
    const war = e.data?.war;
    if (war === undefined) continue;
    const year = Math.floor(e.day / DAYS_PER_YEAR);
    const span = warSpan.get(war) ?? { from: year, to: year };
    span.from = Math.min(span.from, year);
    span.to = Math.max(span.to, year);
    warSpan.set(war, span);
  }
  const warYears = new Set();
  let warsEarly = 0;
  let warsLate = 0;
  for (const { from, to } of warSpan.values()) {
    for (let y = from; y <= to; y += 1) warYears.add(y);
    if (from <= 100) warsEarly += 1;
    else if (from <= 200) warsLate += 1;
  }
  const peaceYears = Math.max(0, years - warYears.size);
  let liveSites = 0,
    totalWealth = 0;
  const goodSums = { food: 0, ore: 0, timber: 0, salt: 0, luxury: 0 };
  for (const site of world.sites.values()) {
    if (site.ruinedYear === undefined) {
      liveSites += 1;
      totalWealth += site.wealth;
      for (const good of Object.keys(goodSums)) goodSums[good] += site.goods[good];
    }
  }
  const meanGoods = Object.fromEntries(
    Object.entries(goodSums).map(([good, sum]) => [good, liveSites ? sum / liveSites : 0]),
  );
  const c = world.cells;
  const kinds = {};
  for (const region of world.regions.values()) kinds[region.kind] = (kinds[region.kind] ?? 0) + 1;
  const n = c.width * c.height;
  let land = 0,
    rivers = 0,
    mouths = 0,
    lakes = 0,
    dry = 0,
    wet = 0,
    flood = 0;
  const biomeCount = new Array(BIOMES.length).fill(0);
  let dryLand = 0,
    fertile = 0,
    wild = 0,
    volcanoes = 0;
  const highs = [];
  const isLake = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (c.water[i] === 3) continue;
    land += 1;
    if (c.rainfall[i] < 250) dry += 1;
    if (c.rainfall[i] > 2000) wet += 1;
    if (c.floodplain[i]) flood += 1;
    if (c.water[i] !== 2) {
      dryLand += 1;
      biomeCount[c.biome[i]] += 1;
      if (c.fertility[i] >= 50) fertile += 1;
      if (c.wildness[i] >= 70) wild += 1;
    }
    highs.push(c.tempSummer[i]);
    volcanoes += c.volcano[i];
    if (c.water[i] === 2) {
      lakes += 1;
      isLake[i] = 1;
    }
    if (c.water[i] === 1) {
      rivers += 1;
      const d = c.flowDir[i];
      if (d >= 0) {
        const x = (i % c.width) + D8_DX[d];
        const y = Math.floor(i / c.width) + D8_DY[d];
        if (c.water[y * c.width + x] === 3) mouths += 1;
      }
    }
  }
  // Lake count = 8-connected lake components.
  let lakeCount = 0;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!isLake[i] || seen[i]) continue;
    lakeCount += 1;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const at = stack.pop();
      for (let d = 0; d < 8; d += 1) {
        const x = (at % c.width) + D8_DX[d];
        const y = Math.floor(at / c.width) + D8_DY[d];
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const to = y * c.width + x;
        if (isLake[to] && !seen[to]) {
          seen[to] = 1;
          stack.push(to);
        }
      }
    }
  }
  // Route graph: share of land nodes in the largest connected piece of their landmass's land graph.
  const { nodes, edges } = world.routes;
  const root = nodes.map((node) => node.id);
  const top1 = (k) => (root[k] === k ? k : (root[k] = top1(root[k])));
  for (const e of edges) if (!e.sea) root[top1(e.a)] = top1(e.b);
  const pieces = new Map();
  for (const node of nodes) {
    const key = `${node.landmass}:${top1(node.id)}`;
    pieces.set(key, (pieces.get(key) ?? 0) + 1);
  }
  let connected = 0,
    counted = 0;
  for (const mass of new Set(nodes.map((node) => node.landmass))) {
    const total = nodes.filter((node) => node.landmass === mass).length;
    if (total < 2) continue;
    let largest = 0;
    for (const [key, count] of pieces)
      if (key.startsWith(`${mass}:`)) largest = Math.max(largest, count);
    connected += largest;
    counted += total;
  }
  // Settlement: civs, sites by kind, population, race shares and mean capacity.
  const siteKinds = {};
  const raceTotals = {};
  let population = 0,
    capacitySum = 0;
  for (const site of world.sites.values()) {
    siteKinds[site.kind] = (siteKinds[site.kind] ?? 0) + 1;
    capacitySum += site.capacity;
    for (const band of site.pop) {
      raceTotals[band.raceId] = (raceTotals[band.raceId] ?? 0) + band.count;
      population += band.count;
    }
  }
  let claimed = 0;
  for (let i = 0; i < n; i += 1) if (c.territory[i]) claimed += 1;
  const seaEdges = edges.filter((e) => e.sea).length;
  const pct = (v, of) => (of ? (100 * v) / of : 0);
  const biomePct = (id) => pct(biomeCount[BIOMES.findIndex((b) => b.id === id)], dryLand);
  const top = BIOMES.map((b, i) => [b.id, biomeCount[i]])
    .filter(([id]) => !BIOMES.find((b) => b.id === id).water)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => `${id.slice(0, 6)} ${pct(count, dryLand).toFixed(0)}`)
    .join(' ');
  const resourceCells = RESOURCES.map(() => 0);
  for (const deposits of c.resources.values()) {
    for (const d of deposits) resourceCells[d.resource] += 1;
  }
  highs.sort((a, b) => a - b);
  // Last, because embarking and stepping the site changes the world.
  const siteTier = siteMode ? siteStats(world) : undefined;
  return {
    seed,
    siteTier,
    ms,
    total: Object.values(ms).reduce((a, b) => a + b, 0),
    land: pct(land, n),
    rivers,
    mouths,
    lakes,
    lakeCount,
    dry: pct(dry, land),
    wet: pct(wet, land),
    hiMin: highs[0] ?? 0,
    hiMed: highs[highs.length >> 1] ?? 0,
    hiMax: highs[highs.length - 1] ?? 0,
    flood: pct(flood, land),
    top,
    harsh: biomePct('desert') + biomePct('tundra'),
    lush: biomePct('temperate-forest') + biomePct('jungle') + biomePct('taiga'),
    volcanoes,
    spots: c.auraSpots.length,
    fertile: pct(fertile, dryLand),
    wild: pct(wild, dryLand),
    resourcePct: resourceCells.map((n) => pct(n, land)),
    kinds,
    nodes: nodes.length,
    edges: edges.length - seaEdges,
    seaEdges,
    conn: counted ? (100 * connected) / counted : 100,
    civCount: world.civs.size,
    siteCount: world.sites.size,
    siteKinds,
    population,
    raceTotals,
    raceShares: Object.entries(raceTotals).map(
      ([id, v]) => `${id} ${pct(v, population).toFixed(0)}`,
    ),
    meanCapacity: world.sites.size ? capacitySum / world.sites.size : 0,
    claimed: pct(claimed, land),
    history: {
      ...metrics,
      metrics,
      typeCount,
      warsEarly,
      warsLate,
      peaceYears,
      meanGoods,
      totalWealth,
    },
    problems:
      checkSites(world).length +
      checkWorldCells(c).length +
      checkRegions(c, [...world.regions.values()]).length +
      checkRoutes(c, world.routes).length,
  };
}

const rows = seeds.map(stats);
// The four classic stages get a column each; the M1.3 stages are summed into "restms".
const stages = ['terrain', 'erosion', 'climate', 'water'];
// Regions and routes get their own columns, after the summed rest.
for (const r of rows) {
  r.ms.rest = Object.entries(r.ms)
    .filter(
      ([name]) =>
        !stages.includes(name) &&
        name !== 'rest' &&
        name !== 'regions' &&
        name !== 'routes' &&
        name !== 'settle' &&
        name !== 'history',
    )
    .reduce((a, [, v]) => a + v, 0);
}
stages.push('rest', 'regions', 'routes', 'settle');
const pct = (v, of) => (of ? (100 * v) / of : 0);
const f = (v, w, d = 0) => v.toFixed(d).padStart(w);
const head = [
  'seed',
  ...stages.map((s) => `${s.slice(0, 5)}ms`),
  'totms',
  'land%',
  'river',
  'mouth',
  'lakeC',
  'lakes',
  'dry%',
  'wet%',
  'hi min/med/max',
  'flood%',
  'top biomes',
  'harsh%',
  'lush%',
  'volc',
  'pass',
  'ford',
  'harb',
  'strt',
  'bay',
  'rng',
  'spots',
  'fert%',
  'wild%',
  'nodes',
  'edges',
  'seaE',
  'conn%',
  'bad',
];
process.stdout.write(`${size}x${size}\n${head.join(' ')}\n`);
for (const r of rows) {
  process.stdout.write(
    [
      r.seed.padEnd(4),
      ...stages.map((s) => f(r.ms[s], 7)),
      f(r.total, 5),
      f(r.land, 5, 1),
      f(r.rivers, 5),
      f(r.mouths, 5),
      f(r.lakes, 5),
      f(r.lakeCount, 5),
      f(r.dry, 4, 1),
      f(r.wet, 4, 1),
      `${r.hiMin}/${r.hiMed}/${r.hiMax}`.padStart(14),
      f(r.flood, 6, 1),
      r.top.padEnd(24),
      f(r.harsh, 6, 1),
      f(r.lush, 5, 1),
      f(r.volcanoes, 4),
      f(r.kinds.pass ?? 0, 4),
      f(r.kinds.ford ?? 0, 4),
      f(r.kinds.harbour ?? 0, 4),
      f(r.kinds.strait ?? 0, 4),
      f(r.kinds.bay ?? 0, 3),
      f(r.kinds.range ?? 0, 3),
      f(r.spots, 5),
      f(r.fertile, 5, 1),
      f(r.wild, 5, 1),
      f(r.nodes, 5),
      f(r.edges, 5),
      f(r.seaEdges, 4),
      f(r.conn, 5, 1),
      f(r.problems, 3),
    ].join(' ') + '\n',
  );
}
const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
process.stdout.write(
  `mean: total ${mean('total').toFixed(0)}ms, land ${mean('land').toFixed(1)}%, rivers ${mean('rivers').toFixed(0)}, ` +
    `mouths ${mean('mouths').toFixed(0)}, lakes ${mean('lakes').toFixed(0)} cells/${mean('lakeCount').toFixed(1)}, ` +
    `dry ${mean('dry').toFixed(1)}%, wet ${mean('wet').toFixed(1)}%, flood ${mean('flood').toFixed(1)}%\n`,
);
const perResource = RESOURCES.map((res, i) => {
  const have = rows.filter((r) => r.resourcePct[i] > 0).length;
  return `${res.id} ${mean2(i).toFixed(1)}/${have} seeds`;
});
function mean2(i) {
  return rows.reduce((a, r) => a + r.resourcePct[i], 0) / rows.length;
}
process.stdout.write(
  `resources (mean % of land cells / seeds with it): ${perResource.join(', ')}\n`,
);

process.stdout.write(
  '\nsettlement (after history): seed civs sites kinds population races meanCap claimed% settlems\n',
);
for (const r of rows) {
  const kinds = Object.entries(r.siteKinds)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');
  process.stdout.write(
    `${r.seed.padEnd(4)} ${String(r.civCount).padStart(2)} ${String(r.siteCount).padStart(3)}  ${kinds}  pop ${r.population}  ` +
      `${r.raceShares.join(' ')}  cap ${r.meanCapacity.toFixed(0)}  claimed ${r.claimed.toFixed(0)}%  ${r.ms.settle.toFixed(0)}ms\n`,
  );
}

process.stdout.write(
  '\nhistory: seed ms live ruined fell | pop start>peak>final | famine disease migr founded epochs | races % | chain uncaused\n',
);
let lopsided = 0;
for (const r of rows) {
  const h = r.history;
  const total = Object.values(r.raceTotals).reduce((a, b) => a + b, 0);
  const shares = Object.entries(r.raceTotals).map(([id, v]) => [id, Math.round(pct(v, total))]);
  if (shares.some(([, share]) => share > 70)) lopsided += 1;
  process.stdout.write(
    `${r.seed.padEnd(4)} ${r.ms.history.toFixed(0).padStart(5)}ms ${String(h.liveSites).padStart(4)} ${String(h.ruinedSites).padStart(4)} ${String(h.civsFell).padStart(2)} | ` +
      `${h.startPop}>${h.peakPop}>${h.finalPop} | ${f(h.famine, 5)}${f(h.disease, 5)}${f(h.migration, 5)}${f(h.siteFounded, 5)}${f(h.epochs, 5)} | ` +
      `${shares.map(([id, share]) => `${id} ${share}`).join(' ')} | ${h.chain} ${h.uncaused}\n`,
  );
}
process.stdout.write(`races > 70%: ${lopsided} of ${rows.length} seeds\n`);
process.stdout.write(
  '\nconflict: seed | beasts seen/slain | raids beast/civ | trade opened/relief | wars 1-100/101-200 (all) | peace yrs | battles conquered razed | mean goods per live site food/ore/timber/salt/luxury | wealth\n',
);
for (const r of rows) {
  const h = r.history;
  const n = (type) => h.typeCount[type] ?? 0;
  process.stdout.write(
    `${r.seed.padEnd(4)} | ${String(n('beast_appeared')).padStart(3)}/${String(n('beast_slain')).padEnd(3)} | ` +
      `${String(n('beast_raid')).padStart(4)}/${String(n('civ_raid')).padEnd(3)} | ${String(n('trade_opened')).padStart(2)}/${String(n('grain_relief')).padEnd(3)} | ` +
      `${h.warsEarly}/${h.warsLate} (${n('war_declared')}) | ${String(h.peaceYears).padStart(3)} | ` +
      `${String(n('battle')).padStart(3)} ${String(n('site_conquered')).padStart(3)} ${String(n('site_razed')).padStart(3)} | ` +
      `${['food', 'ore', 'timber', 'salt', 'luxury'].map((g) => h.meanGoods[g].toFixed(0)).join('/')} | ${h.totalWealth.toFixed(0)}\n`,
  );
}

process.stdout.write(
  '\nnotables: seed | alive/ever | dynasties | successions disputed | oaths | mages | legends (max alive) | artifacts books | lost stolen\n',
);
for (const r of rows) {
  const h = r.history;
  process.stdout.write(
    `${r.seed.padEnd(4)} | ${String(h.notablesAlive).padStart(4)}/${String(h.notablesEver).padEnd(5)} | ${String(h.dynasties).padStart(4)} | ` +
      `${String(h.successions).padStart(3)} ${String(h.disputed).padStart(3)} | ${String(h.oaths).padStart(4)} | ${String(h.mages).padStart(4)} | ` +
      `${String(h.legends).padStart(2)} (${h.legendsMax}) | ${String(h.artifacts).padStart(3)} ${String(h.books).padStart(3)} | ` +
      `${String(h.itemsLost).padStart(3)} ${String(h.itemsStolen).padStart(3)}\n`,
  );
}

process.stdout.write(
  '\nsuccession wars: seed | disputed | civil wars | throne seized / revolt crushed / split | dynasties ended | towns broke free\n',
);
for (const r of rows) {
  const h = r.history;
  process.stdout.write(
    `${r.seed.padEnd(4)} | ${String(h.disputed).padStart(3)} | ${String(h.civilWars).padStart(3)} | ` +
      `${String(h.thronesSeized).padStart(2)} / ${String(h.revoltsCrushed).padStart(2)} / ${String(h.realmSplits).padStart(2)} | ` +
      `${String(h.dynastiesEnded).padStart(3)} | ${String(h.citiesFreed).padStart(3)}\n`,
  );
}

if (siteMode) {
  process.stdout.write(
    `\nsite tier (${siteYears} years of site play after ${years} of history):\n`,
  );
  for (const r of rows) {
    const t = r.siteTier;
    if (!t) {
      process.stdout.write(`${r.seed}: no live site to embark on\n`);
      continue;
    }
    const sorted = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const list = (o, fmt = String) =>
      sorted(o)
        .map(([k, v]) => `${k} ${fmt(v)}`)
        .join(', ') || 'none';
    const lines = [
      `site: ${t.site.name} (id ${t.site.id})`,
      `followed residents: ${t.followedStart} at start, ${t.followedEnd} at end`,
      `events: ${t.totalEvents} in ${t.months.toFixed(0)} months`,
      `events per month by domain: ${list(t.perMonth, (v) => v.toFixed(1))}`,
      `longest cause chain: ${t.chain.length} events: ${t.chain.join(' > ') || 'none'}`,
      `deaths: ${t.deaths}; by cause: ${list(t.deathsByCause)}`,
      `breakdowns: tantrum ${t.tantrums}, despair ${t.despair}, wandered ${t.wandered}, theft ${t.thefts}`,
      `marriages: ${t.marriages}`,
      `births: ${t.births}`,
      `speed: ${t.daysPerSecond.toFixed(0)} days/s`,
    ];
    process.stdout.write(`${r.seed}\n${lines.map((l) => `  ${l}`).join('\n')}\n`);
  }
}

const baselineSeeds = () =>
  Object.fromEntries(rows.map((r) => [r.seed, baselineMetrics(r.history.metrics)]));
if (args['write-baseline']) {
  const file = {
    command: `npm run drama -- --seeds ${seeds.length} --years ${years}`,
    size,
    years,
    seeds: baselineSeeds(),
  };
  writeFileSync(args['write-baseline'], `${JSON.stringify(file, null, 2)}\n`);
  process.stdout.write(`\nbaseline written to ${args['write-baseline']}\n`);
}
if (args.baseline) {
  const base = JSON.parse(readFileSync(args.baseline, 'utf8'));
  const tolerance = args.tolerance ? { rel: Number(args.tolerance) } : {};
  const result = diffBaseline(base.seeds, baselineSeeds(), tolerance);
  process.stdout.write(`\nbaseline diff (${args.baseline}):\n${formatDiff(result)}\n`);
}
