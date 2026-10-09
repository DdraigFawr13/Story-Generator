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
- [Approved middle-fantasy tone](docs/WORLD_TONE.md)
- [Decision register and future ideas](docs/DECISIONS.md)
- [Working agreements and branch hygiene](CONTRIBUTING.md)

## Approved direction

**The Living World:** eventually a continent-scale view with zoomable settlements and inspectable people. Build **one living settlement first**. Start with **middle fantasy**: realistic social/economic causes plus bounded magic, added only when there is a working social model. **Observer-only for current phases**; small optional nudges are deferred as a future idea, not planned implementation.

## Immediate next decision

Finish Phase 0: review alternative visual concepts, approve a target, select technical stack and define Phase 1 numeric mechanics contracts. **Do not begin Phase 1 until the pre-build gate is met.**

## Development

Planning documents are versioned and merged using scoped pull requests. Runtime, package manager, deployment target, and visual assets are intentionally not locked until design review.
