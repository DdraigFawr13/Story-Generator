# Story Generator

A procedural, simulation-driven pixel world that tells the histories of its societies as they emerge.

**Status:** Phase 1's deterministic weekly settlement engine is implemented under D-020/D-021, with labor/resource accounting, construction, demographics and canonical events. The browser still shows the founding preview; playback, the live chronicle and local saves are next. This is not the first playable milestone.

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
- [Implemented Phase 1 foundations and verification](docs/PHASE1_FOUNDATIONS.md)
- [Weekly settlement engine, verification and balance findings](docs/PHASE1_SETTLEMENT.md)
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

## Current work

**Direction C (Naturalist's Observation Desk) and Illustrated Minimal are selected.** Architecture is approved (D-013), and D-020/D-021 authorize Phase 1 work. PR #11's core/terrain/founding foundations are merged. The weekly loop now has running-state validation and complete-tick admission; next is the advancing controller and one-slot local persistence. Balance findings, the autosave loss window, selected references and physical-device evidence remain open. The map drawings are temporary. See the [handoff](docs/PROJECT_HANDOFF.md) and [engine record](docs/PHASE1_SETTLEMENT.md).

## Development

Use Node **24.19.0** and npm **11.9.0** (pinned in `.nvmrc`, `.npmrc` and `package.json`):

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Enter a seed or generate one, then select map tiles or use the coordinate inspector. Generation failure preserves the current world. This preview stays at tick zero and has no save controls.

```sh
npm run check
python3 docs/probes/terrain_probe.py
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
```

`check` verifies formatting, strict types, module/runtime boundaries, core tests and the production build. Browser checks compare canonical fixtures with Node and exercise the preview at 320/390/768/1280 CSS pixels. CI runs both suites. No hosted service or API key is required; deployment remains a milestone decision.

The core API exposes `createSettlement(seed)`, `advanceSettlement(snapshot, weeks, limits)` and `simulateSettlement(seed, weeks, limits)` from `src/sim`. Tests include 100 seeds × 1,000 weeks, so the complete unit suite takes several minutes. To write its measurement report, run `STORY_GENERATOR_REPORT=/tmp/settlement-report.json npm test`; timings stay outside canonical state.
