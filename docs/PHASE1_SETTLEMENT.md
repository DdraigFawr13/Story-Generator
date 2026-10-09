# Weekly settlement engine — 2026-10-09

## Checkpoint and scope

PR #11 is merged at [27c8137](https://github.com/DdraigFawr13/Story-Generator/commit/27c813744256836d35503fd0f3fc75ca8773349a). The user's instruction to merge and continue is recorded in D-021. This slice implements continuation backlog **1C**, including the real headless weekly reducer, complete-tick admission, running-state validation and canonical events.

`p1-settlement-v1` uses schema 2 and an exact immutable configuration containing the latest weekly proposal's numbers. These are an engineering baseline, not final balance approval. The original `p1-foundation-v1` tick-zero format and all terrain golden vectors are preserved. The browser continues to show the founding preview; playback, headline rendering, local saves and selected-art integration remain next slices. No deployment or external runtime service is introduced.

## Behavior and APIs

- `createSettlement(seed)` initializes schema 2 with all RNG streams, allocators, entity registry, founding evidence and no last-tick ledger.
- `reduceSettlementWeek(snapshot)` is a pure candidate reducer for validated immutable input. It runs environment → opening reservations → production → food → health → construction/maintenance → demographics → transition evidence. It returns a complete validated candidate; callers must admit it before publication.
- `advanceSettlement(snapshot, count, limits)` validates the supplied snapshot directly and admits every full tick. `simulateSettlement(seed, count, limits)` is the seed convenience runner. Counts and limits are validated; a supported limit returns the unchanged last committed state plus the halt reason.
- `validateSettlementState(unknown)` checks versions/config, safe-integer bounds, river/occupancy, population/households/capacity, registry and creation references, event order/backward causes, weather/calendar, project escrow/progress, extinction and the latest labor/resource ledger. It never regenerates a running world from its seed. It is structural/accounting validation, not a full replay proof or an IndexedDB save adapter.

Opening population fixes demand and workforce for the whole tick. Field/foraging/repair/building/gathering reservations never overlap or get reassigned mid-tick. Maintenance and new construction use opening timber; new escrow is charged once. Construction begins in phase 2, completes in phase 6, and keeps its original entity ID. Completed fields begin work next week. Removed structures keep historical identities and creation references; storage loss cites the actual removal record.

Foraging and gathering retain the documented abstract renewable/radius-based behavior. Crops use fertility, recorded weather, seasonal multiplier and tended weeks with integer rounding. Each tick records exclusive labor and balanced food/timber/escrow. Death trials precede conditionally consumed survivor birth trials; birth draws are consumed even with no housing room. Extinction cites actual deaths, clears crop work, preserves unfinished escrow and never creates new founders. Later extinct-world weeks continue weather, decay and historical inspection without demographic draws.

Canonical captures still isolate caller-owned mutable data and freeze the result. Measured copying cost justified reusing validated **deeply** immutable map/history records and memoizing their derived encoding/checks with weak keys. A shallow freeze containing mutable children is never trusted. The cache changes neither encoded bytes nor admission thresholds; old canonical/terrain fixtures and new mutable-child/prototype/negative-zero regression checks cover that boundary.

## Verification

| Evidence | Result |
| --- | --- |
| Strict types, AST boundaries, formatting, production build | Passed; 20 production modules satisfy dependency/runtime boundaries |
| Fast core suites | 82 checks passed, including existing terrain/RNG/admission tests and 15 weekly-rule fixtures |
| 100-seed battery | Every fixed seed reached 1,000 weeks without invariant failure or count/byte halt; 100 distinct full-state digests |
| Real continuity | 137 uninterrupted weeks = validated JSON capture at 57 + 80; varied chunk sizes give the same complete state |
| Browser suites | 21 checks passed across Chromium 156, Firefox 157 and WebKit 27.2; three settlement seeds match Node state/event digests, all RNG states/allocators and captured continuation |
| Forced rules | Normal/drought spring 444/266 food; winter health 85; overflow then rations; opening material reservation; repeated repair planning; escrow/progress/completion; no same-week new-field harvest; decay/removal capacity loss; no-room birth draws; shortage recovery; extinction/unfinished-project retention; unsupported/corrupt state; whole-tick limit rollback |
| Extended natural run | RIVERSIDE reached 10,000 weeks under ordinary admission, retaining history after natural extinction at week 1,980; 2,438 events, 1,211,545 canonical payload bytes |

The 100-seed battery took 352.7 seconds in this managed workspace (including concurrent verification work). End-state payloads ranged from 237,410 to 687,000 bytes and archives from 430 to 767 events. The separate RIVERSIDE 10,000-week measurement took 80.9 seconds in this workspace, roughly 8.1 ms/week averaged over the run. These are desktop Node measurements; they do not establish physical-phone latency, heap peak, IndexedDB durability or installed Safari support. The same 10,000-week extinct-world invariant is also included in the automated long-run suite.

For browser environment accommodations, see the [foundation record](PHASE1_FOUNDATIONS.md). Standard hosted CI installs Playwright dependencies normally; no local container overrides enter repository configuration.

## Balance evidence, still requiring review

At week 1,000 all 100 seeds remain alive, with populations **28–77** and **no shortage transitions**. Some seeds build large food stores while using all available timber. The first ten results show variation in construction/storage, not evidence that the first session already has satisfying winter preparation:

| Seed | Population | Food | Buildings | Events |
| --- | ---: | ---: | ---: | ---: |
| RIVERSIDE | 39 | 9,350 | 38 | 480 |
| TERRAIN_000 | 47 | 16,447 | 59 | 569 |
| TERRAIN_001 | 40 | 21,622 | 69 | 560 |
| TERRAIN_002 | 52 | 34,245 | 105 | 662 |
| TERRAIN_003 | 40 | 26,166 | 85 | 632 |
| TERRAIN_004 | 39 | 16,478 | 56 | 510 |
| TERRAIN_005 | 32 | 666 | 13 | 440 |
| TERRAIN_006 | 44 | 19,229 | 64 | 545 |
| TERRAIN_007 | 48 | 26,341 | 84 | 608 |
| TERRAIN_008 | 32 | 5,021 | 24 | 466 |

The extended RIVERSIDE run has zero timber at week 1,000, later loses 33 structures to decay and reaches extinction at week 1,980 without a seed-specific script. It then retains its world/history to week 10,000. This is one natural decline witness, not a claim that every seed follows that trajectory or that the game should take that long to show adversity.

The forced P=4 fixture independently confirms the recovery problem: workforce 2 goes entirely to two fields; forage/repair/building/gathering all receive zero workers. With no food, health drops by 20 that week. Keep this and the abundant early reserves explicit when reviewing winter multipliers, labor priority, store-building pressure and finite timber. Any tuning must be versioned and rechecked across seeds; no dormant-winter, recovery reservation, regrowth or automatic rescue rule was silently introduced.

## Next work

Build continuation **1D: advancing controller and one-slot IndexedDB save/resume** using the complete schema 2 state, actual saved RNG/IDs/archive and direct validator. Verify interrupted writes, quota/corruption/unsupported versions, stale sessions, queued manual/autosaves, replacement and two-tab ownership. Review the 20-tick autosave proposal's five-minute loss window at the proposed normal speed before finalizing policy.

Then integrate a state-grounded headline renderer and full map/chronicle/inspector, paused-return scheduling and the selected visual references. Balance, actual-size readability, physical devices and full first-playable acceptance remain open. Named people, magic, regional expansion and observer nudges remain outside this slice.
