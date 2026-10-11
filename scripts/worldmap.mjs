// Writes PNGs of world layers: npm run worldmap -- --seed NAME [--size 256] [--layer rainfall|features|roads|sites|all]
// [--out tmp/worldmap] [--scale 2]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodePng, upscale } from './png.mjs';
import { loadEngine, parseArgs } from './load-engine.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = args.seed || 'S1';
const size = Number(args.size || 256);
const scale = Number(args.scale || 2);
const out = args.out || 'tmp/worldmap';
const wanted = args.layer || 'all';

const {
  generateWorld,
  renderLayer,
  paintRegions,
  paintRoutes,
  paintSites,
  civColor,
  MAP_LAYERS,
  DEFAULT_CONTENT,
} = await loadEngine();
// "features", "roads" and "sites" are pseudo-layers: elevation with water and hillshade, then
// strategic features, routes, or territory tint and site dots on top.
const layers = wanted === 'all' ? MAP_LAYERS : MAP_LAYERS.filter((l) => l.id === wanted);
if (!layers.length && wanted !== 'features' && wanted !== 'roads' && wanted !== 'sites') {
  process.stderr.write(
    `Unknown layer "${wanted}". Layers: ${MAP_LAYERS.map((l) => l.id).join(', ')}, features, roads, sites\n`,
  );
  process.exit(1);
}

const world = generateWorld(seed, { width: size, height: size }, DEFAULT_CONTENT);
const cells = world.cells;
await mkdir(out, { recursive: true });
for (const layer of layers) {
  const image = upscale(cells.width, cells.height, renderLayer(cells, layer), scale);
  const file = path.join(out, `${seed}-${layer.id}.png`);
  await writeFile(file, encodePng(image.width, image.height, image.rgba));
  process.stdout.write(`${file}\n`);
}
if (wanted === 'features' || wanted === 'all') {
  const elevation = MAP_LAYERS.find((l) => l.id === 'elevation');
  const pixels = renderLayer(cells, elevation, { hillshade: true, water: true });
  paintRegions(pixels, cells.width, world.regions.values());
  const image = upscale(cells.width, cells.height, pixels, scale);
  const file = path.join(out, `${seed}-features.png`);
  await writeFile(file, encodePng(image.width, image.height, image.rgba));
  process.stdout.write(`${file}\n`);
}
if (wanted === 'roads' || wanted === 'all') {
  const elevation = MAP_LAYERS.find((l) => l.id === 'elevation');
  const pixels = renderLayer(cells, elevation, { hillshade: true, water: true });
  paintRoutes(pixels, cells.width, cells, world.routes);
  const image = upscale(cells.width, cells.height, pixels, scale);
  const file = path.join(out, `${seed}-roads.png`);
  await writeFile(file, encodePng(image.width, image.height, image.rgba));
  process.stdout.write(`${file}\n`);
}
if (wanted === 'sites' || wanted === 'all') {
  const elevation = MAP_LAYERS.find((l) => l.id === 'elevation');
  const pixels = renderLayer(cells, elevation, { hillshade: true, water: true });
  paintSites(pixels, cells.width, cells, world.sites.values(), civColor);
  const image = upscale(cells.width, cells.height, pixels, scale);
  const file = path.join(out, `${seed}-sites.png`);
  await writeFile(file, encodePng(image.width, image.height, image.rgba));
  process.stdout.write(`${file}\n`);
}
