# Proposed technical contract — P1 foundations

**Status: PROPOSED, 2026-10-09 UTC.** Basic local save/resume is approved scope (D-012); every technology, algorithm and budget below is a recommendation awaiting the existing architecture review. This document does not authorize scaffolding or close Phase 0. No implementation, benchmark or browser validation has occurred.

This supplies concrete defaults for [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) and the technical items in [PLAN_REVIEW.md](PLAN_REVIEW.md). Product pace, narrative emphasis and device priority remain separate decisions; technical trivia need not become additional user questions.

## ADR-T01 — Browser application and toolchain (proposed)

| Concern | Recommended decision | Reason / boundary |
| --- | --- | --- |
| Runtime | Node.js 24 LTS, latest supported security patch at scaffolding | Pin the exact patch in the runtime file and CI; verify tool compatibility then |
| Package manager | npm bundled with the selected Node release | Pin its exact version, commit one package-lock.json, use npm ci in CI |
| Application | Strict TypeScript, React and Vite | DOM controls/chronicle; framework-independent engine |
| Rendering | Canvas 2D with nearest-neighbor assets | Read-only view models; no renderer-owned authoritative state |
| Tests | Vitest for core/adapters; Playwright for browser flows | Manual physical-phone checks complement emulation |
| Storage | Native IndexedDB behind a small typed adapter | One recoverable world slot; no hosted dependencies |

Choose current stable compatible package versions during scaffold preparation, record exact direct versions and review the lockfile. Do not guess future APIs or automatically adopt major upgrades. Keep one application package with separate core, persistence, formatting and UI modules; no monorepo framework is needed initially.

The core accepts plain data and explicit commands, returns state/events, and imports no browser, React, clock or network APIs. Presentation state remains outside saves of authoritative state. Upgrade simulationVersion whenever an algorithm, rule or configuration interpretation changes canonical outcomes; saveSchemaVersion separately identifies the storage shape. Dependency changes require deterministic regression checks.

Workers, PixiJS and backend services are deferred until measurements show a concrete need. Deployment remains a separate milestone action.

## ADR-T02 — Reproducible execution (proposed)

- A run is identified by canonical seed, complete initial config and simulationVersion; from P2 include the ordered authoritative command history. A target tick identifies how far to reproduce it.
- Seed text uses Unicode NFC, preserves case and whitespace, and is limited to 128 Unicode scalar values. Reject invalid/empty input visibly rather than silently rewriting it. Store/display the canonical seed. Random-seed generation uses browser cryptographic randomness outside the engine, then follows the same seeded path.
- Use **xoshiro128\*\*** with four unsigned 32-bit state words and a recorded algorithm identifier. Pin the published algorithm and add known-answer vectors before use; this is simulation randomness, not security randomness.
- Derive each named stream from SHA-256 of UTF-8 canonical JSON containing `[simulationVersion, canonicalSeed, streamName]`; take the first four unsigned 32-bit words in big-endian order. Map an all-zero state to `[1,0,0,0]`. Derivation occurs before execution through an injected initializer; the core has no asynchronous crypto/browser dependency.
- Freeze initial stream identifiers as `terrain`, `weather`, `mortality` and `birth`, matching PHASE1_RULES.md; add others only when a rule requires them. Store every stream state. Each rule declares when draws occur; bounded integer choices use rejection sampling rather than modulo bias. Visual variants never consume these streams.
- Ticks and entity/event counters are nonnegative safe integers. Allocate IDs monotonically, never reuse them, and retain historical identity/location records after removal. Cross-world links include run identity; random save-slot identifiers are not canonical simulation IDs.
- Use integer base units and rule-specific fixed-point scales. Every multiplication must remain within the safe-integer range; specify division rounding and resource bounds per rule. Reject non-finite values and overflow. Avoid transcendental functions and floating-point probabilities in authoritative rules.
- Execute explicit phases and iterate entities by ascending numeric ID, tiles by row then column. Resolve simultaneous eligible choices with documented priorities then stable IDs; do not depend on object insertion order or locale collation. Rules define whether a phase reads its opening state or committed earlier effects.
- Events are immutable facts with IDs, tick, within-tick sequence, actor/place IDs, causes, effects and importance. Sequence reflects committed rule order; formatting/grouping cannot alter records. References resolve through current or historical identities.
- From P2, commands have target tick and monotonic sequence. Apply them at the start of that tick in sequence order; reject past commands. Save active Spotlight state, commands and the applied-command cursor. Playback uses the same boundary, including multiple commands on one tick.

**Canonical representation:** UTF-8 JSON with object keys sorted by Unicode code point, schema-defined array order, finite safe-integer numbers and no undefined/Map/Set values. Canonicalize negative zero to zero; JSON string escaping follows the specified serializer fixture. Store a SHA-256 digest of canonical state and a separate ordered-event digest. Exclude timestamps, storage metadata, camera, animation, filters and formatted prose. Cross-runtime fixtures validate the serializer itself.

Resume restores a complete state; it does not infer state from chronicle text/events. P5 seeking restores a compatible checkpoint then executes ticks with recorded commands. Unsupported simulation versions are rejected in P1; migrations and historical engine compatibility are P5 decisions, not implied guarantees.

## ADR-T03 — One local recoverable world (proposed)

**Snapshot contents:** schema/simulation/PRNG versions, canonical seed and initial/current config, tick, terrain and all authoritative entities/resources, all RNG words, allocator counters, and historical identity records. Include canonical archive metadata and digest. Extend in P2 with command history, active Spotlight state and cursor. UI preferences may be stored separately and cannot affect resume outcomes.

1. Capture only a complete tick boundary. Build and validate the immutable snapshot and new archive records before opening the IndexedDB write transaction; hashing must not leave a transaction waiting on unrelated asynchronous work.
2. Store snapshots, immutable archive records and slot metadata in one database. Commit new archive records, snapshot and the current-generation pointer in a single read/write transaction spanning their stores. Never announce success before transaction completion.
3. Keep current and previous committed snapshot generations for recovery; archive records are shared by event ID within the run. Each snapshot identifies its exact event range, count and digest. New World creates a separate run namespace; preserve the previous world until replacement commits successfully. Warn before replacing the sole slot; autosave must not bypass that choice.
4. Delete obsolete generations/archive data only in a later transaction after successful commit, retaining everything referenced by current/previous generations. A failed write or cleanup keeps the last committed save valid; account for temporary duplicate generations in storage budgets.
5. On load, validate versions, shape, bounds, references, archive count/digest and snapshot digest before replacing the running world. If current data fails validation, offer the validated previous generation; otherwise report failure without deleting evidence. Digests detect accidental corruption, not malicious tampering.
6. Serialize save requests and coalesce autosaves; prevent an older completion from replacing newer progress. Use generation compare-and-swap inside the write transaction to reject stale writers from another tab and explain the conflict. No cross-tab merging.

**Cadence:** manual save plus autosave after 30 seconds of active wall-clock play when the tick has changed; also request save on explicit pause. Scheduler timing is outside the engine and never advances ticks. Treat page-hide saves as best effort; do not promise an unload handler can finish. Show last successfully saved tick and unsaved status.

**Candidate limits:** 200 live headlines; 50,000 canonical events or 32 MiB of canonical UTF-8 archive bytes, whichever comes first; 8 MiB per authoritative snapshot; 96 MiB total estimated application storage including two generations, retained records and write headroom. Browser quota can be lower. These are proposed ceilings, not measured capacity or guaranteed years of history.

At a configured archive/snapshot limit, reject the next tick commit that would exceed it, retain the complete preceding state/events/RNG, pause advancement and explain the limit. Do not silently discard causal evidence or partially commit a tick. Limit checks cannot consume additional RNG or change accepted-tick results.

On quota failure or unavailable storage, keep the last valid save, mark newer progress unsaved and pause with a retry action. If the user elects to continue in memory, explain that reload may lose progress; configured history limits still apply. IndexedDB storage can be cleared or evicted by the browser/user: local persistence is not a backup. No P1 cloud sync/export commitment follows from this contract.

## Proposed acceptance and measurement budgets

All values below are initial targets to validate and revise with evidence after implementation authorization. No claim is made that they currently pass. Device priority affects the final reference hardware; record physical device, OS, browser, build and seed alongside results.

| Area | Initial acceptance / target |
| --- | --- |
| Determinism | Equal state/event digests at 1, 100 and 1,000 ticks in Node and supported browsers; 100-seed non-crash battery |
| Continuity | Save at N, restore, run M; equal state/events/RNG/IDs to uninterrupted N+M, including season boundaries and extinction |
| P2 continuity | Same comparison around Spotlight activation/deactivation and multiple same-tick commands |
| Persistence | Reload, interrupted write, corrupt/unsupported save, quota/unavailable storage, stale-tab writer, New World replacement and recovery fixtures |
| Initial browser matrix | Current stable desktop Chromium/Firefox/WebKit automation plus physical Android Chrome; physical iOS Safari if device priorities include iPhone |
| Core responsiveness | At 64×40 candidate map, p95 tick ≤5 ms on selected reference phone; simulation work yields after ≤8 ms per task |
| Viewer responsiveness | Target 30 fps on reference phone, p95 interaction response ≤100 ms; rendering may skip frames, simulation may not skip ticks |
| Saving | Target p95 completion ≤1 second at supported archive ceiling; no save-induced main-thread task >50 ms |
| Memory | Candidate total JS heap ceiling 128 MiB in long-run profiling where tooling supports measurement; also inspect physical-phone memory pressure |
| History horizon | Stress 10,000 ticks and separately test archive ceilings; convert ticks to years only after the mechanics contract fixes time units |

Test wall-clock scheduling separately from deterministic tick progression: play/speed/selection, save cadence and viewport changes must not alter equal-tick outcomes. The user confirmed pause while closed/backgrounded: hidden tabs pause scheduling at the next complete tick, discard wall-clock scheduling debt and request a best-effort save. Return visibly paused and require Play to resume; never advance offline elapsed time or catch up a hidden interval. If target speed cannot be sustained, show actual throughput rather than dropping simulation ticks.

The first engineering PR should freeze PRNG/serialization vectors and version identifiers with the seed/clock skeleton. Subsequent increments add mechanics fixtures and storage continuity before the integrated viewer. Record architecture acceptance separately from still-open visual, mechanics and product decisions.
