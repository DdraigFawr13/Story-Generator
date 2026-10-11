# Agent instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) before code work. This file covers how agents use GitHub Actions; it is binding for Claude Code, Codex and any other coding agent.

## GitHub Actions budget rules

GitHub Actions minutes are a limited, account-wide budget shared by every repository. This repository is public, so its minutes are currently free, but the account's concurrent-job limit is shared with private repositories, and fast feedback still matters. CI exists to confirm reviewable work, not to be the debugger.

1. **Verify locally first.** Run the local checks below before every push. Debug failing tests locally; do not push just to see what CI says.
2. **Push at reviewable checkpoints.** Commit as often as useful, but batch related commits into one push. Each push to a PR branch starts a CI run (newer pushes cancel older runs, but cancelled runs still bill the minutes they used).
3. **Open the PR when the work is reviewable.** Feature-branch pushes without a PR run no CI. Don't open a PR for an unfinished sketch.
4. **Don't trigger full regression for trivial changes.** Do trigger it when the rules below require it, before merging.
5. **Never bypass checks to save minutes.** Don't skip, disable or weaken tests, seeds, engines or gates.
6. **Don't retry blocked runs.** If a run fails to start, or fails with a billing, quota, spending-limit or runner-provisioning message, stop. Don't re-run, push empty commits, or close and reopen the PR. Report the exact message to the user; the account owner has to fix it.
7. **No unnecessary deployments.** Production deploys from `main` only (D-026). Merge when a change is done, not to preview it.

## Local checks (run before pushing)

- Every push: `npm run format:check && npm run typecheck && npm run boundaries && npm test -- --exclude tests/unit/settlement-seed-battery.test.ts --exclude tests/unit/living-seed-battery.test.ts && npm run build`
- Simulation, adapter or controller changes: also `npm test -- tests/unit/settlement-seed-battery.test.ts` and `STORY_GENERATOR_BATTERY_SHARD=1/4 npm test -- tests/unit/living-seed-battery.test.ts`.
- UI or browser-test changes: also `npm run test:browser -- --project=chromium`.
- Before a milestone merge: `npm run check` (all 100 seeds) and `npm run test:browser` (all engines), if time allows; the CI full regression is the binding gate.

## What GitHub runs automatically

See [docs/CI_VERIFICATION.md](docs/CI_VERIFICATION.md). In short: every PR update runs Tier 1 (`unit`); simulation-area diffs add a representative seed battery; any `src/` or browser-test diff adds Chromium. While the repository is public (minutes are free), every main push runs the full regression; if it becomes private, main pushes run Tier 1 (plus full regression for high-risk paths). Dependency, toolchain, workflow and rule-version changes run the full regression automatically.

## When full regression is required

Add the PR label `full-regression` (or run *Actions › Full regression*) before merging:

- simulation rule changes, rule-version bumps, or anything that changes canonical digests;
- save-format or persistence changes;
- milestone or release merges (a phase exit gate);
- browser-flow changes that a Chromium-only run cannot vouch for (WebKit timing, storage quotas).

Dependency and toolchain updates trigger it automatically.

## Deployment

Vercel deploys production from `main` only; branch previews are off (D-026). To deploy, merge a verified PR. Afterwards verify the exact main revision and the live flow, as [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) describes. Don't change `vercel.json`'s Git rule.

## Branches

Merged PR branches are deleted automatically. Never delete an unmerged branch without explicit authorization.
