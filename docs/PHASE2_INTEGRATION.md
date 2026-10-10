# Phase 2 integration checkpoints

D-025 and D-030 authorize these scoped increments while the remaining P1 reviews stay open. Each increment ends with verification, a scoped squash merge, main-only deployment verification and an updated handoff.

## I.1 — Complete founding world and save foundation

The internal `p2-world-foundation-v1` world uses schema 3. It is deliberately tick-zero only; the advancing viewer remains P1 until I.2 and I.3 are ready. It cannot be passed to the P1 loader or reducer. This is a fresh-world factory, never a P1 save migration.

- Preserve the existing terrain, settlement endowment, building identities and P1 RNG results.
- Register all six households and 24 residents in the same contiguous entity registry, add their IDs to the actual founding record and consume the founder roster's returned allocator (41 for RIVERSIDE). Future buildings and people must use this allocator rather than collide with resident IDs.
- Persist household/home references, original names, traits, entry tick/age and creation record. Founders have no known birth record or parents. A future born resident can have a known birth record and age zero at entry; that does not retroactively create one for founders.
- Store the final independent resident RNG stream with the other streams. Population and household counts agree with the actual founding identities.
- Reuse the complete envelope/checksum/limit path for both formats, retaining the existing IndexedDB database, transaction and writer ownership contracts. Version-specific codecs reject each other's payloads. P2 save preparation/decoding is internal; it does not replace the current browser slot.
- Validate this founding-only version by exact canonical comparison. Do not use seed regeneration as validation for the evolving successor.

Validation covers deterministic identities/registry references, deep capture, complete JSON restoration, cross-version rejection, independently checksummed corrupt IDs/census/references/RNG/versions, unsafe age arithmetic and Node/three-engine full payload/checksum parity. Existing P1 save/session/browser coverage guards the shared envelope extraction.

## I.2 — Actual advancing individuals

Introduce a separate evolving rules version with direct running-state validation. Define exact update order, eligibility, food/health accounting, individual work assignment, demographic draws, real birth/death records, historic identity retention and household/home changes. Preserve P1 v1/v2 behavior. Verify long-run references, generational histories, immutable complete-week admission and uninterrupted versus saved continuation. Document numeric rules as an engineering baseline for experience review.

## I.3 — Observable personal history

Connect complete P2 worlds to New World, scheduling, local save/resume and the existing settlement/recap viewer. Show live and deceased resident facts, ages, household/home, health, actual work and linked birth/death evidence. Keep passive selection non-mutating and readable on phones. Ground personal prose in recorded history; do not infer marriages, parenthood or unrecorded earlier lives.

Partnership/guardianship, social memory and autonomous social decisions remain subsequent P2 slices. Spotlight families, budgets and commands still require the separate Q-005 contract. No new hosted service is needed for these increments.

## Current compact handoff

I.1 implementation and validation are in progress on `feat/resident-world-save`, based on main `1dfa235`. I.2 and I.3 are next; the public viewer still runs `p1-settlement-v2`. Update this checkpoint with actual merge/test/deployment evidence at milestone completion.
