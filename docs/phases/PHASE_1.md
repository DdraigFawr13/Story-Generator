# Phase 1 — World generation and world map

**Goal:** press Generate and get a distinctive world in under 2 seconds: continents and mountain chains, seasonal climates, rivers that reach the sea, biomes, and unevenly clustered resources. You can pan, zoom, switch layers and click any cell to inspect it. This is the stage that later history and live sites play on.

## Status

M1.1 (PR #46), M1.2 with the worldgen tools (PR #47), M1.3 (PR #48) and the rainfall-band and slope-streak fix (PR #50) merged; M1.4 merged; M1.5 (naming and strategic features) in review; M1.6 (travel and routes) implemented, awaiting review. Extras approved 2026-10-11 (erosion, volcanoes, fertility, wildness, strategic features, M1.6 routes, climate params). Next: Phase 1 close (drama check and playtest check-in). Worldgen lives in `src/engine/worldgen/`, one module per stage in `generateWorld`, each with its own RNG stream; biome and resource tables live in `src/content/`.

## Milestones

**Done:**
- **M1.1 Terrain:** safe-math value noise (`noise.ts`); seeded continental and oceanic plates with ridges, island arcs and rifts along their edges; sea level set to the target land fraction (`terrain.ts`).
- **M1.2 Climate, water and erosion:** summer high and winter low per cell, wind-swept rainfall with rain shadows, drought/storm/snow risk, distance to sea and continentality (`climate.ts`); light stream-power erosion with a `floodplain` flag (`erosion.ts`); priority-flood rivers and lakes, every river ending in sea or lake (`water.ts`); `params.temperatureShift` (−15…15 °C) and `params.rainfallScale` (0.25…2), no UI (R-05).
- **M1.3 Biomes, resources, aura, fertility, wildness:** biomes from a temperature × rainfall table in `content/biomes.ts`, with water, alpine (elevation), swamp (wet floodplain) and frost-free rules applied outside the table (`biomes.ts`); volcanoes as a per-cell flag where oceanic plates dive under continental ones (`volcanoes.ts`); aura with legendary-place candidates (springs, old forests, peaks, hot springs) (`aura.ts`); clustered deposits from `content/resources.ts` (`resources.ts`); fertility from biome, rainfall, rivers and growing season, and wildness from distance to high-fertility "farmland", rough ground, biome and old forest (`habitat.ts`).

**M1.4 World map UI and worker** (~800 lines; design approved 2026-10-11: [viewer design](https://claude.ai/artifact/Ss3UUfRdddNgbgMU1j7upW))
- `platform/worldgen-worker.ts`: generation runs in a Web Worker (content is posted in as plain data), so the UI never freezes. A thin progress line under the top bar names each stage. The old world stays on screen, dimmed, until the new one arrives.
- `app/WorldMap.tsx`: a Canvas 2D map. Each base layer is rendered once per world into an offscreen canvas (one pixel per cell, via `renderLayer`) and drawn with nearest-neighbour scaling. Pan by drag, zoom by wheel and buttons from fit-to-screen to 8 px per cell, faint cell grid from 8 px. Camera maths ported from the legacy `map-camera`.
- **One base layer plus overlays.** Layer panel top left, grouped Land (elevation, biome), Climate (summer high, winter low, rainfall, drought, storm, snow), Life (fertility, wildness, aura, resources), then "Show on top": water (rivers, lakes and sea painted over climate layers) and hillshade (on by default for every layer, key H). A collapsed Debug group holds plates, river flow, distance to sea and floodplain, plus a "Raw numbers" switch. Number keys pick layers.
- **Legend** bottom left, drawn from `content/map-layers.ts`: a ramp bar with labelled stops and the unit, or swatches for categories. A tick follows the cell under the pointer and a readout shows its value.
- **Inspector** on the right opens on click (Esc or × closes it; the cell gets a ring). It shows the biome and coordinates, two to four "why" lines, then facts: elevation, summer/winter temperature, rainfall, risks as pills, water class, resources as chips and aura (plate, flow, flow direction and sea distance with Raw numbers on). Why lines come from a rule table in `content/map-why.ts` (rain shadow, windward, maritime, continental, altitude, floodplain, wild), so adding a rule is data. Each line names a layer and offers "show" to switch to it.
- **Minimap** bottom right shows the viewport box and recentres on click; zoom buttons top right. On phones the layers become a chip row, the inspector a bottom sheet, and the minimap is hidden.
- **URL:** `/?next&seed=S1&size=256&layer=rainfall&at=118,40&z=3`. Generate pushes a history entry; layer, cell and zoom changes replace it. Opening a link with a seed generates it and restores the view. Copy link says "Link copied". A bad seed shows a message by the field.
- `/?next` becomes: New world (seed, size 256 or 128), Generate, then the map. The Phase 0 chronicle and saves stay below it, and saves keep the generated cells.
- Smoke test: generate → toggle a layer → inspect a cell → save → reload → load.

**M1.5 Naming and strategic features** (~500 lines + content). Landed: `worldgen/regions.ts` (new last stage `regions`, own `worldgen.names` stream) fills `world.regions` with ranges, river main stems, forests, deserts, lakes, seas and the ocean, islands, volcano clusters, passes (saddle between ridges, retried at lower margins so every seed has one), fords, harbours (sheltered coast with a fallback), straits and bays, all named from `content/names.ts`; `landmasses()` is exported for M1.6. The map has a Names overlay (key N) with zoom-gated labels and pass/ford/harbour markers; the inspector lists a "Places" block; `drama` prints feature counts and `worldmap --layer features` paints them; `checkRegions` guards the invariants.
- Detect connected mountain ranges, rivers, forests, deserts, lakes, seas and islands, and name each from syllable tables in `content/names.ts`, e.g. "the Greyteeth", "River Aln", "the Ashwood".
- Strategic features as regions: passes (low saddles between basins), fords, natural harbours, straits and bays. Tests: a pass is lower than the ridge on both sides; a harbour touches sea and land.
- Names appear in the inspector and as map labels at suitable zoom levels.

**M1.6 Travel and routes** (~450 lines)
- Landed: `BiomeDef.travel`; `worldgen/travel.ts` (new last stage `routes`, no RNG) fills `cells.travelCost` (biome + slope, river crossing +12 except at fords, passes halve the slope term, lakes blocked, sea 2), `world.routes` (nodes at harbours, fords, passes and fertile river mouths, thinned to 3 cells apart; land edges by budgeted A* to each node's 4 nearest on its landmass; sea lanes between nearby harbours; a safety net that joins stray pieces of a landmass) and `cells.roads` (routes per cell). The map has a Roads overlay (key R), a Travel cost debug layer, a "Travel" inspector row and a "Road" why rule; `drama` prints nodes, edges, sea edges and connectivity; `worldmap --layer roads` paints them; `checkRoutes` guards the invariants. Phase 2 reads it for migration, trade and war reach.

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
