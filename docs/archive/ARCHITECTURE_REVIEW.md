# Phase 0.7 — Architecture proposal and decision checklist

**Status: architecture accepted by the user on 2026-10-09 (D-013).** Written after Direction C was selected. No code has been scaffolded or deployed. Avoid dependency-version or API assumptions until implementation.

## Accepted decision records

Review [ADR-001–003](adr/README.md) for concrete proposals on the build/core boundary, rendering/controller, and persistence/test architecture. They propose Node 24 LTS with npm, explain headless history-limit admission, and define browser capability and cross-engine evidence requirements. The repository owner accepted all three records on 2026-10-09; Phase 0.7 is complete. Visual and mechanics/storage gates remain open.

The numeric [settlement rules](SETTLEMENT_RULES.md) and [local persistence contract](LOCAL_PERSISTENCE_CONTRACT.md) are now documented proposals. Review those separately for Phase 0.8; merged documentation does not establish tested balance or close a gate.

## Recommendation

A **browser-first TypeScript app with a pure deterministic simulation engine**, built and tested independently of the UI. Use a simple top-down HTML Canvas 2D renderer to begin, and introduce PixiJS only when measured scale, sprite batching and scene management justify it. UI overlays and the chronicle are normal HTML, not drawn as pixel text inside the canvas.

### Candidate technologies and rationale

| Concern | Phase 1 candidate | Reason | Future decision |
| --- | --- | --- | --- |
| App language | TypeScript (strict) | One language across core and viewer, explicit data contracts | Keep core framework agnostic |
| Project build | Vite | Small browser-first build, straightforward dev loop | npm proposed in ADR-001; pin compatible versions at approved scaffold time |
| UI | React | State-driven timeline/inspector/panels, practical responsive components | Confirm UI needs justify dependency |
| Pixel-world rendering | **Canvas 2D** initially | Few tile types/sprites, simple nearest-neighbor draw and selection | Consider PixiJS if perf/profiling warrants |
| Core engine | Pure TS modules, fixed-tick state transitions | Headless reproducibility and isolation from frame rate | Optional worker isolation |
| State/view bridge | Typed snapshots + event stream | UI can rerender without modifying simulation | Add snapshot thinning as world scale grows |
| Unit/property tests | Vitest | Fast logic tests for RNG, rules, invariants and chronology | Add longer regression seed battery |
| Browser smoke tests | Playwright | Validate controls/layout on phone and desktop viewport emulation | Include manual physical device checks |
| Persistence | IndexedDB basic local save/resume in P1; complete versioned state + archive | Preserve a settlement between sessions; independent of UI state | P5 adds multiple named worlds, migrations and timeline seeking |
| Hosting | Static site / Vercel at demonstrable milestone | Simulation runs client-side; no mandatory backend | Measure bundle/load size and mobile memory |

The accepted records govern the architecture choices. Packages have not been installed and the app has not been tested or deployed.

## Architecture boundaries

```text
                      App shell / controls
                     (UI framework, DOM)
                              |
                 typed read-only view models
                              v
              Chronicle UI / Inspector UI
                         ^           ^
                         |           |
            Canvas world renderer    |
                         ^           |
                         |           |
                 selected entity IDs |
                         |           |
                         +-----------+
                              |
                     snapshot + events
                              ^
                              |
                      SIMULATION CORE
         seed/config -> fixed clock -> systems -> state
                                    -> canonical events
            seeded RNG streams / version / invariants
                              |
                       save/replay seam
```

Boundary rules:
1. No DOM, browser clock, component state, network, animation frame, locale or layout measurement inside the authoritative simulation core.
2. **Sim core decides outcomes** in stable, versioned tick and system order; seed and configuration determine randomness.
3. Renderer reads immutable state/view models; camera actions, UI filters and animation effects cannot advance canonical RNG.
4. Chronicle text renders structured records containing actual facts, actors, changed values, causes and coordinates. No AI-generated plot changes.
5. Simulator can advance arbitrary ticks in Node/headless tests; DOM app is a viewer/control surface only.
6. Stable entity IDs and history references are established in Phase 1. Do not over-design full dynasty/war data until corresponding phases.
7. P1 ships basic local save/resume with atomic state/archive writes and validation. Include all RNG streams, ID allocator state, tick and config. P2 extends snapshots with active Spotlights, ordered command history and replay cursor. P5 adds migrations and historian replay; no promise to load unsupported versions silently.

## Deterministic event and time design

- Fixed discrete tick represents a simulation interval (one week proposed in SETTLEMENT_RULES.md; pending 0.8 review).
- Each tick passes through explicit stable phases: environment -> production -> consumption -> construction/demography -> event record/snapshot; detailed ordering to be finalized with rule contracts.
- RNG streams are named for independent subsystems, and the PRNG algorithm/version and stream derivation must be explicit. Define stable entity iteration, ties, numeric units/rounding and canonical serialization; exclude camera/UI state from digests. Do not use Math.random for sim decisions.
- Resume restores complete authoritative state. Historical seeking later restores a checkpoint and reruns ticks with recorded commands; chronicle records are not an exhaustive mutation log.
- Bound the live feed separately from the persisted canonical archive. Before P1, specify archive limits and storage failure behavior; preserve causal records and the last valid save rather than silently truncating history.
- Canonical events contain: event ID, tick, type, actor/place IDs, causal references/facts, effects/changed values and importance.
- Generate narrative headlines by deterministic templates or pure formatters over event facts. Text is not a source of state mutation.
- Treat controller actions (play, pause, speed, inspect, **passive follow/bookmark**, log filtering) as non-authoritative control/UI choices. **Future explicit Story Spotlight** activation is different: at a deterministic tick boundary it expands eligible opportunity families for the tagged entity, can change future events, and must be included in the run's command history and replay. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md).

## Performance strategy

- First prototype: synchronous small-grid headless core and Canvas 2D rendering.
- If responsiveness suffers: move fixed-tick engine to Web Worker with typed messages, no dependency on UI frame rate.
- Later continent: coarse-grained regional simulation with stable deterministic update cadence, never based on camera/zoom/selection.
- Instrument frame time, tick duration, history memory and DOM log rendering during stress testing.

## Testing architecture

**Before first UI implementation:**
- Same `seed + config + simulationVersion` -> same canonical state/event digest after 1, 100 and 1,000 ticks.
- Different rendering frame rates/speeds/selection -> same outcome after the same N ticks; Node and supported browser engines produce the same canonical digest.
- Serialize/restore after N ticks, advance M, and compare state/events with uninterrupted N+M ticks; include RNG and ID allocator continuity.
- Invariant checks on negative resources, nonnegative population, missing entity IDs and impossible occupancy.
- Boundary seeds: water-dominated maps, poor fertility, zero population, depleted stores.

**With first viewer:**
- Play/pause/step/speeds visually agree with tick counter.
- Clicking event selects correct location/record, with clear empty-state handling.
- Browser layout at representative desktop and Android phone widths.
- State-derived visual changes and chronicle fact consistency.
- Save, reload, resume and autosave continuity; corrupt/unsupported saves, interrupted writes, quota limits and unavailable storage preserve the last valid save and show honest status.

**Later:** worker equivalence, timeline seeking, simulated centuries, civilization coherence and cross-version migrations.

## Items to approve before moving to engineering

- [x] Accept ADR-001: Vite + TypeScript + React, pure TS core, Node/npm policy.
- [x] Accept ADR-002: Canvas 2D, HTML accessibility and controller-owned fixed ticks.
- [x] Accept ADR-003: IndexedDB and headless/browser/manual verification boundaries.
- [x] Browser-local simulation, no account, server, LLM or paid service required in Phase 1.
- [ ] Canonical event records and typed stable IDs; initial seed/config/version formats.
- [ ] Complete Phase 1 mechanics and storage contracts using [PLAN_REVIEW.md](PLAN_REVIEW.md), including rule ordering, workforce/material accounting, demographics, extinction, retention limits and autosave cadence.
- [ ] Static visual validation per ART_UI_SPEC.md (not yet complete).

Once these decisions are approved and documented, prepare the first engineering PR (seed and clock only). Do **not** implement a full game or deploy at this review step.
