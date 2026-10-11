---
name: worldgen-check
description: Run the world generator's statistics and render its map layers after a worldgen change. Use after each Phase 1 milestone or any edit under src/engine/worldgen or the biome, resource and map-layer content.
---

# Worldgen check

1. Use Node 24 (see `.nvmrc`). Run `npm run drama -- --seeds 5` and copy the table, the `mean:` line and the per-resource line.
2. Run `npm run worldmap -- --seed S1 --layer all --out tmp/worldmap` and list the PNGs it wrote (`tmp/` is not committed).
3. Report: the stats, any seed with `bad` above 0 (and the problems `checkWorldCells` lists if you rerun it), `totms` above 2000, a land biome above about 35% of land, a seed with no harsh or no lush biome, and any resource absent from most seeds.
4. Do not edit files.
