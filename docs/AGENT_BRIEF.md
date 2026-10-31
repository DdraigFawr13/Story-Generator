# Agent brief (one page)

Read this first. [REBOOT_PLAN.md](REBOOT_PLAN.md) is the full plan; open it only for a section you need (§3 locked decisions, §5 aptitude and magic, §6 life domains, §9 your phase). The current phase spec in `docs/phases/` wins where the two differ.

## What we are building

A browser-only, data-driven world simulator in the Dwarf Fortress spirit: a 256×256 world with climate, rivers, biomes and uneven resources; 250 years of coarse history (peoples, sites, famine, plague, migration, war, notables, legends); then one live site watched day by day. Grounded medieval fantasy: ordinary life is the backbone, magic is rare, and nobody beats one low-end field army (R-24, at most 3 legends alive). Drama emerges from interacting systems, never a director. Full vision: [VISION.md](VISION.md); decisions: [DECISIONS.md](DECISIONS.md).

## Rules that bind

- `src/engine` and `src/content` are pure: no DOM, `Date`, `Math.random`, timers or I/O, and no `**` or `Math.sin/cos/exp/pow/log`, whose last bits differ between browsers and would break replay by seed. Every random draw comes from a named stream (`streamFor(world, 'name')`) and loops run in id order, so adding a system or rebuilding a map leaves every other seed's history unchanged. `npm run boundaries` enforces the layer table in [ARCHITECTURE.md](ARCHITECTURE.md).
- Prefer a content entry over an engine special case; put tunable numbers in `src/content/` with a one-line comment, so a balance change is a data change.
- Every state change a person would notice emits an event with a content template and cause links. Chronicle text never invents facts.
- A name a reader takes as identity never repeats in the same role (a person's spouses, items); a repeated life event says what changed (LESSONS 2026-10-13).
- Tests are light: tiny fixtures, one determinism test per tier (world in `history.test.ts`, site in `site-environment.test.ts`), invariant checkers, one Chromium smoke. A test that needs an example event searches with `tests/unit/helpers/find-world.ts`: its key's cover seeds first (a few seeds that hold every example, chosen with `scripts/seed-cover.mjs`), then the seed known to hold it, then the shared list; the generated worlds are shared across files; a battery of seeds belongs in `npm run drama`. Never skip or weaken a test to get green.
- No new runtime dependencies, API keys or backend without the user.

## How work flows

1. One phase at a time, one thread per milestone, run as a pipeline: the next milestone's mock-up starts when the current build starts (AGENTS.md "Working style"). A phase gets a spec of at most two pages in `docs/phases/PHASE_N.md`, approved by the user, before code. Each milestone there carries a reading list; open those files first and grep for the rest. Ask only on genuine design forks; record other defaults in the spec.
   - Lean mock-up round: a screen mock-up with one coordinator pass for UI milestones; an output mock-up (numbers table, sample lines) straight to the user for engine-only milestones. The user's mock-up approval is also the merge approval: merge on green CI with no second card. Tuning gets 15 minutes or three runs, then a numbers table and a card.
2. The main session plans, writes specs, reviews diffs, commits and merges. Bulk coding goes to the synced `implementer` agent (Sonnet) with a written spec that names the rules above; reading that would load more than about 8 KB you will not edit goes to the `reader` (Haiku). Send check runs (`npm run check`, `npm run test:browser`, drama, sweep and baseline runs) to the `test-runner` (Haiku) with the exact commands: on the same jobs it was as accurate as the main session at about a twentieth of the cost and no slower (measured 2026-10-31, AGENTS.md Overrides). Open the log lines it cites before acting on a failure. Keep one-line fixes local.
3. PRs of roughly 300–1,500 lines, one milestone each, squash-merged when CI is green; smaller PRs review faster and merge sooner. Branch pushes without a PR run no CI; push at reviewable checkpoints. Never retry a run blocked by a billing or runner message.
4. Each milestone: update the phase spec status, `docs/ROADMAP.md` and `CHANGELOG.md`; save sample maps and drama output under `/mnt/project-files/worldgen/<milestone>/`.
5. Production deploys from `main` only; confirm the live site after a merge ([DEPLOYMENT.md](DEPLOYMENT.md)).

## Commands

- `npm run check`: format (changed files only; CI checks all), typecheck, boundaries, unit tests, the site speed guard, build. Run before every push. Measured 2026-10-31 on a 4-core container: about 55 s, of which the unit tests are 41 s (528 tests in 75 files, 33 worlds built). The speed guard misses by about 1% in thread containers, on main too; CI decides it.
- `npm run test:browser`: the Chromium smoke, against a production build with two workers; run for UI or browser-test changes (25 tests, about 125 s with the build, 2026-10-31).
- While iterating, run only the related tests: `npx vitest run tests/unit/<file>.test.ts`.
- `npm run drama -- --seeds 5`: world and history statistics per seed (a tool, not a gate).
- `npm run drama -- --seeds 10 --years 250 --baseline tests/baseline/drama-10-seeds.json`: diff history numbers against the saved baseline (`--write-baseline FILE` regenerates it).
- `npm run sweep -- --rule expandChance --values 0.1,0.3 --seeds 5`: one history summary line per rule value.
- `npm run worldmap -- --seed S1 --layer all --out tmp/worldmap`: PNGs per layer.
- Node 24.19.0 and npm 11.9.0 are pinned. Take them from the synced `.claude/hooks/session-start.sh`, which cloud sessions run at start; if `node -v` differs, run the hook again (`CLAUDE_CODE_REMOTE=true bash .claude/hooks/session-start.sh`) or prepend `~/.cache/node/node-v24.19.0-linux-x64/bin` to `PATH`.

## Map of the code

One phrase per directory; `ls` and the phase spec's reading list give the rest.

| Path | Holds |
| --- | --- |
| `src/engine/core/` | types, content types and validation, rng, clock, scheduler, context, math helpers, save |
| `src/engine/worldgen/` | terrain → erosion → climate → water → biomes → resources → aura → habitat → regions → routes |
| `src/engine/history/` | settlement, then the yearly loop in `index.ts` calling one file per system (harvest to tempers); `playback.ts` records display borders per year |
| `src/engine/people/` | attributes, aptitude, magic tiers, combat scale (R-24) |
| `src/engine/site/` | the watched site: local map and layout, the day loop in `tick.ts`, one file per life domain (needs, health, social, family, society, work, stock, build, threats, lore, recap) |
| `src/engine/narrative/` | biographies, legend pages, chronicle text rendering |
| `src/content/` | one file per content type (races, cultures, biomes, names, history rules, legends, map layers, playback effects); site content in `content/site` |
| `src/platform/` | IndexedDB saves, the world-gen and site workers and their hosts |
| `src/app/` | React: the four rooms (`tales/`, `people/`, `book/`, `town/`) in the `rooms/` shell; the classic viewer (`WorldMap`, `Legends`, `SiteView`, `site-panels`) behind `?room=classic` |
| `scripts/` | boundaries check, drama and baseline diff, sweep, worldmap, site, biographies, changed-files format check |
| `tests/unit/`, `tests/speed/`, `tests/browser/` | Vitest units with the shared world helpers in `tests/unit/helpers/`, the site speed guard, the Playwright smoke |
