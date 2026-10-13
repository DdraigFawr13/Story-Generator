# Agent brief (one page)

Read this first. [REBOOT_PLAN.md](REBOOT_PLAN.md) is the full plan; open it only for a section you need (§3 locked decisions, §5 aptitude and magic, §6 life domains, §9 your phase). The current phase spec in `docs/phases/` wins where the two differ.

## What we are building

A browser-only, data-driven world simulator in the Dwarf Fortress spirit: a 256×256 world with climate, rivers, biomes and uneven resources; 250 years of coarse history (peoples, sites, famine, plague, migration, war, notables, legends); then one live site watched day by day. Grounded medieval fantasy: ordinary life is the backbone, magic is rare, and nobody beats one low-end field army (R-24, at most 3 legends alive). Drama emerges from interacting systems, never a director. Full vision: [VISION.md](VISION.md); decisions: [DECISIONS.md](DECISIONS.md).

## Rules that bind

- `src/engine` and `src/content` are pure: no DOM, `Date`, `Math.random`, timers, I/O, `**`, or `Math.sin/cos/exp/pow/log`. Named RNG stream per system (`streamFor(world, 'name')`), iterate in id order. `npm run boundaries` enforces the layer table in [ARCHITECTURE.md](ARCHITECTURE.md).
- Prefer a content entry over an engine special case; put tunable numbers in `src/content/` with a one-line comment.
- Every state change a person would notice emits an event with a content template and cause links. Chronicle text never invents facts.
- Tests are light: tiny fixtures, one determinism test, invariant checkers, one Chromium smoke. No seed batteries. Never skip or weaken a test to get green.
- No new runtime dependencies, API keys or backend without the user.

## How work flows

1. One phase at a time, one thread per milestone, run as a pipeline: the next milestone's mock-up starts when the current build starts (AGENTS.md "Working style"). A phase gets a spec of at most two pages in `docs/phases/PHASE_N.md`, approved by the user, before code. Each milestone there carries a reading list; open those files first and grep for the rest. Ask only on genuine design forks; record other defaults in the spec.
   - Lean mock-up round: a screen mock-up with one coordinator pass for UI milestones; an output mock-up (numbers table, sample lines) straight to the user for engine-only milestones. The user's mock-up approval is also the merge approval: merge on green CI with no second card. Tuning gets 15 minutes or three runs, then a numbers table and a card.
2. The main session plans, writes specs, reviews diffs, commits and merges. Bulk coding goes to the synced `implementer` agent (Sonnet) with a written spec that names the rules above; run `npm run check` and `npm run test:browser` directly (under 30 s each, measured 2026-10-12), since a cold `test-runner` agent takes longer to start than the checks take to run. Send only multi-seed drama, sweep or baseline runs to `test-runner` (Haiku). Keep one-line fixes local.
3. PRs of roughly 300–1,500 lines, one milestone each, squash-merged when CI is green. Branch pushes without a PR run no CI; push at reviewable checkpoints. Never retry a run blocked by a billing or runner message.
4. Each milestone: update the phase spec status, `docs/ROADMAP.md` and `CHANGELOG.md`; save sample maps and drama output under `/mnt/project-files/worldgen/<milestone>/`.
5. Production deploys from `main` only; confirm the live site after a merge ([DEPLOYMENT.md](DEPLOYMENT.md)).

## Commands

- `npm run check`: format, typecheck, boundaries, unit tests, build. Run before every push (about 40 s locally on 2026-10-13, of which the unit tests are 30 s; CI's two jobs take about 1 minute each).
- `npm run test:browser`: the Chromium smoke; run for UI or browser-test changes.
- `npm run drama -- --seeds 5`: world and history statistics per seed (a tool, not a gate).
- `npm run drama -- --seeds 10 --years 250 --baseline tests/baseline/drama-10-seeds.json`: diff history numbers against the saved baseline (`--write-baseline FILE` regenerates it).
- `npm run sweep -- --rule expandChance --values 0.1,0.3 --seeds 5`: one history summary line per rule value.
- `npm run worldmap -- --seed S1 --layer all --out tmp/worldmap`: PNGs per layer.
- Node 24.19.0 and npm 11.9.0 are pinned. Cloud sessions get them from the synced `.claude/hooks/session-start.sh`; if `node -v` differs, prepend `~/.cache/node/node-v24.19.0-linux-x64/bin` to `PATH`.

## Map of the code

| Path | Holds |
| --- | --- |
| `src/engine/core/` | types, rng, clock, scheduler, context, content validation, save |
| `src/engine/worldgen/` | terrain → erosion → climate → water → biomes → resources → aura → habitat → regions → routes |
| `src/engine/history/` | settlement, then yearly harvest, demography, famine, plague, migration, expansion |
| `src/engine/history/` (cont.) | then beasts, trade, raids, war, notables, items, importance, snapshots; `playback.ts` records display borders per year |
| `src/engine/people/` | attributes, aptitude, magic tiers, combat scale (R-24) |
| `src/engine/site/` | the watched site: `localmap`, `layout`, `promote`/`demote`, `tick` (day loop), `life` (needs, mood, breakdowns), `path` (A*), `work` (steward and jobs), `stock`, `build`, `outpost` |
| `src/engine/systems/` | shared daily systems (`weather`) |
| `src/engine/narrative/` | biographies, legend pages, chronicle text rendering |
| `src/content/` | one file per content type: races, cultures, biomes, resources, names, history rules, settlement, diseases, notables, legends, biographies, map layers and why-lines, playback effects; site content in `site`, `life`, `jobs`, `items`, `buildings`, `abilities`, `creatures` |
| `src/platform/` | IndexedDB saves, the world-gen and site workers and their hosts |
| `src/app/` | React: `WorldMap`, `MapPanels`, `YearSlider`, `HistoryPlayback` (+ `playback/`), `Legends` and `LegendPages`, `EmbarkCards`, `SiteView` with `site-panels` and `site-render` |
| `scripts/` | boundaries check, drama and baseline diff, sweep, worldmap, site, biographies |
| `tests/unit/`, `tests/browser/` | Vitest units (31 files, 251 tests, 30 s), the Playwright smoke (3 tests, 24 s) |
