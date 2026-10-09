# Architecture decision records

These records turn the Phase 0.7 recommendation into accepted architecture choices.

| Record | Proposed choice | Status |
| --- | --- | --- |
| [ADR-001](001-browser-build-and-core.md) | TypeScript core, React/Vite app, Node 24 LTS and npm | Accepted — 2026-10-09 |
| [ADR-002](002-rendering-and-controller.md) | Canvas 2D map, accessible HTML panels, controller-owned fixed ticks | Accepted — 2026-10-09 |
| [ADR-003](003-persistence-and-verification.md) | IndexedDB adapter, versioned snapshots, Vitest/Playwright verification | Accepted — 2026-10-09 |

## Approval and phase ownership

The repository owner explicitly approved ADR-001–003 on 2026-10-09 and requested merging PR #7. Architecture acceptance is recorded as D-013 in the [decision register](../DECISIONS.md); Phase 0.7 is complete. The overall pre-build gate remains open. Keep Phase 0.6 and 0.8 open until their separate visual and mechanics/storage reviews are complete.

The [settlement rules](../SETTLEMENT_RULES.md) and [persistence contract](../LOCAL_PERSISTENCE_CONTRACT.md) remain proposed. These ADRs describe ownership and verification without selecting new numeric balance values.

## Review checklist

- [x] Accept ADR-001: language, app/build tools, runtime/package-manager policy and core dependency boundary.
- [x] Accept ADR-002: renderer, UI accessibility, tick scheduling and observation boundaries.
- [x] Accept ADR-003: save adapter, validation/admission ownership and automated/manual acceptance.
- [ ] Review remaining P1 mechanics and storage choices (Q-004 and Q-006).
- [ ] Record desktop/phone visual evidence for Q-002 and Phase 0.6.
- [ ] Record the overall Phase 0 exit decision before scaffolding.

After the gate, the first engineering change is project setup, deterministic seed/RNG/clock, canonical state/event encoding, tests and CI. Terrain, settlement loops, persistence and viewer follow as scoped increments.
