# Phase 2 integration checkpoints

D-025 and D-030 authorize these scoped increments while the remaining P1 reviews stay open. Each increment ends with verification, a scoped squash merge, main-only deployment verification and an updated handoff.

## I.1 — Complete founding world and save foundation (implemented)

The internal `p2-world-foundation-v1` world uses schema 3. It is deliberately tick-zero only; the advancing viewer remains P1 until I.2 and I.3 are ready. It cannot be passed to the P1 loader or reducer. This is a fresh-world factory, never a P1 save migration.

- Preserve the existing terrain, settlement endowment, building identities and P1 RNG results.
- Register all six households and 24 residents in the same contiguous entity registry, add their IDs to the actual founding record and consume the founder roster's returned allocator (41 for RIVERSIDE). Future buildings and people must use this allocator rather than collide with resident IDs.
- Persist household/home references, original names, traits, entry tick/age and creation record. Founders have no known birth record or parents. A future born resident can have a known birth record and age zero at entry; that does not retroactively create one for founders.
- Store the final independent resident RNG stream with the other streams. Population and household counts agree with the actual founding identities.
- Reuse the complete envelope/checksum/limit path for both formats, retaining the existing IndexedDB database, transaction and writer ownership contracts. Version-specific codecs reject each other's payloads. P2 save preparation/decoding is internal; it does not replace the current browser slot.
- Validate this founding-only version by exact canonical comparison. Do not use seed regeneration as validation for the evolving successor.

Validation covers deterministic identities/registry references, deep capture, complete JSON restoration, cross-version rejection, independently checksummed corrupt IDs/census/references/RNG/versions, unsafe age arithmetic and Node/three-engine full payload/checksum parity. Existing P1 save/session/browser coverage guards the shared envelope extraction.

## I.2 — Actual advancing individuals (implemented internally)

Introduce a separate evolving rules version with direct running-state validation. Define exact update order, eligibility, food/health accounting, individual work assignment, demographic draws, real birth/death records, historic identity retention and household/home changes. Preserve P1 v1/v2 behavior. Verify long-run references, generational histories, immutable complete-week admission and uninterrupted versus saved continuation. Document numeric rules as an engineering baseline for experience review. [PHASE2_LIFE_RULES.md](PHASE2_LIFE_RULES.md) records the implemented `p2-settlement-v1` schema-3 policy, exact work/care, rations, health, birth spacing, demographics and housing order. Founding/birth identity facts, named work/home changes and identified death risk remain in the archive; one known parent never implies a complete genealogy. Permanent professions, partnerships, sickness and social decisions remain later work.

## I.3 — Observable personal history

Connect complete P2 worlds to New World, scheduling, local save/resume and the existing settlement/recap viewer. Show live and deceased resident facts, ages, household/home, health, actual work and linked birth/death evidence. Keep passive selection non-mutating and readable on phones. Ground personal prose in recorded history; do not infer marriages, parenthood or unrecorded earlier lives.

Partnership/guardianship, social memory and autonomous social decisions remain subsequent P2 slices. Spotlight families, budgets and commands still require the separate Q-005 contract. No new hosted service is needed for these increments.

## Current compact handoff

I.1 is implemented in [PR #27](https://github.com/DdraigFawr13/Story-Generator/pull/27), based on main `1dfa235`. Full local verification passed: 147 core tests in 13 files (562.18 seconds), 162 browser checks (54 each in Chromium, Firefox and WebKit), formatting, strict types, 35-module boundaries, production build, the independent 100-map terrain probe and all three resident identity vectors. The browser run includes P2 payload/checksum parity and the existing P1 local-save, recap, evidence and phone regressions. PR #27 merged at `4205a7f`; its exact final head `d5311e3` passed both GitHub core and browser jobs. Production deployment `dpl_FSPGF14Q68VxsqretsRAmMqq4K8W` is READY at that exact main SHA and owns the stable alias. Native Firefox verified HTTP 200, matching main assets, paused Resume at 49, year-one Node prose parity, actual UI Step/Save to 50, matching Node save digest and paused reload/Resume with zero browser errors. The merged remote/local work branch is deleted.

I.2 is implemented internally on `feat/resident-lives`, based on merged main `4205a7f`; I.3 follows. Full local regression verification passed 156 core tests in 14 files (612.75 seconds) and 165 browser checks (55 per Chromium, Firefox and WebKit). A final archive-reference review then added direct checks for historical home availability, death ration/home/care evidence and health accounting; all ten resident tests passed on that final code, including independently checksummed corruption of an older death record. Final strict types, 43-module boundaries, formatting and build passed; the relevant complete P2 save parity is rechecked in all three engines. GitHub CI verifies the exact final PR head before merge. The PR records merge/deployment evidence; the public viewer remains P1 until I.3, and all P1 acceptance gaps stay open. Preserve the founding-only codec and both original P1 versions.
