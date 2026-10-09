# Deterministic terrain contract — proposal v1

**Status:** implementation-ready proposal, verified by an offline Python design probe. This replaces the independent-tile geography section of the settlement proposal. It does not implement the production TypeScript engine, close the visual gate or establish gameplay balance.

## Scope and intended result

A fixed 64 × 40 map has a three-tile-wide north-to-south river, broad correlated woodland, fertility patches and occasional rocky areas. Terrain influences the same finite timber and fertile-field rules already proposed. One aggregate settlement starts on a dry patch near the river. A guaranteed river is a geography preset for this first slice, not a guarantee of prosperity, dramatic events or any particular history.

No islands/continents, erosion, navigation, bridges, pathfinding, biome ecosystem, drainage model or terrain editor is added. The river is deliberately carved, not a hydrology claim. Rendered footpaths in mockups are not simulated roads; defer them or label decorative connections clearly. Generated building placement remains the nine-tile founding patch, not the exact spacious screenshot composition.

All rules below are constants in the versioned P1 configuration, not public sliders. Any change requires new rules/simulation versions. Existing proposal fixtures that assumed per-tile independent noise are superseded.

## Inputs and draw order

Use the ASCII seed and FNV-1a/xorshift32-v1 rejection-sampled terrain stream from [settlement rules](SETTLEMENT_RULES.md). Weather and demographic streams are untouched.

1. Draw all **54 elevation nodes**, then all **54 fertility nodes**, then all **54 woodland nodes**. Each is a 9-column × 6-row lattice, row-major, uniform integer 0..100.
2. Draw the first river center x as `8 + uniform(48)` (8..55) at y=0.
3. For each y=1..39, draw `uniform(3)-1`, add it to the previous center and clamp to 3..60. Always draw before clamping.
4. There are 202 accepted uniform calls; rejection sampling may consume more raw PRNG steps. Save the actual resulting PRNG state, never an assumed draw count.
5. No random draws occur during interpolation, founding-site ranking, clearing or ID assignment.

The lattice has nodes at x=0,8,...,64 and y=0,8,...,40. The last row/column support interpolation; they are not extra map tiles.

## Exact integer interpolation

For tile (x,y), let `gx=floor(x/8)`, `gy=floor(y/8)`, `dx=x mod 8`, `dy=y mod 8`. Let A/B/C/D be lattice values at (gx,gy), (gx+1,gy), (gx,gy+1), (gx+1,gy+1). For each lattice:

```text
value = floor((
    A*(8-dx)*(8-dy) + B*dx*(8-dy)
  + C*(8-dx)*dy     + D*dx*dy
) / 64)
```

Sum integer terms before a single division/floor; do not round intermediate weights or use floating noise libraries. Call the resulting values E, F, W.

## Tile classification, in order

1. Elevation = `25 + floor(65*E/100)` (25..90).
2. Fertility = `40 + floor(60*F/100)` (40..100).
3. Terrain is rock if elevation ≥82, otherwise grass.
4. Grass with W≥55 carries 20 timber and is forest; other tiles carry zero.
5. If `abs(x-riverCenter[y])≤1`, override the tile to water, elevation=0, fertility=0 and timber=0.

The river occupies exactly 120 tiles. Consecutive centers differ by at most one, so consecutive three-tile strips overlap and the channel is connected by cardinal adjacency. Dry lowland is not classified as water based on elevation; do not add hidden lakes.

Forest is a grass-tile resource layer, not a fourth base terrain enum. Timber depletion changes its rendering to cleared grass under existing rules. No regrowth is introduced. Fertility is immutable after founding preparation.

## Founding-site selection and explicit fallback

Consider centers x=8..55, y=8..31 inclusive. This margin keeps the existing radius-eight work area within the map.

1. Reject any center whose 3 × 3 patch contains water.
2. A naturally valid patch has grass on all nine tiles (forest allowed), and at least two tiles have fertility ≥50.
3. For every remaining center compute a ranking tuple:
   - minimum Manhattan distance from center to **any water tile**;
   - Manhattan distance to map anchor (32,20);
   - row-major center tile index.
4. Select the lexicographically smallest tuple among naturally valid patches. No RNG and no locale sort.
5. If none are naturally valid, choose the smallest tuple among the dry patches. Convert its nine tiles to elevation 50, fertility 70, grass, zero timber.
6. Both paths record original tile values, center, removed timber and fallback status in founding facts. For a natural patch, only timber is cleared; preserve elevation and fertility. Removed forest timber is discarded initial site preparation, not added to the 40 starting timber.

A generated channel cannot cover every dry 3 × 3 site in the interior. Across any three adjacent rows, river water spans at most five x columns, leaving ample dry centers. Thus a dry fallback is available even if all land is rock. Do not alter river tiles to create a site.

Injected invalid geography with no dry patch (e.g. all water) is rejected before world activation; the old all-water carving fixture is replaced. The normal generator cannot produce that input. If a fixture has no water at all, use distance sentinel 104, larger than any in-map Manhattan distance, to make ranking deterministic.

After preparation, assign the two highest-fertility tiles to fields (tie by index), the lowest-index remaining tile to the store, and the six others to huts. Allocate settlement ID first and building IDs in tile-index order under existing rules. No further timber cost is charged for the founding endowment. Simulation construction remains subject to materials and legal sites.

## State and renderer boundaries

Store final per-tile elevation, fertility, base terrain and timber as authoritative state. Store the 40 river-center values as immutable generation metadata and preserve preparation facts in the founding record. Store the post-generation terrain RNG state. The coarse lattices are temporary generation inputs, not necessary for continuation.

The renderer consumes tile data; it must not regenerate terrain from a fresh RNG, infer a different river, or recolor depleted tiles as harvestable woodland. Decorative variations use stable tile keys or separate nonauthoritative rendering data. Camera, sprite density and art selection cannot change geography.

The probe digest below is deliberately a **terrain-contract fixture**, not the future full saved-world digest. Its ASCII-key payload contains seed, terrainRng, river, tiles, center, fallback, clearedTimber, originalPatch and buildings; building pairs use tile index/type, not production entity IDs. Do not substitute it for the full canonical archive/save contract.

## Reproducible evidence

Run from the repository root with standard-library Python 3:

```sh
python3 docs/probes/terrain_probe.py
```

Fixed battery: RIVERSIDE plus TERRAIN_000 through TERRAIN_098.

| Measurement | Observed |
| --- | --- |
| Seeds checked | 100 |
| Distinct final tile maps (seed/RNG excluded from diversity hash) | 100 |
| Distinct founding centers | 72 |
| Natural-generation fallbacks | 0 / 100 |
| Remaining forest tiles | 481–1,429 |
| Cardinally connected channels | 100 / 100 |
| Water count per map | 120 |
| Same-seed regeneration and founding | Equal on every seed |
| Forced all-rock land with intact river | Fallback succeeds without altering water |
| Injected all-water input | Rejected |

RIVERSIDE fixture: center tile **1327**, coordinate **(47,20)**; post-generation terrain RNG **2847659418**; remaining forest tiles **1056**.

Terrain fixture SHA-256:
`07a68eb6bb14a59ac536def9ac133478774970d059b49e1da5406d48be7268eb`

The probe checks dry occupied tiles, two fertile fields, nine structures, clearing timber conservation and river preservation. The golden fixture is pinned for a future TypeScript port. Python agreement with itself does not establish Node/browser equivalence; that remains required in engineering.

These results cover generation only, not accessible local timber balance, growth/survival, UI clarity, simulation ticks or physical-device performance. Counts establish diversity, not equal visual quality or a statistical guarantee of no fallback outside this battery.

## Implementation handoff

Port this contract to the pure TypeScript core without redesigning it inside the renderer. First establish the exact RIVERSIDE digest and post-generation RNG state, then port forced fallback and invalid-input fixtures, then run the full battery in Node and browser. Use exact safe integers and matching canonical bytes. Combine it with settlement/rules tests only after terrain fixtures pass.

Illustrated Minimal remains the chosen art direction. Production assets, source density, actual-size viewing and phone interaction verification remain separate from terrain generation correctness.
