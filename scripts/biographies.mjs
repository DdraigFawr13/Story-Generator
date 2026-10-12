// Prints biographies: npm run bios -- --seed S1 [--people 4] [--sites 3] [--years 250] [--size 128]
// Every civ, the top sites by peak population, and the most famous people, as plain text.
import { loadEngine, parseArgs } from './load-engine.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = args.seed || 'S1';
const peopleCount = Number(args.people || 4);
const siteCount = Number(args.sites || 3);
const years = Number(args.years || 250);
const size = Number(args.size || 128);

const { generateWorld, DEFAULT_CONTENT, templateNarrator, buildLegendIndex, biography } =
  await loadEngine();

const world = generateWorld(
  seed,
  { width: size, height: size, historyYears: years },
  DEFAULT_CONTENT,
);
const narrator = templateNarrator(DEFAULT_CONTENT, (id) => world.people.get(id)?.name ?? `#${id}`);
const index = buildLegendIndex(world, DEFAULT_CONTENT);

function print(kind, id) {
  const bio = biography(world, DEFAULT_CONTENT, narrator, index, { kind, id });
  process.stdout.write(`\n== ${bio.name} (${kind}) ==\n${bio.summary.join(' ')}\n`);
  for (const line of bio.lines) process.stdout.write(`[Year ${line.year}] ${line.text}\n`);
}

for (const civ of world.civs.values()) print('civ', civ.id);
const sites = [...world.sites.values()].sort((a, b) => b.peakPop - a.peakPop || a.id - b.id);
for (const site of sites.slice(0, siteCount)) print('site', site.id);
const people = [...world.people.values()].sort((a, b) => b.fame - a.fame || a.id - b.id);
for (const person of people.slice(0, peopleCount)) print('person', person.id);
