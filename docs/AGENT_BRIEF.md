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

1. One phase at a time, one thread per milestone. A phase gets a spec of at most two pages in `docs/phases/PHASE_N.md`, approved by the user, before code. Ask only on genuine design forks; record other defaults in the spec.
2. The main session plans, writes specs, reviews diffs, commits and merges. Bulk coding goes to the synced `implementer` agent (Sonnet) with a written spec that names the rules above; run `npm run check` and `npm run test:browser` directly (under 30 s each, measured 2026-10-12), since a cold `test-runner` agent takes longer to start than the checks take to run. Send only multi-seed drama, sweep or baseline runs to `test-runner` (Haiku). Keep one-line fixes local.
3. PRs of roughly 300–1,500 lines, one milestone each, squash-merged when CI is green. Branch pushes without a PR run no CI; push at reviewable checkpoints. Never retry a run blocked by a billing or runner message.
4. Each milestone: update the phase spec status, `docs/ROADMAP.md` and `CHANGELOG.md`; save sample maps and drama output under `/mnt/project-files/worldgen/<milestone>/`.
5. Production deploys from `main` only; confirm the live site after a merge ([DEPLOYMENT.md](DEPLOYMENT.md)).

## Commands

- `npm run check`: format, typecheck, boundaries, unit tests, build. Run before every push (about 27 s locally; CI's `core` job takes about 1 minute).
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
| `src/engine/people/` | attributes, aptitude, magic tiers, combat scale (R-24) |
| `src/content/` | races, cultures, biomes, resources, names, history rules, event types, map layers |
| `src/platform/` | IndexedDB saves, world-gen worker host |
| `src/app/` | the React world map and legends browser at `/` |
| `scripts/` | boundaries check, drama, worldmap |
| `tests/unit/`, `tests/browser/` | Vitest units, the Playwright smoke |
