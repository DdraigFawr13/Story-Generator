// Embarks on a site and reports it: npm run site -- --seed S1 --size 256 --site 6 [--days 336] [--out tmp/site]
// Writes <out>/<seed>-site<id>.png (one pixel per tile, x4) and <out>/<seed>-site<id>.txt (residents by household).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodePng, upscale } from './png.mjs';
import { loadEngine, parseArgs } from './load-engine.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = args.seed || 'S1';
const size = Number(args.size || 256);
const days = Number(args.days || 336);
const out = args.out || 'tmp/site';
const E = await loadEngine();
const C = E.DEFAULT_CONTENT;

const world = E.generateWorld(seed, { width: size, height: size }, C);
const popOf = (s) => E.sitePopulation(s);
let siteId = args.site ? Number(args.site) : 0;
if (!siteId) {
  for (const s of world.sites.values()) {
    if (s.ruinedYear === undefined && (!siteId || popOf(s) > popOf(world.sites.get(siteId))))
      siteId = s.id;
  }
}
const site = world.sites.get(siteId);
if (!site) {
  process.stderr.write(`No site ${siteId}.\n`);
  process.exit(1);
}
const pop = popOf(site);
const goodsBefore = { ...site.goods };

const t0 = performance.now();
const active = E.embark(world, C, siteId);
const embarkMs = performance.now() - t0;

const homes = [...active.buildings.values()].filter((b) => b.defId === 'home');
const followedHomes = homes.filter((b) => b.followed).length;
console.log(`Site ${siteId}: ${site.name} (${site.kind}), pop ${pop}`);
console.log(
  `Followed ${active.residents.length} (share ${active.share.toFixed(2)}), counted ${pop - active.residents.length}`,
);
console.log(
  `Households ${active.households.size}; homes ${followedHomes} followed + ${homes.length - followedHomes} counted; ${active.promoted.length} new people`,
);
const stockLine = () =>
  [...active.stock]
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id} ${Math.round(n)}`)
    .join(', ');
console.log(`Stock ${stockLine()}`);
console.log(`Embark ${embarkMs.toFixed(0)} ms; map digest ${E.localMapDigest(active.map)}`);

const firstEvent = world.events.length;
const meals = () => E.foodMeals(active, C);
const foodStart = meals();
const buildingsStart = new Set(active.buildings.keys());
const begunEvents = () => world.events.slice(firstEvent);
const t1 = performance.now();
for (let i = 0; i < days; i += 1) E.stepSite(world, C);
const seconds = (performance.now() - t1) / 1000;
console.log(
  `Daily life: ${days} days in ${(seconds * 1000).toFixed(1)} ms = ${(days / Math.max(seconds, 1e-6)).toFixed(0)} days/s (${active.residents.length} residents)`,
);
// Daily-life summary (M3.2): events by type, food, and how people stand at the end.
const counts = {};
for (const e of world.events.slice(firstEvent)) counts[e.type] = (counts[e.type] ?? 0) + 1;
console.log(
  `Events: ${
    Object.entries(counts)
      .map(([t, n]) => `${t} ${n}`)
      .join(', ') || 'none'
  }`,
);
console.log(
  `Food: ${foodStart.toFixed(0)} -> ${meals().toFixed(0)} meals (${(meals() / Math.max(1, foodStart)).toFixed(2)}x); ${E.foodDaysLeft(world, C).toFixed(0)} days left`,
);
console.log(`Stock now ${stockLine()}`);
const jobCounts = {};
for (const id of active.residents) {
  const job = world.people.get(id).detail.jobId;
  if (job) jobCounts[job] = (jobCounts[job] ?? 0) + 1;
}
console.log(
  `Jobs: ${
    Object.entries(jobCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([j, n]) => `${j} ${n}`)
      .join(', ') || 'none'
  }`,
);
const topSkills = active.residents.flatMap((id) => {
  const skills = Object.values(world.people.get(id).skills);
  return skills.length ? [Math.max(...skills)] : [];
});
console.log(
  `Skills: ${topSkills.length} skilled residents, mean top skill ${(topSkills.reduce((a, b) => a + b, 0) / Math.max(1, topSkills.length)).toFixed(1)}`,
);
const raised = [...active.buildings.values()].filter((b) => !buildingsStart.has(b.id));
console.log(
  `Buildings: ${begunEvents().filter((e) => e.type === 'site_build_begun').length} begun, ${begunEvents().filter((e) => e.type === 'site_built').length} built${raised.length ? ` (${raised.map((b) => `${b.defId}${b.progress === undefined ? '' : ` ${Math.round(((b.progress ?? 0) / (C.site.buildings.find((d) => d.id === b.defId)?.work ?? 1)) * 100)}%`}`).join(', ')})` : ''}; mean condition ${(
    [...active.buildings.values()]
      .filter((b) => b.defId !== 'field')
      .reduce((a, b) => a + b.condition, 0) /
    Math.max(1, [...active.buildings.values()].filter((b) => b.defId !== 'field').length)
  ).toFixed(0)}`,
);
const details = active.residents.map((id) => world.people.get(id).detail);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const needIds = C.needs.map((n) => n.id);
console.log(
  `Mean mood ${mean(details.map((d) => d.mood)).toFixed(1)}, stress ${mean(details.map((d) => d.stress)).toFixed(1)}; needs ${needIds
    .map(
      (n) =>
        `${n} ${mean(details.filter((d) => d.needs[n] !== undefined).map((d) => d.needs[n])).toFixed(0)}`,
    )
    .join(', ')}`,
);

// Picture: one pixel per tile.
const rules = C.site;
const idx = (list, id) => list.findIndex((e) => e.id === id);
const T = Object.fromEntries(rules.terrains.map((t, i) => [t.id, i]));
const TERRAIN = {
  grass: [118, 160, 84],
  scrub: [136, 150, 84],
  marsh: [90, 130, 110],
  shore: [214, 200, 150],
  rock: [130, 126, 120],
  field: [200, 176, 80],
  path: [176, 150, 110],
  floor: [150, 110, 80],
  wall: [70, 50, 40],
};
const WATER = [null, [60, 110, 190], [40, 80, 160], [70, 130, 200]];
const BUILD = {
  hall: [150, 40, 40],
  home: [140, 90, 60],
  well: [60, 90, 150],
  stockpile: [120, 90, 40],
  shrine: [220, 220, 240],
  field: [200, 176, 80],
  dock: [100, 70, 40],
  workshop: [90, 90, 110],
  wall: [60, 60, 60],
};
const map = active.map;
const rgba = new Uint8ClampedArray(map.width * map.height * 4);
for (let i = 0; i < map.width * map.height; i += 1) {
  let c = TERRAIN[rules.terrains[map.terrain[i]].id];
  if (map.mineral[i] === idx(rules.minerals, 'ore')) c = [210, 170, 40];
  else if (map.mineral[i] === idx(rules.minerals, 'clay')) c = [180, 110, 80];
  if (map.tree[i]) c = map.tree[i] === idx(rules.trees, 'conifer') ? [30, 90, 70] : [50, 120, 50];
  if (map.water[i]) c = WATER[map.water[i]];
  if (map.terrain[i] === T.path && map.water[i]) c = [150, 110, 70];
  if (map.building[i]) {
    const b = active.buildings.get(map.building[i]);
    c =
      b.defId === 'home' && !b.followed
        ? [105, 80, 65]
        : map.terrain[i] === T.wall
          ? [70, 50, 40]
          : BUILD[b.defId];
  }
  rgba.set([...c, 255], i * 4);
}
await mkdir(out, { recursive: true });
const big = upscale(map.width, map.height, rgba, 4);
const png = path.join(out, `${seed}-site${siteId}.png`);
await writeFile(png, encodePng(big.width, big.height, big.rgba));

// Residents by household.
const names = E.residentNames(world, active.residents);
const tier = (p) => E.TIERS[E.tierOfPower(p.magic.power)].id;
const lines = [
  `${site.name} (${site.kind}), ${pop} people, ${active.residents.length} followed`,
  '',
];
for (const h of active.households.values()) {
  lines.push(`${E.householdLabel(world, h, names)}${h.home === null ? ' (no home)' : ''}`);
  for (const id of h.members) {
    const p = world.people.get(id);
    lines.push(
      `  ${names.get(id)}${active.promoted.includes(id) ? '' : ' [notable]'}, ${p.sex}, ${C.races.find((r) => r.id === p.raceId).name}, age ${world.params.historyYears - p.born}, magic ${tier(p)}`,
    );
  }
}
const txt = path.join(out, `${seed}-site${siteId}.txt`);
await writeFile(txt, lines.join('\n') + '\n');
console.log(`Wrote ${png} and ${txt}`);

E.leaveSite(world, C);
const back = Object.keys(goodsBefore).every(
  (g) => world.sites.get(siteId).goods[g] === goodsBefore[g],
);
console.log(`Left the site: goods unchanged ${back}, people ${world.people.size}`);
