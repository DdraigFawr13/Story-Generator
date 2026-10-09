# Phase 1 foundations — 2026-10-09

**Historical slice record:** PR #11 is merged at `27c8137`. Weekly simulation is now implemented separately in [PHASE1_SETTLEMENT.md](PHASE1_SETTLEMENT.md); the tick-zero foundation format and its golden terrain vectors remain unchanged.

## Authorization and scope

After recovery PR #10 was merged, the user requested “Ok merge that pr and continue to next phase.” D-020 records authorization to begin Phase 1 engineering and supersedes the earlier no-scaffolding restriction. Remaining visual, economy and storage evidence stays open; it is not reported as passed.

This slice implements continuation backlog 1A and 1B foundations: a pure deterministic core, immutable complete-tick admission, the exact terrain port, tick-zero founders and a runnable map/inspector preview. It does not yet implement an advancing settlement, playback, live chronicle or local persistence. Selected-reference images are still unavailable; the Canvas map uses original temporary programmatic shapes/colors.

## Implemented contracts

- **Boundary:** `src/sim` imports only simulation modules; adapters own Web Crypto/random seed generation; the controller owns atomic world publication; React/Canvas only consume its immutable view. The AST boundary check covers static/type/dynamic imports and forbids browser, time, network and unseeded randomness in the core.
- **Seed/RNG:** 1–64 ASCII letters/digits/underscores/hyphens, without normalization; FNV-1a derives terrain/weather/demographics streams. `xorshift32-v1` uses nonzero uint32 states and rejection sampling over its 2^32−1 outputs. Stream states are explicit snapshot fields. Independent Python-derived vectors include a rejected raw draw.
- **Clock:** tick zero is founding, then 48 committed weeks/year and 12/season. Calendar labels describe completed weeks. No wall-clock scheduling is active in this preview; 15 seconds/week remains the proposed 12-minute/year controller pace.
- **Canonical data:** plain JSON records, dense ordered arrays, safe integer numbers, code-unit-sorted record keys and UTF-8 bytes. Negative zero becomes zero. Reject unsupported values, accessors, cycles, sparse arrays and symbol/non-enumerable record fields. Hashing belongs to adapters.
- **Admission:** a candidate advances exactly one tick and cannot truncate/rewrite committed events. IDs are contiguous, ticks ordered and causes resolve only to unique earlier events. Inclusive count/UTF-8 budgets admit a whole immutable snapshot or preserve the old state, RNG, IDs and archive. The generic `advanceTicks(initial, count, reducer)` is verified with a fixture reducer; it is not the future settlement weekly loop.
- **Terrain:** exact 64×40 integer interpolation, connected 120-tile river, clustered forest, deterministic site ranking and bounded river-preserving fallback from [TERRAIN_CONTRACT.md](TERRAIN_CONTRACT.md). Original founding patch, clearing and discarded timber are retained as facts.
- **Founders:** `p1-foundation-v1`, schema 1, 24 people/six households, 360 food, 40 timber, health 100, six huts/two fields/one store. Settlement ID 1; buildings 2–10; next entity 11; founding event 1; next event 2. Terrain RNG is post-generation; weather/demographics are untouched. Field/store/hut occupancy follows deterministic sorting, not screenshot composition.
- **Validation/publication:** `validateFoundingSnapshot` accepts only a complete, consistent tick-zero foundation snapshot. It is deliberately not a running-world restore validator. The controller builds/validates/admit-checks before replacing the world; invalid input leaves the prior world/view intact. View selection and rendering do not enter canonical state or consume simulation RNG.

The history admission defaults (50,000 events/16 MiB) are versioned engineering baselines from the persistence proposal, not measured browser quota guarantees or finalized storage policy. The foundation configuration contains terrain/founder constants only; no unreviewed economy or autosave policy is activated.

## Reproducible development

Node 24.19.0, npm 11.9.0 and exact dependencies are pinned with a lockfile. The package is private/`UNLICENSED`; no open-source license grant was selected. See [README.md](../README.md) for install/run commands and [CONTRIBUTING.md](../CONTRIBUTING.md) for provenance rules.

`npm run check` checks Prettier formatting, strict TypeScript, AST boundaries, Vitest and the Vite production build. CI runs that command plus the independent Python probe; a separate job installs supported Playwright native dependencies and runs all three browser engines. CI does not deploy.

## Verification recorded

| Check | Result in the resumed managed workspace |
| --- | --- |
| Clean `npm ci` | Passed with the committed exact lockfile |
| `npm run check` | Formatting, strict types, 14-module boundary check, 66 tests across five files and production build passed |
| `python3 docs/probes/terrain_probe.py` | 100 distinct maps, 72 centers, zero natural fallbacks, forest range 481–1,429; forced fallback passed, all-water input rejected |
| Independent golden terrain data | All 100 complete terrain digests, founding centers and post-generation RNG states match frozen Python-derived vectors in `tests/fixtures/terrain.json` |
| `npm run test:browser` | 18/18 passed: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2 via Playwright 1.64.0 |
| Node/browser parity | 100 terrain digests plus complete RIVERSIDE founding snapshot, forced fallback, Unicode canonical encoding and named stream starts match in all three engines |
| Preview interaction | Seed → controller → actual map/facts; invalid input preserves old map; keyboard and pointer tile selection; random seed; no page errors; no horizontal overflow at 320/390/768/1280 px; buttons ≥44 px |
| Candidate limits/continuation | Inclusive byte/event boundaries, rollback, immutable reducer inputs, archive/cause validation and fixture 137 ticks = captured 57 + 80 ticks passed |

The terrain vectors were generated by importing the unchanged standard-library Python probe, then hashing its complete `{seed, terrainRng, river, ...found(tiles)}` result. Tests never regenerate expected hashes from the TypeScript implementation. The exact RIVERSIDE fixture remains `07a68eb6bb14a59ac536def9ac133478774970d059b49e1da5406d48be7268eb`, center 1327, terrain RNG 2847659418.

Local browser startup needed environment accommodations: verified Debian native libraries extracted into `/tmp`, temporary Firefox application-data/XDG paths, and Firefox content/RDD sandbox environment settings for this already-isolated managed container. WebKit's temporary bundle needed native library links; its host check reads the system linker cache, so host validation was skipped only after resolving/loading those temporary libraries. These changes are outside the repository. Hosted CI uses ordinary `playwright install --with-deps` and no such overrides. Local engine evidence is not physical Android/iPhone/Safari validation or a guarantee of every installed browser version.

## Next slice and remaining acceptance

Continue with **weekly labor, resource ledgers, construction, aggregate demographics and canonical events** (continuation slice 1C; implementation-plan 1.8–1.16). Add a running-world invariant validator and settlement reducer, then check forced seasons/shortages/extinction, equal-tick determinism and 100 seeds × 1,000 ticks. Before final balance acceptance, address winter preparation and whether field-first labor prevents small populations recovering.

Next add one-slot IndexedDB persistence/controller continuity (continuation 1D), including the autosave wall-clock loss window and two-tab ownership, then the complete selected-art viewer/chronicle (1E). Save/reload, hidden-tab behavior, long-run balance, qualitative trajectories, source-density/contrast and physical-device support remain first-playable requirements. No preview has been deployed.
