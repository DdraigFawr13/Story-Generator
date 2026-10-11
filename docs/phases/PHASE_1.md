# Phase 1 — World generation and world map

**Goal:** press Generate and get a distinctive world in under 2 seconds: continents and mountain chains, seasonal climates, rivers that reach the sea, biomes, and unevenly clustered resources. You can pan, zoom, switch layers and click any cell to inspect it. This is the stage that later history and live sites play on.

## Status

M1.1 merged. Next: M1.2 (climate and water), delegated to the `implementer` agent with this section as its spec. Terrain lives in `src/engine/worldgen/` (`noise.ts`, `terrain.ts`, `index.ts`); add a stage per milestone in `generateWorld` with its own RNG stream.

## Milestones

**M1.1 Terrain** (~600 lines)
- `engine/worldgen/noise.ts`: integer-hashed value noise with smoothstep interpolation and fractal octaves. Only safe math, so output is identical in every browser.
- `engine/worldgen/terrain.ts`: seeded plate centres (Voronoi). Each plate is continental or oceanic. Base height comes from the plate type plus noise. Colliding plate edges raise mountain ridges; diverging edges make rifts. Sea level is chosen to hit a target land fraction (default about 35%).
- Tests: same seed gives identical heights; the land fraction is within ±5% of the target; ridges lie along plate boundaries.

**M1.2 Climate and water** (~600 lines)
- Temperature from latitude, elevation lapse and noise, stored as a **summer high and winter low per cell**. The live site and history read seasons from this.
- Rainfall from a prevailing-wind sweep: moisture picked up over sea, dropped on windward slopes, leaving a rain shadow behind ranges.
- Per-cell weather risks for drought, storms and snow, derived from the rainfall's variability and temperature.
- Rivers: fill depressions (priority flood), then follow the downhill flow direction and accumulate flow. Cells above a flow threshold become rivers; filled basins above a size become lakes. Every river ends in sea or a lake.
- Tests on tiny fixture maps: water never runs uphill, every river reaches sea or lake, the lee side of a ridge is drier than the windward side.

**M1.3 Biomes, resources, aura** (~500 lines + content)
- `content/biomes.ts`: a table indexed by temperature × rainfall (tundra, taiga, temperate forest, grassland, steppe, desert, savanna, jungle, swamp, alpine, plus ocean, coast, lake). Every medium map gets at least one harsh region and one lush one by construction of the climate bands.
- `content/resources.ts`: metals (copper, iron, silver, gold), stone, clay, salt, gems, fertile soil, timber, game, fish, and a magical reagent. Each declares the biomes or elevations it favours, a cluster size and a rarity. Deposits are placed in seeded clusters, so iron sits in some hills but not all, and gems and reagents are genuinely rare.
- `aura` layer: low everywhere, with a few high-aura spots (springs, old forests, peaks) marked as **legendary-place candidates** for Phase 2.
- Tests: the biome table is complete; every resource appears on most seeds but is absent from most cells; rare resources stay under their cell-share cap.

**M1.4 World map UI and worker** (~800 lines)
- `platform/worldgen-worker.ts`: generation runs in a Web Worker with a progress bar, so the UI never freezes. The engine stays a pure function: `generateWorld(seed, params, onProgress)`.
- `app/WorldMap.tsx`: a Canvas 2D renderer with an offscreen-cached base layer, pan and zoom (reusing the legacy `map-camera` maths), and layer toggles for elevation, biome, temperature (summer/winter), rainfall, rivers, resources and aura. Includes a legend, a minimap and a cell inspector (biome, elevation, temperatures, rainfall, risks, resources, aura, region names).
- `/?next` becomes: New World (seed, size), Generate, then the map. The Phase 0 chronicle and saves stay below it.
- Smoke test: generate → toggle a layer → inspect a cell → save → reload → load.

**M1.5 Naming and region features** (~400 lines + content)
- Detect connected mountain ranges, rivers, forests, deserts, lakes, seas and islands, and name each from syllable tables in `content/names.ts`, e.g. "the Greyteeth", "River Aln", "the Ashwood".
- Names appear in the inspector and as map labels at suitable zoom levels.

**Close:** drama-check stub (`npm run drama -- --seeds 5`) printing world statistics (land fraction, biome mix, river count and length, resource spread, generation time), plus the Phase 1 check-in.

## Data shapes

```ts
interface WorldCells {            // typed arrays, index = y * width + x
  elevation: Int16Array;          // metres; sea level = 0
  plate: Uint8Array;
  tempSummer: Int8Array; tempWinter: Int8Array;   // °C
  rainfall: Uint16Array;          // mm/year
  risk: { drought: Uint8Array; storm: Uint8Array; snow: Uint8Array };  // 0–100
  flowDir: Int8Array; flow: Uint32Array; water: Uint8Array;            // 0 land, 1 river, 2 lake, 3 sea
  biome: Uint8Array;              // index into content biomes
  aura: Uint8Array;               // 0–100
  resources: Map<number, ResourceDeposit[]>;   // sparse: only cells that have any
}
interface Region { id: Id; kind: 'range' | 'river' | 'forest' | 'desert' | 'lake' | 'sea' | 'island';
  name: string; cells: number[] }
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

## Design fork (decided 2026-10-11: option 1, approved with the spec)

**Default number of landmasses?**
1. **A few continents (3–5) plus islands.** Recommended: borders, seas and trade routes create natural separation between civilizations.
2. One supercontinent: everyone meets everyone, so expect more war and less isolation.
3. Archipelago: many islands make sea travel central, which is harder to simulate early.

Any choice becomes a `params.continents` field, so it can change later without code.

## Done when

- [ ] 5 seeds give visibly different worlds.
- [ ] Every river reaches the sea or a lake.
- [ ] Climates vary meaningfully across each map, with at least one desert or tundra and one lush region on medium maps.
- [ ] Resources are uneven and rare resources are rare.
- [ ] 256×256 generates in under 2 s on desktop, without blocking the UI.

## Out of scope

Civilizations, sites and history (Phase 2); world-gen sliders beyond seed, size and continents; z-levels; final art.
