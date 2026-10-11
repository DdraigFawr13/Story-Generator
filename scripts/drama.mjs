// World stats per seed: npm run drama -- --seeds 5 [--size 256] [--seed NAME]
import { loadEngine, parseArgs } from './load-engine.mjs';

const args = parseArgs(process.argv.slice(2));
const size = Number(args.size || 256);
const count = Number(args.seeds || 5);
const seeds = args.seed ? [args.seed] : Array.from({ length: count }, (_, i) => `S${i + 1}`);

const {
  generateWorld,
  checkWorldCells,
  checkRegions,
  D8_DX,
  D8_DY,
  DEFAULT_CONTENT,
  BIOMES,
  RESOURCES,
} = await loadEngine();

function stats(seed) {
  const ms = {};
  let last = performance.now();
  let stage = null;
  // Each callback reports the stage about to run (or just finished); charge elapsed time to
  // whichever stage was last announced.
  const world = generateWorld(seed, { width: size, height: size }, DEFAULT_CONTENT, (name) => {
    const now = performance.now();
    if (stage) ms[stage] = (ms[stage] ?? 0) + now - last;
    stage = name;
    last = now;
  });
  if (stage) ms[stage] = (ms[stage] ?? 0) + performance.now() - last;
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
  return {
    seed,
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
    problems: checkWorldCells(c).length + checkRegions(c, [...world.regions.values()]).length,
  };
}

const rows = seeds.map(stats);
// The four classic stages get a column each; the M1.3 stages are summed into "restms".
const stages = ['terrain', 'erosion', 'climate', 'water'];
// Regions get their own column, after the summed rest.
for (const r of rows) {
  r.ms.rest = Object.entries(r.ms)
    .filter(([name]) => !stages.includes(name) && name !== 'rest' && name !== 'regions')
    .reduce((a, [, v]) => a + v, 0);
}
stages.push('rest', 'regions');
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
