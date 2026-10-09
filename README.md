# Story Generator

A procedural, simulation-driven pixel world that tells the histories of its societies as they emerge.

**Status:** Design exploration / pre-production. No game implementation has been selected or claimed.

## Vision

Start a seeded world, observe a society from founding to transformation or collapse, and follow its emergent history through a synchronized map and chronicle. The underlying simulation determines what happens; the narrative layer reports events, their causes, and their consequences. Neither fixed plotlines nor independent random flavor messages substitute for simulated state.

## Where to start

- [Game concept and design directions](docs/GAME_DESIGN.md)
- [Simulation architecture and narrative event model](docs/SIMULATION_DESIGN.md)
- [Phased roadmap, testing, and acceptance criteria](docs/ROADMAP.md)
- [Working agreements and branch hygiene](CONTRIBUTING.md)

## Current design recommendation (subject to feedback)

**The Living World:** a continent-level view with the eventual ability to zoom into individual settlements and follow important people. The first playable slice should be a **single living settlement**, not a full multi-civilization world.

## Immediate next decision

Agree on the preferred visual presentation and spectator-versus-intervention model, then start Phase 1 as a small, fully testable simulator with a seeded world, visible development and a factual, causal history log.

## Development

Repository initialization and documentation are in progress. Runtime, package manager, deployment target, and assets are intentionally not locked until the initial design is reviewed.
