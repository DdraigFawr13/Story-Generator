# ADR-003 — Local persistence and verification boundaries

**Status:** Proposed. **Date:** 2026-10-09. **Decision owner:** repository owner.
**Scope:** Phase 0.7 / Q-003; integrates the proposed Q-004/Q-006 contracts.

## Context

Basic local save/resume is approved for P1. Deterministic continuation needs a complete snapshot including RNG, IDs and canonical history. IndexedDB transactions, hashing, tab ownership and async callbacks must not alter canonical simulation results.

## Proposed decision

Use an IndexedDB browser adapter for the one-slot save model in the local persistence contract. Use Vitest for headless rule/invariant/continuity tests and Playwright for browser control, rendering, persistence and responsive checks. Use physical-device smoke tests to supplement browser emulation.

Serve a static production build. Vercel remains a candidate for a demonstrable visual milestone; hosting selection and deployment are separate actions. HTTPS/localhost is required for the proposed Web Locks and Web Crypto capabilities. No backend, account or cloud sync is required.

## State, admission and save ownership

1. Core builds the next candidate tick and emits factual events. Core also validates structure, resources, references and matching rule/config versions.
2. The controller applies deterministic history admission using exact canonical payload bytes and event counts from the shared encoder and declared limits. This policy also runs in the headless runner. It uses no browser quota observation or wall clock.
3. An accepted candidate becomes the committed world. A rejected candidate leaves state, RNG, IDs, counters and archive unchanged and pauses advancement.
4. Saving captures an isolated immutable committed state/archive. The adapter validates the envelope/checksum, uses the shared core validator, and replaces the complete record in one transaction.
5. Save success follows transaction completion. Operational metadata and retry clocks stay outside the core/digest. Async callbacks carry session/generation identity so stale results cannot mark another world saved.
6. Resume validates a complete candidate before replacing the current in-memory world. Unsupported/corrupt data remains stored and never silently migrates.

The digest is SHA-256 over shared canonical UTF-8 payload bytes. Platform hashing may be asynchronous without changing admission or outcomes. Do not include the checksum itself in its input. A checksum detects accidental corruption; it does not prove semantic validity.

History-limit admission must be enforced by every runner, including headless execution. It must not depend on a successful IndexedDB write. A quota failure leaves current memory valid and the previous save intact under the persistence contract.

Proposed same-origin exclusive ownership uses Web Locks. Detect required browser capabilities before offering persistence. If ownership locking or IndexedDB is unavailable, show explicit unsaved-mode limitations under that contract. Test actual browser behavior rather than infer support from the browser name.

## Test tiers and CI

| Tier | Required evidence |
| --- | --- |
| First engine PR | Typecheck/import boundaries, seed/RNG golden vectors, fixed clock, canonical encoding, production build |
| Terrain/resources/rules | Conservation ledgers, occupancy/population invariants, forced boundary fixtures, 100 fixed seeds × 1,000 ticks |
| Persistence | Uninterrupted vs resumed equivalence, corrupt/unsupported envelopes, quota/abort, writer ownership, replacement/session races |
| Integrated viewer | Play/pause/step/speed equivalence, actual event/inspector facts, keyboard/touch and responsive layout |
| Meaningful milestone | Cross-engine digest checks, desktop and physical Android smoke evidence, 10,000-tick performance/storage benchmark |

CI should run npm ci, typechecking, boundary/lint checks, Vitest and the production build. Add browser jobs when a browser-testable slice exists; use Chromium, Firefox and WebKit. Do not describe Playwright WebKit as testing installed Safari. Confirm Safari behavior separately when claiming that browser is supported.

The save adapter requires real-browser transaction tests as well as deterministic error injection for failure paths. A simulated quota error alone does not establish actual browser durability or eviction protection.

Measure canonical serialization/admission cost, snapshot/write latency, peak memory, tick duration and UI responsiveness at the documented horizons. A test run stopped by a supported limit is a measured limit result, not evidence of completing the requested horizon.

## Alternatives and consequences

localStorage is synchronous and unsuitable for the complete growing payload. A backend would add authentication/sync concerns beyond approved scope. Using chronicle records alone cannot recover unrecorded state transitions. Migrations and historical seeking remain later work.

Complete snapshots simplify recovery, but serialization, copies and the archive can be expensive. Optimize only from measurements while preserving byte-exact admission and immutable captures; reopen storage budgets if target devices cannot meet them.

## Approval and verification status

All test rows above are future requirements. No app, dependencies, browser runs or performance results are introduced by this ADR. Numeric mechanics/storage acceptance and visual validation remain separate Phase 0 decisions. First engineering work starts only after the complete gate is recorded.
