// Writes PNGs of world layers: npm run worldmap -- --seed NAME [--size 256] [--layer rainfall|all]
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

const { generateWorld, renderLayer, MAP_LAYERS } = await loadEngine();
const layers = wanted === 'all' ? MAP_LAYERS : MAP_LAYERS.filter((l) => l.id === wanted);
if (!layers.length) {
  process.stderr.write(
    `Unknown layer "${wanted}". Layers: ${MAP_LAYERS.map((l) => l.id).join(', ')}\n`,
  );
  process.exit(1);
}

const cells = generateWorld(seed, { width: size, height: size }).cells;
await mkdir(out, { recursive: true });
for (const layer of layers) {
  const image = upscale(cells.width, cells.height, renderLayer(cells, layer), scale);
  const file = path.join(out, `${seed}-${layer.id}.png`);
  await writeFile(file, encodePng(image.width, image.height, image.rgba));
  process.stdout.write(`${file}\n`);
}
