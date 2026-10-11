# CI verification tiers

Since D-031 (2026-10-11), GitHub verification is tiered, so routine changes no longer run the full 14-job matrix. No test, seed, engine, assertion or coverage gate was removed: the complete regression is the same work as before, run on demand and for high-risk changes.

## What runs when

| Tier | Runs on | Work | Typical billed minutes |
| --- | --- | --- | --- |
| 1 Fast | Every PR update and every main push | `unit`: format, typecheck, boundaries, every ordinary unit test, build, both Python probes. Markdown-only changes run the format check only. | ~5 (~2 for Markdown only) |
| 2 Integration | PRs whose diff touches the matching code | `seed-battery` (sample) for `src/sim`, `src/adapters`, `src/controller` and battery files: all 100 settlement seeds plus living partition 1/4. `browser-tests` (Chromium) for any `src/`, `tests/browser/`, browser fixture or `index.html` change. | +8 sim, +5 browser |
| 3 Full regression | PR label `full-regression`; high-risk paths; manual dispatch | Both batteries, all 100 seeds, as 8 reported partitions in 3 jobs, then the unchanged `verify-seed-battery.mjs --living` coverage gate; every browser case in Chromium, Firefox and WebKit. | ~45 |

High-risk paths force Tier 3 automatically: `package.json`, `package-lock.json`, `.nvmrc`, `.npmrc`, `tsconfig.json`, the Vite/Vitest/Playwright configs, anything under `.github/workflows/`, `scripts/ci-scope.sh`, and the rule-version files `src/sim/*config.ts`.

`scripts/ci-scope.sh` makes the decision from the PR's own diff (GitHub's merge commit against its base parent) and prints the changed files in the `unit` log. The main push runs Tier 1 only: the PR already ran Tiers 2/3 for the same change, and Vercel deploys main independently (D-026).

## Check names and gates

`core` and `browser` remain the aggregate checks. Each requires `unit` to succeed, and requires its integration job to **succeed when the scope says it was needed** and to be skipped otherwise, so a mis-skipped job cannot go green. In Tier 3, `core` also downloads every partition report and runs the unchanged coverage verifier. Matrix fail-fast stays off. The default branch has no branch protection today; if required checks are added later, require `core` and `browser` only, since they always report.

## Running full regression

- **On a PR:** add the label `full-regression`. The run restarts in full mode and every later push stays full until the label is removed. Other labels do not restart or cancel CI.
- **On any branch or commit:** Actions, then *Full regression*, then *Run workflow*. Pick the branch under "Use workflow from", and optionally pin a commit SHA. The `unit` log prints the exact commit verified.
- **Required before merging:** simulation rule or rule-version changes, save-format changes, dependency or toolchain updates (automatic), and milestone or release merges.

## Cost controls

- One run per PR or branch; a newer commit cancels the older run (`concurrency`).
- Feature branches are not built on push; the PR run covers them.
- Battery partitions share one runner per job (3 jobs instead of 8 in Tier 3; 1 job in Tier 2), removing repeated checkout, Node setup and `npm ci`.
- Every job has a `timeout-minutes` cap. Report artifacts are kept 3 days.
- Gate jobs stay on `ubuntu-latest`. They finish in seconds and bill one minute either way, and a `ubuntu-slim` label the account cannot provision would leave a gate pending.

## Local commands

`npm run check` remains the complete local suite, including all 100 seeds in both batteries. `npm run test:browser` runs all three engines. To reproduce CI partitions: `bash scripts/ci-battery.sh settlement:1 living:1` (or `settlement:all`), then `node scripts/verify-seed-battery.mjs test-results --living` once all eight numbered partitions exist.

# History: complete verification with shorter GitHub checks

The 2026-10-11 continuation asks for shorter GitHub checks while keeping the story generator safely working. The preceding exact-main run [38103583238](https://github.com/DdraigFawr13/Story-Generator/actions/runs/38103583238) took 18 minutes 14 seconds from creation to completion. Core occupied about 10 minutes; browser verification occupied about 18 minutes, including 78 seconds installing all three engines.

## Preserved coverage and gates

- Every ordinary unit test, formatting, strict type checking, source boundaries, production build and both independent Python probes still run on every PR and main push.
- The original 100 terrain seeds still advance through the same complete 1,000-week assertions, winter observations, validation and canonical digests. Four separate runners each execute 25 seeds; there is no reduced seed sample or shortened history.
- [I.6](PHASE2_LONG_RUN.md) adds the same 100 seeds under the individual P2 rules, complete save restoration and 12-week continuation. Four additional runners each cover 25 named worlds in parallel with the original battery; core requires complete separate P1/P2 report coverage.
- The `core` check requires successful ordinary-unit and all eight seed-battery jobs, then downloads all eight current-run reports. Each version independently rejects missing/duplicate partitions, missing/extra/wrong seeds, wrong rule version or tick count, malformed digests and duplicate canonical results across partitions. The P2 reports also require complete 12-week continuation evidence. Uploading a missing report fails its job.
- Every browser case still runs in Chromium, Firefox and WebKit. Each engine has its own runner, installs only its engine, and uses two workers across files. Tests within each file retain their existing sequential order and independent browser contexts. `fullyParallel`, timeouts and retry policy are unchanged.
- The existing `core` and `browser` check names remain aggregate gates. Both use `always()` and explicitly require successful dependencies, so failed, skipped or cancelled partitions cannot produce a green aggregate check. Matrix fail-fast is disabled so another failure does not hide coverage.
- Actions are pinned to commit SHAs. Permissions, PR/main triggers, concurrency cancellation, dependency/runtime pins and main-only Vercel deployment rules remain unchanged. No path-based skipping is introduced.

## Local commands

`npm run check` remains the full local suite, including all 100 seeds without shard settings. `npm run test:browser` remains all three engines. The seed battery moved into its own test file; its assertions and original seed order are preserved.

To reproduce one CI partition:

```sh
mkdir -p test-results
STORY_GENERATOR_BATTERY_SHARD=1/4 \
  STORY_GENERATOR_REPORT=test-results/seed-battery-1.json \
  npm test -- tests/unit/settlement-seed-battery.test.ts
npm run test:browser -- --project=chromium --workers=2
```

Repeat the seed command for 2/4, 3/4 and 4/4, then run `node scripts/verify-seed-battery.mjs test-results`. For both versions, follow the additional [individual battery commands](PHASE2_LONG_RUN.md) and pass `--living` with all eight reports. Invalid shard settings fail instead of silently reducing coverage. Five focused partition/gate tests exercise complete uneven partitions, all 100 one-seed partitions, invalid settings, missing/duplicate/truncated reports, changed contracts, cross-partition digest collisions, independent P2 coverage and the actual Node CLI's continuation/report rejection.

## Measurement and limits

[PR #31](https://github.com/DdraigFawr13/Story-Generator/pull/31) merged at main `94409355b58719f17ca1c7fe3609e4216d3c29bf`. Its final-head [run 38106617044](https://github.com/DdraigFawr13/Story-Generator/actions/runs/38106617044) passed 177 ordinary core cases, all four complete seed partitions, aggregate proof of all 100 original seeds/digests and all 225 browser cases, without reported failures/flaky cases. The full workflow took **7 minutes 14 seconds**, compared with **18 minutes 14 seconds** on preceding main: **60.3% shorter elapsed time**. The PR records local checks and exact-main READY/live save/reading/reload parity with no browser errors. This is one measured comparison, not a guaranteed runtime. Parallel runners shorten elapsed time but consume more concurrent runner slots; setup and aggregate gates can increase total billed runner time. Account concurrency limits and queueing can reduce the benefit. This change does not claim a fixed runtime or eliminate browser retries as a policy; actual failed/flaky results must still be reported.

[PR #33](https://github.com/DdraigFawr13/Story-Generator/pull/33) adds the complete P2 battery and merged at `6be76b2`. Its final-head [run 38108823366](https://github.com/DdraigFawr13/Story-Generator/actions/runs/38108823366) passed 184 ordinary cases in 18 files, all eight complete P1/P2 partitions and all 249 browser cases without reported failures/flaky cases. The workflow took **8 minutes 41 seconds**, **52.4% shorter** than the 18m14s baseline despite adding 100 complete individual histories and saved continuation. Individual partitions finished before browsers; observed browser runtime varied. All eight downloaded artifact ZIP hashes matched their GitHub digests, and complete hosted P1/P2 outcomes matched the unpartitioned local runs, excluding timing. Exact-main READY/live bookmark/save/reading confirmation is recorded in the PR. These are measured observations, not a promised runtime.

Simulation rules and all supported world/save versions are unchanged by these verification milestones. Art, physical-device and human experience acceptance remain open.

## Reload readiness follow-up

[PR #34](https://github.com/DdraigFawr13/Story-Generator/pull/34) passed all required final-head gates in 9m10s with the factual biography increment: 187 ordinary cases, both complete seed batteries and 252 browser cases. Its WebKit quota-denied bookmark case passed on the existing retry after timing out on Resume following reload; this is one reported flaky case, not a zero-flake run. The completed exact-main production reading/save verification is recorded in that PR.

The bookmark browser helper checked seed-input visibility immediately, before waiting for React's menu to mount. A false visibility result followed by an auto-waiting summary click can close the initially open fresh/resume menu instead of opening it. A controlled module-startup gate reproduced the same Resume timeout and closed-menu snapshot with the earlier helper. The follow-up waits for the actual mounted summary before checking the menu's state. The quota scenario resumes at the earliest committed navigation point while the application module is gated; it verifies the menu has not mounted, releases startup and completes the unchanged storage/save assertions. The gate is released and its route removed even on failure. No sleep determines the ordering.

The first follow-up run passed the gated bookmark case in all three engines, but WebKit retried a different existing same-seed persistence case. That case clicked asynchronous Resume and immediately edited the still-mounted old archive before waiting for accepted replacement; replacement correctly cleared its attempted selection. Both same-seed cases now wait for the initial resumed week 12 before editing the archive. Their original evidence, inspection-reset, paused-state and complete-save assertions remain intact. The first run's one retry is retained in the PR record; final-head results are recorded separately.

No arbitrary sleep, timeout increase, retry change, skipped case or smaller coverage sample is introduced. Application source, dependencies, workflow and all simulation/save contracts are unchanged. Targeted repeated cases with retries disabled and the complete final-head workflow are recorded in the follow-up PR, including actual failures/flaky outcomes. Exact-main tree/deployment/live confirmation remains required after its authorized merge.
