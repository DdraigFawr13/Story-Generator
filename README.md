# Story Generator

A procedural, simulation-driven pixel world that tells the histories of its societies as they emerge.

**Status:** Pre-production / detailed implementation planning. The scope and middle-fantasy direction are approved; no playable game has been implemented.

## Vision

Start a seeded world, observe a society from founding to transformation or collapse, and follow its emergent history through a synchronized map and chronicle. The underlying simulation determines what happens; the narrative layer reports events, their causes, and their consequences. Neither fixed plotlines nor independent random flavor messages substitute for simulated state.

## Where to start

- [Game concept and design directions](docs/GAME_DESIGN.md)
- [Simulation architecture and narrative event model](docs/SIMULATION_DESIGN.md)
- [Phased roadmap, testing, and acceptance criteria](docs/ROADMAP.md)
- [Detailed ordered implementation plan (Phase 0–6)](docs/IMPLEMENTATION_PLAN.md)
- [Plan review and remaining mechanics/storage contracts](docs/PLAN_REVIEW.md)
- [Product brief and first-session quality bar](docs/PRODUCT_BRIEF.md)
- [Project handoff and recovered thread decisions](docs/PROJECT_HANDOFF.md)
- [Proposed numeric P1 settlement rules](docs/SETTLEMENT_RULES.md)
- [Deterministic terrain contract and 100-seed probe](docs/TERRAIN_CONTRACT.md)
- [Proposed local save/resume and recovery contract](docs/LOCAL_PERSISTENCE_CONTRACT.md)
- [Approved middle-fantasy tone](docs/WORLD_TONE.md)
- [Decision register and future ideas](docs/DECISIONS.md)
- [Approved Direction C visual specification](docs/ART_UI_SPEC.md)
- [Refined simplified art style](docs/ART_STYLE_REFERENCE.md)
- [Narrative spotlights and moral range](docs/NARRATIVE_SPOTLIGHTS.md)
- [Story Spotlight opportunity expansion](docs/SPOTLIGHT_OPPORTUNITIES.md)
- [Technical architecture review](docs/ARCHITECTURE_REVIEW.md)
- [Accepted architecture decision records](docs/adr/README.md)
- [Working agreements and branch hygiene](CONTRIBUTING.md)

## Approved direction

**The Living World:** eventually a continent-scale view with zoomable settlements and inspectable people. Build **one living settlement first**. Start with **middle fantasy**: realistic social/economic causes plus bounded magic. Observation is the central experience, with a future deliberately activated **Story Spotlight** that broadens *eligible* opportunities (not guaranteed events/outcomes) for tagged people and societies. Mere inspection/bookmarking never changes world state. Separate direct observer nudges are deferred.

## Immediate next decision

**Direction C (Naturalist's Observation Desk) and Illustrated Minimal are selected.** Architecture is approved (D-013); the phone arrangement is approved, with two static studies prepared. Next, validate actual-size readability and desktop/phone interaction, then accept the reviewed Phase 1 mechanics, terrain and storage proposals. See [project handoff](docs/PROJECT_HANDOFF.md) for the recovered pacing, seasonal-economy and background-pausing requirements, source provenance and ordered next work. Basic browser-local save/resume is approved for the first playable; timeline seeking remains later. **Do not begin Phase 1 until the pre-build gate is met.**

## Development

Planning documents are versioned and merged using scoped pull requests. Architecture is approved: strict TypeScript core, React/Vite, Canvas 2D, Node 24 LTS/npm, IndexedDB and Vitest/Playwright. Exact dependency versions and production assets remain unimplemented pending the overall Phase 0 gate. Hosting remains a milestone decision.
