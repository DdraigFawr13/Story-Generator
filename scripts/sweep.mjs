// Rule sweep: npm run sweep -- --rule expandChance --values 0.1,0.3 [--seeds 5] [--years 250] [--size 256]
// The rule is a path in DEFAULT_CONTENT.history, or a dotted path from the content root when it
// starts with a content key (settlement.capacity.foreignBiome, races.tylwyth.fertility).
import { loadEngine, parseArgs } from './load-engine.mjs';
import { historyMetrics } from './history-metrics.mjs';

const args = parseArgs(process.argv.slice(2));
const size = Number(args.size || 256);
const count = Number(args.seeds || 5);
const years = Number(args.years || 250);
const fail = (message) => {
  process.stderr.write(`sweep: ${message}\n`);
  process.exit(1);
};
if (!args.rule || !args.values)
  fail('usage: --rule <path> --values a,b,c [--seeds 5] [--years 250]');
const values = args.values
  .split(',')
  .map((v) => (v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : v));

const { generateWorld, runHistory, DAYS_PER_YEAR, DEFAULT_CONTENT } = await loadEngine();
const raceIds = DEFAULT_CONTENT.races.map((race) => race.id);

/** Walk a dotted path; arrays are indexed by element id (or a numeric index). Returns [parent, key]. */
function resolve(content, rule) {
  const parts = rule.split('.');
  let node = parts[0] in content ? content : content.history;
  const walked = node === content ? [] : ['history'];
  for (let i = 0; i < parts.length; i += 1) {
    const last = i === parts.length - 1;
    let key = parts[i];
    if (Array.isArray(node)) {
      const at = node.findIndex((item) => item?.id === key);
      key = at >= 0 ? at : Number(key);
      if (!Number.isInteger(key) || key < 0 || key >= node.length) {
        fail(
          `unknown path "${rule}": no element "${parts[i]}" under ${walked.join('.') || 'content'}`,
        );
      }
    } else if (node === null || typeof node !== 'object' || !(key in node)) {
      fail(`unknown path "${rule}": no "${key}" under ${walked.join('.') || 'content'}`);
    }
    walked.push(parts[i]);
    if (last) return [node, key];
    node = node[key];
  }
}

// Fail on a bad path before any world is generated.
{
  const [parent, key] = resolve(DEFAULT_CONTENT, args.rule);
  if (typeof parent[key] === 'object' && parent[key] !== null) {
    fail(`"${args.rule}" is not a single value; name a leaf`);
  }
}

/** Deep clone of plain data and arrays; functions (content has a few) are shared, not copied. */
function cloneContent(value) {
  if (Array.isArray(value)) return value.map(cloneContent);
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, cloneContent(v)]));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cloneContent(v)]));
  }
  return value;
}

function run(seed, content) {
  const world = generateWorld(seed, { width: size, height: size, historyYears: 0 }, content);
  const livePop = () => {
    let n = 0;
    for (const site of world.sites.values()) for (const band of site.pop) n += band.count;
    return n;
  };
  const startPop = livePop();
  let peakPop = startPop;
  world.params.historyYears = years;
  const t = performance.now();
  runHistory(world, content, () => {
    peakPop = Math.max(peakPop, livePop());
  });
  return historyMetrics(world, {
    startPop,
    peakPop,
    historyMs: performance.now() - t,
    rollupBelow: content.history.importance?.rollupBelow,
    DAYS_PER_YEAR,
    raceIds,
    orderRules: content.history.orders,
    cultures: content.cultures,
  });
}

const seeds = Array.from({ length: count }, (_, i) => `S${i + 1}`);
const mean = (list, k) => list.reduce((a, m) => a + m[k], 0) / list.length;
const sum = (list, k) => list.reduce((a, m) => a + m[k], 0);
process.stdout.write(
  `sweep ${args.rule}, ${count} seeds x ${years} years, ${size}x${size}\n` +
    `value | live | ruined | seeds w/ ruins | civs fell | pop final/peak | famine | disease | wars | share % ${raceIds.join('/')} | min share | seeds all races >= 8% | ms\n`,
);
for (const value of values) {
  const content = cloneContent(DEFAULT_CONTENT);
  const [parent, key] = resolve(content, args.rule);
  parent[key] = value;
  const list = seeds.map((seed) => run(seed, content));
  const shares = raceIds.map((id) => mean(list, `share_${id}`).toFixed(0)).join('/');
  const balanced = list.filter((m) => m.minShare >= 8).length;
  process.stdout.write(
    [
      String(value),
      mean(list, 'liveSites').toFixed(1),
      mean(list, 'ruinedSites').toFixed(1),
      `${sum(list, 'ruinsAny')}/${count}`,
      sum(list, 'civsFell'),
      `${mean(list, 'finalPop').toFixed(0)}/${mean(list, 'peakPop').toFixed(0)}`,
      mean(list, 'famine').toFixed(0),
      mean(list, 'disease').toFixed(1),
      mean(list, 'wars').toFixed(1),
      shares,
      Math.min(...list.map((m) => m.minShare)).toFixed(1),
      `${balanced}/${count}`,
      mean(list, 'historyMs').toFixed(0),
    ].join(' | ') + '\n',
  );
}
