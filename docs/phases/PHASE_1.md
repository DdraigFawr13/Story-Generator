# Phase 1 — World generation and world map

**Goal:** press Generate and get a distinctive world in under 2 seconds: continents and mountain chains, seasonal climates, rivers that reach the sea, biomes, and unevenly clustered resources. You can pan, zoom, switch layers and click any cell to inspect it. This is the stage that later history and live sites play on.

## Status

M1.1 (PR #46), M1.2 with the worldgen tools (PR #47) and M1.3 (PR #48) merged. Extras approved 2026-10-11 (erosion, volcanoes, fertility, wildness, strategic features, M1.6 routes, climate params). Next: M1.4 (world map UI and worker). Worldgen lives in `src/engine/worldgen/`, one module per stage in `generateWorld`, each with its own RNG stream; biome and resource tables live in `src/content/`.

## Milestones

**Done:**
- **M1.1 Terrain:** safe-math value noise (`noise.ts`); seeded continental and oceanic plates with ridges, island arcs and rifts along their edges; sea level set to the target land fraction (`terrain.ts`).
- **M1.2 Climate, water and erosion:** summer high and winter low per cell, wind-swept rainfall with rain shadows, drought/storm/snow risk, distance to sea and continentality (`climate.ts`); light stream-power erosion with a `floodplain` flag (`erosion.ts`); priority-flood rivers and lakes, every river ending in sea or lake (`water.ts`); `params.temperatureShift` (−15…15 °C) and `params.rainfallScale` (0.25…2), no UI (R-05).
- **M1.3 Biomes, resources, aura, fertility, wildness:** biomes from a temperature × rainfall table in `content/biomes.ts`, with water, alpine (elevation), swamp (wet floodplain) and frost-free rules applied outside the table (`biomes.ts`); volcanoes as a per-cell flag where oceanic plates dive under continental ones (`volcanoes.ts`); aura with legendary-place candidates (springs, old forests, peaks, hot springs) (`aura.ts`); clustered deposits from `content/resources.ts` (`resources.ts`); fertility from biome, rainfall, rivers and growing season, and wildness from distance to high-fertility "farmland", rough ground, biome and old forest (`habitat.ts`).

**M1.4 World map UI and worker** (~800 lines)
- `platform/worldgen-worker.ts`: generation runs in a Web Worker with a progress bar, so the UI never freezes. The engine stays a pure function: `generateWorld(seed, params, onProgress)`.
- `app/WorldMap.tsx`: a Canvas 2D renderer with an offscreen-cached base layer, pan and zoom (reusing the legacy `map-camera` maths), hillshading, and layer toggles for elevation, biome, fertility, wildness, plates, temperature (summer/winter), rainfall, rivers, resources and aura. Includes a legend, a minimap and a cell inspector (biome, elevation, temperatures, rainfall, risks, resources, aura, region names) with "why" lines built from the layers, e.g. "Dry: rain shadow of the range to the west". The seed goes in the URL.
- `/?next` becomes: New World (seed, size), Generate, then the map. The Phase 0 chronicle and saves stay below it.
- Smoke test: generate → toggle a layer → inspect a cell → save → reload → load.

**M1.5 Naming and strategic features** (~500 lines + content)
- Detect connected mountain ranges, rivers, forests, deserts, lakes, seas and islands, and name each from syllable tables in `content/names.ts`, e.g. "the Greyteeth", "River Aln", "the Ashwood".
- Strategic features as regions: passes (low saddles between basins), fords, natural harbours, straits and bays. Tests: a pass is lower than the ridge on both sides; a harbour touches sea and land.
- Names appear in the inspector and as map labels at suitable zoom levels.

**M1.6 Travel and routes** (~450 lines)
- Per-cell travel cost from slope, biome, rivers (fords cheap) and sea; a coarse route graph between the best site candidates (harbours, fords, passes, fertile river mouths) by budgeted A*; a "likely roads" map layer. Phase 2 reads it for migration, trade and war reach.

**Close:** drama-check stub (`npm run drama -- --seeds 5`) printing world statistics (land fraction, biome mix, river count and length, resource spread, fertile and wild shares, passes and harbours, generation time), plus the Phase 1 check-in.

## Tools (no new runtime dependencies)

- Landed with M1.2: `npm run drama -- --seeds 5`: world stats per seed and time per stage; grows with each milestone.
- `npm run worldmap -- --seed X --layer <name>`: writes a PNG of a layer (Node `zlib`), from a pure layer-to-colour renderer the M1.4 map reuses. Palettes and legends live in `content/map-layers.ts`.
- `checkWorldCells(world)`: invariant checker (sizes, ranges, rivers reach sea or lake) for tests and dev builds; `gridFromAscii()` builds tiny fixture maps.
- `worldgen-check` project skill (`.claude/skills/worldgen-check/`): the routine `test-runner` follows after each worldgen change.
- Still to come, M1.4: debug layers (plates, flow, sea distance, travel cost), raw numbers in the optional inspector panel, `?seed=` URLs.

## Data shapes

```ts
interface WorldCells {            // typed arrays, index = y * width + x (see engine/core/types.ts)
  elevation: Int16Array; plate: Uint8Array; plates: Plate[];      // M1.1; metres, sea level = 0
  tempSummer: Int8Array; tempWinter: Int8Array; rainfall: Uint16Array;   // M1.2; °C, mm/year
  seaDistance: Uint16Array; floodplain: Uint8Array;
  risk: { drought: Uint8Array; storm: Uint8Array; snow: Uint8Array };  // 0–100
  flowDir: Int8Array; flow: Uint32Array; water: Uint8Array;            // 0 land, 1 river, 2 lake, 3 sea
  biome: Uint8Array; volcano: Uint8Array;                              // M1.3
  aura: Uint8Array; auraSpots: AuraSpot[];                             // 0–100; legendary-place candidates
  fertility: Uint8Array; wildness: Uint8Array;                         // 0–100
  resources: Map<number, ResourceDeposit[]>;   // sparse; ResourceDeposit = { resource, amount 1–100 }
  travelCost: Uint8Array;                      // M1.6
}
interface Region { id: Id; kind: 'range' | 'river' | 'forest' | 'desert' | 'lake' | 'sea' | 'island'
  | 'pass' | 'ford' | 'harbour' | 'strait' | 'bay' | 'volcano';
  name: string; cells: number[] }              // M1.5 builds regions, naming volcano clusters too
interface WorldState { cells: WorldCells | null; regions: Map<Id, Region>; … }
```
Integer typed arrays keep the maths exact and the save small. `serializeWorld` gets typed-array tagging, as it already has for `Map`.

## Cross-domain links

- Climate → biome → resources: harsh regions really are poorer, which later drives migration and trade.
- Per-cell seasonal temperature and risks → Phase 3 warmth, crops and weather events at the live site.
- Aura and legendary-place candidates → Phase 2 magic births (R-26) and legendary sites.
- Rivers and coasts → Phase 2 site placement and trade routes.

## Defaults chosen

- **Map:** 256×256 cells by default, with a 128×128 "small" option for phones and tests. The map is bounded with ocean margins rather than wrapping east-west, which is simpler to read and render.
- **Noise:** value noise with integer hashing rather than simplex. Simplex needs no trigonometry either, but value noise is simpler and good enough once octaves and plates are added.
- **Units:** real-world units (metres, °C, mm), because they make content tables and the inspector readable.
- **Performance:** budget is 256×256 in under 2 s in the worker. Generation is measured in the drama check, not gated in CI.

## Design fork (decided 2026-10-11)

**Default number of landmasses:** a few continents (3–5) plus islands, so borders, seas and trade routes separate civilizations. The alternatives were one supercontinent or an archipelago; any choice is just `params.continents`.

## Done when

- [ ] 5 seeds give visibly different worlds.
- [ ] Every river reaches the sea or a lake.
- [ ] Climates vary meaningfully across each map, with at least one desert or tundra and one lush region on 256×256 maps.
- [ ] Resources are uneven and rare resources are rare.
- [ ] 256×256 generates in under 2 s on desktop, without blocking the UI.
- [ ] Floodplains are more fertile than nearby uplands, and wildness is highest far from fertile land.
- [ ] Every seed has at least one pass and one harbour; each pass is lower than the ridge on both sides.
- [ ] The route graph connects most site candidates on each landmass, and the likely-roads layer shows it.

## Out of scope

Civilizations, sites and history (Phase 2); world-gen slider UI; z-levels; final art.
