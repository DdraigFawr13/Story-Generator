# ADR-001 — Browser build and pure simulation core

**Status:** Accepted by the repository owner on 2026-10-09. **Date:** 2026-10-09. **Decision owner:** repository owner.
**Scope:** Phase 0.7 / Q-003.

## Context

The first playable simulates one settlement in a browser, while deterministic logic must execute identically in headless tests. The chronicle and inspector need coordinated responsive UI state. A server, account or runtime language model is unnecessary for this scope.

## Proposed decision

Use strict TypeScript, Vite for the browser build and React for the HTML application shell. Keep the simulation in pure TypeScript modules with no React or browser imports. Use a single repository/package initially; a monorepo does not yet have independent deployment or package consumers to serve.

Use Node 24 LTS for development and CI, with npm and a committed package-lock.json. Select the then-supported exact Node 24 patch and compatible exact tool/dependency versions during approved scaffolding; record them in the runtime selector, package metadata and lockfile. Use npm ci in CI. Recheck the maintained runtime/tool compatibility then; this proposal does not claim packages have been installed.

Suggested future layout:
- src/sim: state/config, RNG, clock, systems, canonical events, snapshot validation and encoding.
- src/controller: serialized run control, view publication, tick admission and persistence coordination.
- src/adapters: browser storage, operational clocks and digest/platform bindings.
- src/ui: React panels and Canvas renderer.
- tests: headless, browser and fixtures.

Core imports may reference other core modules only. Controller/adapters may depend on core contracts; UI consumes controller/view contracts. Type-only imports count toward the boundary. Introduce an import-boundary check in the first engineering slice.

## Contracts and consequences

The core receives explicit complete config, seed and state. A candidate tick returns candidate state/events without altering the last committed state. The exact PRNG, units and phase ordering live in the versioned settlement rules.

Core validation and canonical encoding are shared by Node and browser adapters. Canonical bytes have one implementation; async SHA-256 and storage operations remain outside simulation outcomes. No Date, performance clock, DOM, network, locale-dependent sorting or Math.random in core.

Readonly TypeScript view types express the interface, but do not alone prevent mutation. Publish isolated immutable views and immutable save captures; use development freezing or mutation checks to expose accidental writes. Prevent copying the complete growing archive on every frame. Select the simplest measured implementation at each increment.

React owns presentation state; the controller owns the committed world. Do not store a second authoritative world in a component or introduce a general state-management library before a demonstrated need.

## Alternatives

Vanilla DOM would reduce framework dependencies but leaves panel synchronization/lifecycle handling custom. React fits the planned interactive chronicle and inspector. A server-rendered framework adds deployment/runtime responsibilities without a P1 server requirement. A monorepo or independent core package can be reconsidered when real consumers need it.

## Verification and reopening triggers

Before merging engineering setup, verify strict typechecking, boundary checks, headless tests and browser production build. Node/browser golden fixtures must agree before the viewer depends on core.

Revisit this ADR for demonstrated framework overhead, independent consumers, or a runtime becoming unsupported. Pinning versions does not remove the need to review updates. No scaffolding is authorized until the complete Phase 0 gate closes.
