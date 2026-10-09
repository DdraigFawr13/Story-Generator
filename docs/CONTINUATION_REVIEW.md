# Continuation review — 2026-10-09

**Status:** art treatment selected; mechanics/storage corrections proposed for acceptance. This review does not close the overall Phase 0 gate or claim a running game.

## Decisions carried forward

- D-013: TypeScript core, React/Vite, Canvas 2D, Node 24/npm, IndexedDB and Vitest/Playwright are accepted.
- D-014: the user selected **Illustrated Minimal**, option 2 of the final comparison. Do not reopen that selection.
- Phone studies now depict collapsed and expanded chronicle states. The expanded view retains visible map context and an explicit Back to map action.
- P1 remains one passive, aggregate settlement with local saves. Named-person inspection in the desktop study is a Phase 2 preview.

The selected desktop artifact is `exec-1b13e682-a379-4327-9b7a-988178c814f4.png`; phone artifacts are `exec-46c308c6-50ff-4b1a-86b6-94b06b77d511.png` (collapsed) and `exec-761edce1-fb4a-4fa4-a47d-3a56984720b6.png` (expanded). They are visible in the originating conversation and its workspace `generated_images/` directory, **not committed repository assets or public URLs**. Preserve/export these references before transferring visual implementation to another workspace.

## Mechanics review and proposed corrections

| Finding | Consequence | Resolution in proposal v1.1 |
| --- | --- | --- |
| All nine founding tiles had to be grass, non-forest and fertility ≥ 50 | The fallback would dominate under an independent-draw model; most centers/founder fields would match | Allow grass with forest, require only two fertile field tiles, record initial site clearing and discarded timber explicitly |
| Demographics could cite this tick's shortage transition | Phase 7 could point forward to a phase 8 event, conflicting with save validation | Record direct ration facts; allow only already-emitted lower-ID causes |
| “Reachable” forest was undefined | Implementers could disagree about pathfinding and water barriers | Explicit radius-based gathering; no intervening-terrain path test in P1 |
| Construction identity was not fixed at project start | Start/completion/harvest references could disagree | Allocate/register the entity at start; retain ID through completion/removal |
| Extinction left unfinished project treatment implicit | Resume could refund, delete or complete projects differently | Retain tile, ID, progress and escrow without work/refund |

Founding changes are **proposed**, not an unrequested claim of product approval. The fallback still exists for impossible terrain. Initial preparation is recorded at tick zero and does not permit free clearing during simulation.

The independent-tile geography gap is now addressed by the proposed [terrain contract](TERRAIN_CONTRACT.md) and its offline 100-seed probe. This supplies connected rivers and clustered woodland with exact deterministic rules. It does not establish production-engine equivalence or replicate the mockup's precise building layout and decorative paths.

## Quantitative checks performed

For the old founding rule, under the simplifying independent-uniform model:

- Qualifying tile probability: `p = 0.65 × 0.65 × (51/101) = 0.213341584...`.
- Interior centers: `62 × 38 = 2356`.
- Expected valid centers: `2356 × p^9 = 0.002157024...`.
- The union bound in that model gives fallback probability ≥ **99.784298%**. Overlap between candidate patches does not invalidate this model's union bound, but a deterministic finite-state PRNG is not a proof of independent draws. This is not a measured seed-battery result.
- Recalculated rule fixtures: normal spring **444 food**, drought spring **266 food**, winter-shortage health **85**, capacity fixture **776 food**. All agree with the proposal.

No gameplay balance, seed battery, browser or storage test has run. Arithmetic consistency does not prove interesting trajectories.

## Persistence review

Retain the proposed one-slot IndexedDB model: autosave every 20 committed ticks, minimum five seconds between automatic write starts, 30-second automatic failure backoff, 200 live headlines, 50,000 canonical events and 16 MiB canonical payload. These remain initial budgets requiring acceptance and measurement.

Clarifications in this change:

1. A lock held by another tab is not a missing locking API. The non-owner cannot fall through to an advancing unsaved world, even if the slot is empty/corrupt.
2. A queued manual save retains its clicked committed tick, with at most one queued manual capture. Older autosaves cannot overwrite newer successful captures. Pending UI prevents unbounded manual queues.
3. Architecture is already approved; only mechanics/storage policy and remaining visual checks are open.

The existing contract correctly separates candidate admission from browser quota, saves state/archive atomically, validates before replacing memory, reports success only after transaction completion, and preserves the prior save on failure.

## Phone interaction specification for the selected treatment

These are implementation requirements, not claims that a static image passes them.

- Map has a usable crop/zoom; do not shrink the full desktop scene into a phone viewport.
- Header exposes date, pause/play, step and speed; a labelled World menu exposes seed, New World, Save and Resume. Show saved-through tick/unsaved status without implying cloud storage.
- Chronicle opens by button as well as gesture. Expanded history scrolls independently; reading older records does not force-scroll on new entries.
- Selecting an event focuses its actual location above the sheet and displays canonical facts. Expanding/closing/scrolling never advances time or consumes RNG.
- Back to map collapses the sheet and restores focus to its opener. Escape closes an expanded sheet; closing the sheet does not deselect the event.
- Use a nonmodal sheet so visible map controls remain available. No focus trap or background inert state is implied. Keyboard order and explicit labels must work without drag or hover.
- Controls require at least 44 × 44 CSS px target areas. This is not established by generated-image dimensions.
- At 320/390 CSS px widths and enlarged text, wrap controls or move secondary items to the World menu; never shrink prose to force a fit. Include tablet/desktop coverage.
- Verify zoom controls, sheet reachability, map dragging versus sheet scrolling, and selected-location visibility with real browser interaction.
- Source sprite density and zoom thresholds remain to be measured. Reduce foliage/grass texture if it obscures object silhouettes while retaining the chosen Illustrated Minimal direction.

## Ordered implementation backlog after gate closure

| Slice | Deliverable | Evidence required before merge |
| --- | --- | --- |
| 1A | Strict TypeScript scaffold, CI, dependency boundaries, seed/clock/RNG, canonical encoder and headless runner | Exact supported versions; typecheck/boundary/build; golden RNG/encoding vectors; immutable candidate rejection |
| 1B | Deterministic geography and founders with an agreed terrain contract | No occupied water/forest; founder accounting; bounded fallback; stable IDs; same-seed digest |
| 1C | Labor, food/timber ledgers, construction, demographics and canonical events | Forced season/shortage/extinction fixtures; no forward causes; 100 seeds × 1,000 ticks; no seed-specific story scripts |
| 1D | One-slot local persistence and run controller | Resume vs uninterrupted equality; quota/abort/corruption; manual/automatic queue races; replacement and two-tab ownership |
| 1E | Selected-art map, responsive chronicle and inspector | Map/event/state agreement; keyboard/touch; actual-size phone tests; speed equivalence; browser digest checks |
| Milestone | First playable review | Ten-seed qualitative review; 10,000-tick benchmark or explicit measured limit; physical Android/Safari evidence when claiming support |

No production application, runtime dependencies or deployment is included here. The terrain follow-up adds only a standard-library Python design probe to make its proposed algorithm reproducible. Physical-device validation must be reported as unavailable if no physical device is accessible, never relabelled from browser emulation.

## Remaining gate, without repeating completed decisions

Art treatment and architecture are decided. The concrete outstanding items are mechanics/storage proposal acceptance, acceptance and TypeScript port verification of the now-specified terrain contract, source-density/actual-size visual checks and interaction evidence. Source documents still require the overall Phase 0 gate before app scaffolding. This change supplies reviewable corrections and a scoped backlog; it does not mark future verification complete.
