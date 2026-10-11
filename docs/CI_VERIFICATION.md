# Complete verification with shorter GitHub checks

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

Application source, simulation rules and all supported world/save versions are unchanged by this milestone. Art, physical-device and human experience acceptance remain open.
