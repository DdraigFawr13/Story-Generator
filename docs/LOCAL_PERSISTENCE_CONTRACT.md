# P1 local persistence contract — proposal v1

**Status: implemented engineering baseline under D-022; final storage-policy/device acceptance remains open.** D-012 approves local save/resume and D-013 accepts IndexedDB. The adapter/controller implement the budgets below without changing canonical simulation rules. See [PHASE1_PLAYBACK.md](PHASE1_PLAYBACK.md) for tests and remaining measurements.

Related: [plan review](PLAN_REVIEW.md), [accepted architecture](ARCHITECTURE_REVIEW.md), [implementation plan](IMPLEMENTATION_PLAN.md), [decision register](DECISIONS.md).

## Scope and ownership

One browser-local world slot, manual Save, explicit Resume, and autosave. IndexedDB is the accepted adapter under D-013/ADR-003; the budgets and policies here remain proposed. The simulation supplies complete immutable committed-tick snapshots; the adapter owns transactions and operational save status. Storage operations never advance time, consume simulation RNG, or change canonical events.

A saved chronicle is evidence, not a mutation log. Resumption restores full authoritative state. Historical seeking, migrations, multiple named worlds, exports and cloud accounts remain outside P1.

## Proposed budgets

| Setting | Initial proposal | Exact meaning |
| --- | --- | --- |
| Autosave interval | 20 committed ticks | Request a snapshot when current tick minus last successfully saved tick reaches 20 |
| Wall-clock throttle | 5 seconds | Minimum between automatic write starts; use an adapter monotonic clock, outside canonical state |
| Retry after automatic failure | 30 seconds | No repeated write loop; manual Save may retry immediately |
| Live chronicle window | 200 headlines | Presentation only; filtering/grouping does not remove canonical records |
| Canonical archive | 50,000 events | Inclusive maximum; never evict old events |
| Complete save payload | 16 MiB (16,777,216 bytes) | UTF-8 bytes of canonical JSON payload, excluding envelope and IndexedDB metadata |
| Supported-run validation horizon | 10,000 ticks | Required benchmark fixture, not a forced stop or unlimited-history promise |
| Proposed target browsers | Current stable Chromium, Firefox and Safari; Android Chrome | Record exact tested versions and physical phone model at acceptance |

These are starting budgets, not measured capacity guarantees. An archive can reach its limit before the validation horizon. Browser quota may also be lower than the payload budget. Final approval should use measured results when implementation is authorized.

Review cadence against D-015's 10–15-minute/year target. With the proposed 48-week calendar, 20 ticks represent roughly 4 minutes 10 seconds–6 minutes 15 seconds of active 1x viewing; the five-second throttle is only a minimum write interval, not a five-second save guarantee. The proposed 15-second tick in ADR-002 makes that interval five minutes. Decide whether this loss window is acceptable before approving Q-006; no cadence change is approved here.

## Payload and envelope

The payload contains schemaVersion, simulationVersion, rulesVersion, seed, complete configuration, committed tick, authoritative world state, every named RNG stream and its algorithm/version/state, ID allocators, and the full canonical event archive. World state includes terrain, resources, aggregate population/households, buildings and work in progress, rule accumulators/counters, and historical identities/locations needed to resolve archived references.

Implementation of each rule must enumerate its saved fields. No hidden module/global state is allowed. Do not reconstruct omitted rule state from prose, initial seed, UI state or wall time.

P1 has no authoritative observer commands. P2 must explicitly extend the versioned payload for ordered commands, active Spotlights and replay cursor; do not claim P1 snapshots support that feature.

The envelope contains:
- envelopeVersion;
- payload;
- SHA-256 digest of canonical payload bytes;
- operational metadata: save timestamp, world-session identifier and save generation.

Operational metadata is excluded from the canonical simulation digest. The session identifier is adapter bookkeeping, never a simulation entity ID. The checksum detects accidental damage; it is not an authenticity or security guarantee.

Proposed canonical encoding: UTF-8 JSON without whitespace; object keys recursively sorted by code-unit order; arrays retain contractual order; event arrays follow event ID allocation order; entity collections sort by numeric ID. Accept only safe integers, booleans, null, strings and those arrays/objects; reject undefined, nonfinite values and duplicate IDs. Normalize negative zero to zero. Seed and text normalization must be finalized in the determinism contract, not silently inferred by the storage adapter.

## Saving and transaction boundaries

1. Capture an immutable snapshot at a committed tick boundary, including its complete archive and allocator/RNG state.
2. Validate invariants and supported versions; serialize, measure bytes and compute the digest before opening the IndexedDB transaction.
3. Use one read-write transaction on a single slot record to replace the entire envelope. Do not delete the old record first, or split state and archive across independent transactions.
4. Report Saved only after transaction completion. An individual request's success is insufficient.
5. Record the saved tick/session/generation only on completion. If the world has advanced since capture, show both saved tick and current tick as appropriate.

Only one write is in flight. Coalesce pending automatic requests into the newest snapshot, while retaining a pending manual-save request. A manual request captures its committed tick when clicked, even if queued behind a write. Retain at most one queued manual capture; while it is queued/in flight, expose that pending status and disable duplicate manual requests. Drop older pending autosaves when a newer manual capture supersedes them; an older capture must never overwrite a newer successfully saved tick in the same session. Session changes follow the rules below. Writes from an old world session must finish or abort before starting a new world session; discard their pending requests. A completion from an old session cannot mark a new world saved.

Use an exclusive same-origin writer lock for the application lifetime (proposed Web Locks API). A second tab opens as a read-only viewer of the saved slot and cannot advance or save until it acquires the lock and reloads the current slot. A held lock is different from an unavailable locking API: a tab refused ownership must not fall through into unsaved simulation mode. If the slot is empty or invalid, the non-owner shows an empty/error view and still cannot create an advancing world. On acquiring ownership with an empty slot, it may offer New World; with an invalid slot, retain the record and require the explicit replacement choice. If exclusive locking is unavailable, disable persistence and explain that limitation; do not risk two writers overwriting one another.

## Autosave and replacement behavior

- The 20-tick trigger is measured from the last successful save, not the last attempt. If throttled, retain one pending request. Pausing with such a request does not discard it.
- Manual Save bypasses the automatic throttle and snapshots the current committed tick.
- New World creates an unsaved in-memory candidate. If a slot exists, keep autosave for the candidate disabled until the user explicitly chooses to replace that saved world. Explain that the slot holds only one world.
- The old slot remains intact until the replacement transaction completes. If replacement fails, the candidate remains in memory and the old save remains resumable.
- With no existing slot, creating a world may enqueue an initial tick-zero save.
- On reload, offer Resume with saved tick/date. Do not automatically replace the slot by constructing a default world. Resume restores into paused state; explicit Play starts scheduling. Closed/backgrounded elapsed time adds no ticks (D-018/ADR-002).
- Saving paused or extinct worlds is valid. Closing a tab is not a reliable save trigger; show unsaved progress and do not promise an unload write succeeds.

## Loading and validation

Read the envelope into a candidate without changing the running world. Check envelope/schema/simulation/rules versions, payload size, checksum, required field types, safe numeric ranges, unique IDs, allocator continuity, RNG shape, resource/population invariants, map/occupancy consistency, and event/reference integrity.

Events must have legal ordering and ticks no greater than the snapshot tick. Cause references must resolve to earlier archived events; entity references must resolve to living or historical records. Validate configuration against the matching rule version.

Only after all checks pass may the controller atomically replace the in-memory world and start a new adapter session. Loading never silently repairs, discards or migrates data. Unsupported and corrupt saves remain stored for a future recovery decision. A failed load leaves an existing in-memory world untouched.

## Archive and payload limits

Calculate candidate tick state and events without committing them. Admit the tick only if the resulting canonical archive has at most 50,000 events and the complete canonical payload has at most 16 MiB. At exactly either maximum, a tick is admissible if it does not exceed the other limit.

If admission fails, roll back all candidate changes, including RNG, IDs and events. Retain the previous committed tick and pause advancement with a visible history-limit explanation. Do not truncate records, partially commit a tick, or fabricate a canonical limit event. Inspection and saving the last admitted state remain available.

The byte-counting implementation may cache exact canonical segment lengths but must match full serialization in fixtures. Approximate memory size cannot decide admission. Benchmark this requirement: if too costly, revise the proposal before shipping rather than silently skipping enforcement.

The 10,000-tick validation horizon is not a simulation rule. Runs may continue beyond it until a declared event/payload limit; UI must not imply validated unlimited duration.

## Failure behavior

| Failure | Required behavior |
| --- | --- |
| Storage unavailable or blocked | Permit explicit unsaved play; show persistence unavailable; never label progress saved |
| Quota or transaction abort | Preserve the previous slot; retain current in-memory world; show failed save and its last successfully saved tick |
| Tab/process ends during write | On reopening, accept either the old complete envelope or the new complete envelope; never a mixture |
| Unsupported or corrupt stored payload | Keep the record, reject Resume, explain why; replacement requires an explicit New World replacement choice |
| Archive/payload budget exceeded by next tick | Reject the whole candidate tick and pause at the previous committed tick |
| Writer lock held elsewhere | Read-only saved-world view; reacquire lock and reload before enabling simulation/saving |

A transient storage failure does not automatically stop a valid simulation. Display unsaved progress continuously, retry only under the backoff policy, and retain manual Save. IndexedDB transaction atomicity does not guarantee protection from browser eviction, user clearing site data or device loss; describe saves as local to this browser.

## Worked acceptance scenarios

1. **Continuity:** uninterrupted 137 ticks equals save at tick 57, reload, then 80 ticks, for canonical state/events, RNG and allocators. Repeat at season/construction/demographic boundaries once mechanics are specified.
2. **Snapshot race:** capture tick 40 and finish the write while the simulation is at tick 43. Status says saved through 40; it must not say 43.
3. **Quota:** existing slot tick 40, candidate save tick 60 aborts. Reload yields tick 40. Current memory may still be at 60 and is visibly unsaved.
4. **Limit:** 49,999 events plus two candidate events exceeds the archive bound. The candidate tick, both records and RNG/ID changes are discarded; prior tick remains inspectable/saveable. Exactly 50,000 events is permitted if bytes fit.
5. **World replacement:** world A is saved; world B is created. Until replacement is chosen, neither autosave nor a stale queued write replaces A. An unsuccessful replacement still resumes A.
6. **Integrity:** alter a stored resource or remove a referenced event. Reject both checksum failures and independently checksummed but structurally invalid fixtures without changing the current world.
7. **Concurrency:** tab A holds the writer lock; tab B cannot advance/save. After takeover, B reloads the slot before continuing.
8. **Throttling:** 20 ticks elapse before five seconds; exactly one request remains pending. Failed autosaves observe 30-second backoff; manual retry is immediate.
9. **Byte boundary:** test ASCII and multibyte text just below, at and above 16 MiB. Payload byte count, not JavaScript string length, determines admission.
10. **Extinction:** save a zero-population world, resume and step according to its mechanics contract; no new founders or unsolicited reset.

## Evidence and remaining decisions

The implemented adapter passes complete-state resume, real IndexedDB abort-after-request-success rollback, injected quota failure, corrupt/unsupported data, replacement and two-tab handoff checks. The save queue also passes clicked-tick capture, coalescing, throttle/backoff and session barriers. Injected quota errors do not measure actual quota capacity; browser transactions do not guarantee crash/eviction durability. Real desktop IndexedDB measurements at 1,000/10,000 weeks and one controlled Chromium process-crash point now supplement those checks. Physical Android/installed Safari and isolated peak-memory evidence remain required. See [PHASE1_PLAYBACK.md](PHASE1_PLAYBACK.md).

Review Q-006 against the table and replacement/concurrency behavior. Weekly balance acceptance (Q-004), storage-policy acceptance (Q-006) and selected-art validation remain carried first-playable requirements. Architecture (Q-003) is accepted under D-013 and scaffolding authorized under D-020; ASCII seeds and named-stream determinism are implemented in the foundation baseline. The proposed autosave cadence has not become final policy by being documented.
