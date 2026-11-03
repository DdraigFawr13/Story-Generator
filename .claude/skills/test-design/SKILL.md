---
name: test-design
description: How to write, change and fix tests so they wait properly, can fail, don't pin one seed's accident, stay inside the project's time budget and don't hang in CI. Use when writing, changing, fixing or reviewing unit, golden or browser (Playwright) tests, when CI fails, hangs or runs slow, or when a check passes its time budget. Not for just running the tests.
---

# Test design

Browser (Playwright) tests also need [references/browser-tests.md](references/browser-tests.md): waits, locators, race-free reads and config.

Each item cites the lesson it comes from: `terra:14` is line 14 of project-terra's `docs/LESSONS.md`; `Vulcan`, `Story-Generator` and `controls-simulator` are the other projects. Rule ids such as VER-04 are in the shared rules.

## No hangs, same result in CI

- Set explicit per-test and per-run timeouts.
- Compare the local time with the last green CI step and keep a margin, because CI runners are slower (Vulcan:15).
- Free the test port and stop leftover preview servers before a run (Vulcan:54).
- Treat a run that never exits as a failure to root-cause, never one to retry (VER-04).

## Waits

- Wait for the state, never read it once (terra:14).
- Wait for the event, not a fixed count of days or skips (Vulcan:35, :46).
- Browser detail is in the reference, section "Waits".

## Prove a test can fail

- Make a fix's test fail before the fix (controls-simulator `docs/AUDIT.md:24`).
- Plant a bug once in equivalence and golden tests and see them fail (controls-simulator:16).
- When a test changes, restate what it proves; never widen it (Vulcan:34, VER-01).

## Properties, not one seed

- State the property, and search a seed list for a world that shows it (Vulcan:38).
- Compute expected digests at test time (Story-Generator:21).
- Cache by what the world is, not by file (Story-Generator:23).

## Time budgets

- Read the test time budgets in the project's AGENTS.md, and report the check time against them.
- Share one stepped world per file, and move slow tests to a slow tier (Vulcan:39, :48, :70).
- Keep whole-ledger reads out of step loops (Vulcan:76).

## Realistic data

- Load-test with a full session's data (terra:9).
- Time a long run after changing a hot loop, and profile before blaming CI (Vulcan:57, :73).
- Measure performance on a production build (VER-06).

## Goldens and random ids

- Run a golden test twice before committing it, and give fixtures fixed ids (controls-simulator:17).
- Keep random ids out of text searches (terra:10).
- When a fixture switches off one effect, switch off every effect it isn't testing (Vulcan:74).

## Keyboard

- Test dialogs with the keyboard as well as the mouse (controls-simulator:46).

## Before you push

- Run `node .claude/skills/test-design/scripts/test-traps.mjs` if the project's check doesn't already.
- Read every `warn test-traps` line (VER-03).
