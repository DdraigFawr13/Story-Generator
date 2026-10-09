# Phase 0.7 — Architecture proposal and decision checklist

**Status: proposed for review, not an approved stack.** Written after Direction C was selected. No code has been scaffolded or deployed. Avoid dependency-version or API assumptions until implementation.

## Recommendation

A **browser-first TypeScript app with a pure deterministic simulation engine**, built and tested independently of the UI. Use a simple top-down HTML Canvas 2D renderer to begin, and introduce PixiJS only when measured scale, sprite batching and scene management justify it. UI overlays and the chronicle are normal HTML, not drawn as pixel text inside the canvas.

### Candidate technologies and rationale

| Concern | Phase 1 candidate | Reason | Future decision |
| --- | --- | --- | --- |
| App language | TypeScript (strict) | One language across core and viewer, explicit data contracts | Keep core framework agnostic |
| Project build | Vite | Small browser-first build, straightforward dev loop | Pick package manager/versions at scaffold time |
| UI | React | State-driven timeline/inspector/panels, practical responsive components | Confirm UI needs justify dependency |
| Pixel-world rendering | **Canvas 2D** initially | Few tile types/sprites, simple nearest-neighbor draw and selection | Consider PixiJS if perf/profiling warrants |
| Core engine | Pure TS modules, fixed-tick state transitions | Headless reproducibility and isolation from frame rate | Optional worker isolation |
| State/view bridge | Typed snapshots + event stream | UI can rerender without modifying simulation | Add snapshot thinning as world scale grows |
| Unit/property tests | Vitest | Fast logic tests for RNG, rules, invariants and chronology | Add longer regression seed battery |
| Browser smoke tests | Playwright | Validate controls/layout on phone and desktop viewport emulation | Include manual physical device checks |
| Persistence | Seed/config initially; explicit versioned snapshot contracts | Avoid accidental saves bound to UI state | IndexedDB persistence in Phase 5, not P1 prerequisite |
| Hosting | Static site / Vercel at demonstrable milestone | Simulation runs client-side; no mandatory backend | Measure bundle/load size and mobile memory |

These are planning recommendations, not a claim that a framework has been installed, tested or deployed.

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
7. Save schema, simulation version and PRNG state are designed early; full save/load UX and backwards compatibility evolve in Phase 5.

## Deterministic event and time design

- Fixed discrete tick represents a simulation interval (exact duration to be determined in 0.8).
- Each tick passes through explicit stable phases: environment -> production -> consumption -> construction/demography -> event record/snapshot; detailed ordering to be finalized with rule contracts.
- RNG streams are named for independent subsystems, and the PRNG algorithm/version must be explicit. Do not use Math.random for sim decisions.
- Canonical events contain: event ID, tick, type, actor/place IDs, causal references/facts, effects/changed values and importance.
- Generate narrative headlines by deterministic templates or pure formatters over event facts. Text is not a source of state mutation.
- Treat controller actions (play, pause, speed, inspect, follow, log filtering) as non-authoritative control/UI choices.

## Performance strategy

- First prototype: synchronous small-grid headless core and Canvas 2D rendering.
- If responsiveness suffers: move fixed-tick engine to Web Worker with typed messages, no dependency on UI frame rate.
- Later continent: coarse-grained regional simulation with stable deterministic update cadence, never based on camera/zoom/selection.
- Instrument frame time, tick duration, history memory and DOM log rendering during stress testing.

## Testing architecture

**Before first UI implementation:**
- Same `seed + config + simulationVersion` -> same canonical state/event digest after 1, 100 and 1,000 ticks.
- Different rendering frame rates/speeds/selection -> same outcome after the same N ticks.
- Invariant checks on negative resources, nonnegative population, missing entity IDs and impossible occupancy.
- Boundary seeds: water-dominated maps, poor fertility, zero population, depleted stores.

**With first viewer:**
- Play/pause/step/speeds visually agree with tick counter.
- Clicking event selects correct location/record, with clear empty-state handling.
- Browser layout at representative desktop and Android phone widths.
- State-derived visual changes and chronicle fact consistency.

**Later:** worker equivalence, save/replay continuity, simulated centuries, civilization coherence and cross-version migrations.

## Items to approve before moving to engineering

- [ ] Vite + TypeScript + React for app shell; pure TS core.
- [ ] Canvas 2D first, with clear swap seam for PixiJS later.
- [ ] Vitest + Playwright for automated checks; manual mobile smoke tests.
- [ ] Browser-local simulation, no account, server, LLM or paid service required in Phase 1.
- [ ] Canonical event records and typed stable IDs; initial seed/config/version formats.
- [ ] Numeric Phase 1 mechanics in a separate contract: tick duration, map dimensions, founder count, food/ration units, crop growth, weather and housing costs.
- [ ] Static visual validation per ART_UI_SPEC.md (not yet complete).

Once these decisions are approved and documented, prepare the first engineering PR (seed and clock only). Do **not** implement a full game or deploy at this review step.
