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
- One thread per milestone, run as a pipeline (decided 2026-10-13, measured in `/mnt/project-files/process/thread-times.md`): the coordinator starts the next milestone's mock-up thread as soon as the current milestone enters its build, so the review and approval of N+1 overlap the build of N. The waiting thread pushes its branch but opens its PR only after the running milestone merges, then rebases and re-runs the checks.
- Mock-up round before a build ("lean round", 2026-10-13): a milestone that adds or changes UI gets a screen mock-up and one coordinator review pass (bugs and design changes in one list), then the user's approval card. An engine-only milestone gets an output mock-up (a numbers table, sample inspector and chronicle lines) that goes straight to the user, with no coordinator pass and no screenshot matrix. Read each milestone's reading list in the phase spec before anything else.
- Merge approval comes with the mock-up approval: when the user approves the mock-up, the thread merges its PR itself once CI is green, with no second card. A card is still posted for any fork that changes what the user sees.
- Tuning is time-boxed: at most 15 minutes or three runs per question, then a numbers table and a decision card. The status line is refreshed at every step, and a worker that runs longer than 20 minutes without a status change is stopped and asked for its numbers.
- Ask the user on design forks. End each phase with the playtest check-in from REBOOT_PLAN §1E.
- When the plan is silent, follow REBOOT_PLAN §1B: connect more systems, prefer data over code, make consequences visible.
- Bulk coding goes to the synced `implementer` agent (DEL-01 to DEL-05); give it the AGENT_BRIEF rules that apply. Long reads that need no judgement go to the `reader` (DEL-03). Run `npm run check` and `npm run test:browser` directly (DEL-02: a cold agent takes longer to start than they take to run; the measured times are in AGENT_BRIEF "Commands"); only multi-seed drama, sweep or baseline runs go to `test-runner`.
- A thread brief has five parts under headings, each a few lines: Goal (one sentence in the user's words), Read first (the phase spec section and at most five files), Deliverable (what exists when done), Done when (checks that pass or fail, such as "`npm run check` green and the 10-seed baseline diff empty"), Report (under 15 lines, with the command and its output for each check). Standing rules (phone-readable artifacts, the short label, brief replies after each task) are named by reference to the project instructions, not restated.

## Local checks (run before pushing)

- While iterating: run only the related tests (`npx vitest run tests/unit/<file>.test.ts`, about 4 s for two files); run the full check once before each push.
- Every push: `npm run check` (format of the changed files, typecheck, boundaries, unit tests, speed guard, build). CI formats every file.
- A test that needs an example event (a wedding, a beast slain) leads with the seed known to hold it and then searches the shared list in `tests/unit/helpers/find-world.ts`, whose cache is keyed by world size and content so files share the worlds they generate; if a history change loses an example, put the seed that holds it first rather than re-pinning. The browser smoke computes its world digests in Node at test time (`tests/browser/smoke-expected.ts`), so nothing is re-saved after a history change.
- If the site speed guard misses its limit in a thread container, don't re-run main to compare: it misses there too, and CI decides.
- UI or browser-test changes: also `npm run test:browser`.
- Worldgen changes: the `worldgen-check` skill.
- After a sync: `node .claude/master/sync.mjs --check`.

Cloud sessions: the synced session hook installs Node 24.19.0 and npm 11.9.0 and sets `PLAYWRIGHT_CHROMIUM_PATH` (read by `playwright.config.ts`). Take Node and Chromium from it; if `node -v` is wrong, run the hook again as AGENT_BRIEF "Commands" shows.

## What CI runs

- **CI** (`ci.yml`): `core` (AI-master drift check, format of every file, typecheck, boundaries, unit tests, build) and `browser` (Chromium smoke against the production build, two workers, Chromium download cached) on every PR and `main` push. Target: under 5 minutes.
- **Delete merged PR branches** (`prune-merged-branches.yml`, synced): after a merge, until GitHub's native auto-delete setting is on.

## Deployment

Vercel deploys production from `main` only (D-026); branch previews are off. After a milestone merge, verify the exact main revision and the live flow as [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) describes. Don't change `vercel.json`'s Git rule.

## Overrides

Master rules this project deliberately changes; the same entries are in `.ai-master.json`.

- **CTX-01, CTX-02, CTX-03**: no HANDOFF.md. Sessions start from AGENT_BRIEF and the phase spec; status is updated in the phase spec, ROADMAP and CHANGELOG at each milestone. Where another rule says HANDOFF, use the phase spec status.
- **SRC-04**: DECISIONS is a one-line table; the reasoning is in REBOOT_PLAN §3.
- **GAME-05**: no old saves or rule versions during the reboot (R-02).
