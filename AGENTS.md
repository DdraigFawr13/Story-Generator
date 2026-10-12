# Agent instructions

Story Generator: a browser-only, data-driven world simulator in the Dwarf Fortress spirit (world generation, 250 years of history, then one live site). TypeScript, React, Vite, Canvas 2D; Vercel deploys from `main`.

Shared rules come from AI-Master-Instructions and load through CLAUDE.md (`.claude/master/RULES.md`, layers `core`, `stacks/node-web`, `project-types/game`). Don't edit synced files; see `.ai-master.json`.

## Read first

1. [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) (one page): rules that bind, how work flows, commands, code map.
2. The current spec in `docs/phases/` and its status section; `docs/ROADMAP.md` for where the project stands.
3. [docs/DECISIONS.md](docs/DECISIONS.md): locked decisions. Don't reopen them without asking.
4. `docs/LESSONS.md`: entries for the area you're working in.
5. [docs/REBOOT_PLAN.md](docs/REBOOT_PLAN.md) is the full plan; open only the section you need.

## Working style

- Plan per phase: spec in `docs/phases/PHASE_N.md` (at most two pages), user approval, then implement.
- Merge at milestones when CI is green; ask the user on design forks. End each phase with the playtest check-in from REBOOT_PLAN §1E.
- When the plan is silent, follow REBOOT_PLAN §1B: connect more systems, prefer data over code, make consequences visible.
- Bulk coding goes to the synced `implementer` agent and long check runs to `test-runner` (DEL-01 to DEL-05); give them the AGENT_BRIEF rules that apply.

## Local checks (run before pushing)

- Every push: `npm run check` (format, typecheck, boundaries, unit tests, build).
- UI or browser-test changes: also `npm run test:browser`.
- Worldgen changes: the `worldgen-check` skill.
- After a sync: `node .claude/master/sync.mjs --check`.

Cloud sessions: the synced session hook installs Node 24.19.0 and npm 11.9.0 and sets `PLAYWRIGHT_CHROMIUM_PATH` (read by `playwright.config.ts`). Don't download Node by hand or keep a local Playwright config.

## What CI runs

- **CI** (`ci.yml`): `core` (AI-master drift check, format, typecheck, boundaries, unit tests, build) and `browser` (Chromium smoke) on every PR and `main` push. Target: under 5 minutes.
- **Delete merged PR branches** (`prune-merged-branches.yml`, synced): after a merge, until GitHub's native auto-delete setting is on.

## Deployment

Vercel deploys production from `main` only (D-026); branch previews are off. After a milestone merge, verify the exact main revision and the live flow as [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) describes. Don't change `vercel.json`'s Git rule.

## Overrides

Master rules this project deliberately changes; the same entries are in `.ai-master.json`.

- **CTX-01, CTX-02, CTX-03**: no HANDOFF.md. Sessions start from AGENT_BRIEF and the phase spec; status is updated in the phase spec, ROADMAP and CHANGELOG at each milestone. Where another rule says HANDOFF, use the phase spec status.
- **SRC-04**: DECISIONS is a one-line table; the reasoning is in REBOOT_PLAN §3.
- **GAME-05**: no old saves or rule versions during the reboot (R-02).
