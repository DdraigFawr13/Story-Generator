# Phase 0 — Reset and skeleton

**Goal:** a clean, short doc set, a CI that finishes in under 5 minutes, and a reviewed engine core with browser saves, so Phase 1 world generation can start on solid ground. The old app keeps working at `/`.

## Milestones

**PR 1: M0.1 + M0.2, docs reset and slim CI** (mostly moves; combined so CI runs once)
- Archive `docs/*` (except `REBOOT_PLAN.md`), ADRs, probes and evidence into `docs/archive/`.
- New docs: `VISION`, `ARCHITECTURE`, `ROADMAP`, `DECISIONS`, `CONTENT_GUIDE`, `DEPLOYMENT`, this spec, and a root `CHANGELOG.md`. Rewrite `README`, `CONTRIBUTING`, `AGENTS`.
- Archive the seed batteries, the two 100-seed tests inside `living`/`residents`, the long-run test, battery and browser-coverage verifiers, the legacy browser specs and the study scripts. The remaining legacy fast unit tests stay until Milestone A.
- CI: `core` (format, typecheck, boundaries, unit, build) and `browser` (one Chromium smoke covering `/` and `/?next`). Remove `full-regression.yml`, tier scoping and Python probes. Keep branch cleanup.
- Boundaries: reject `Math.sin/cos/tan/exp/pow/log/…` in `engine` and `content`.

**PR 2: M0.3, engine review, sfc32 and saves**
- Switch the RNG to `sfc32` (four 32-bit words per stream, seeded by hashing `seed:name`). Keep the `RngStream` API.
- `src/platform/save-store.ts`: IndexedDB named saves with checksum and atomic replace, adapted from `src/adapters/local-save.ts` without history limits or per-version codecs. Unit-tested with a fake IndexedDB-like store.
- Save/Load buttons in `/?next`. The smoke test covers save → reload → load → continue.
- Small scaffold fixes found in review.

## Data shapes

```ts
// rng: four words per stream instead of one
interface WorldState { rng: Record<string, [number, number, number, number]>; … }
// platform
interface SaveSummary { name: string; seed: string; day: number; savedAt: string }
interface SaveStore { list(): Promise<SaveSummary[]>; save(name: string, world: WorldState): Promise<void>;
  load(name: string): Promise<WorldState>; remove(name: string): Promise<void> }
```

## Cross-domain links

- Saves ↔ engine: `serializeWorld`/`deserializeWorld` stay the only save format, so every system's state persists for free.
- RNG ↔ every system: named streams keep systems independent when new ones are added.
- Boundaries ↔ determinism: the safe-math check keeps world-gen identical across browsers.

## Defaults chosen

- **Year:** 12 × 28 = 336 days (already in `clock.ts`); months stay even and seasons divide cleanly.
- **RNG:** `sfc32`. It passes standard statistical test suites, is as fast as xorshift32 in JS, and has no shared-bit artifacts across streams. Cheapest to switch now, before world-gen fixes any outputs.
- **CI:** two jobs, no tiers or label-triggered regression. The repo is public, so minutes are free; the goal is fast feedback.
- **Archive, not delete:** legacy tests and scripts move to `docs/archive/` so they stay readable until Milestone A.
- **Saves:** several named slots now (cheap with IndexedDB keys); autosave arrives with M3.12.

## Design forks

None (per the reboot plan).

## Done when

- [x] Old app works at `/`; `/?next` loads, steps and saves/loads.
- [x] CI under 5 minutes (PR #44: `core` 53 s, `browser` 40 s, in parallel).
- [x] New docs total about 10 pages or fewer.

## Out of scope

Web Worker host (Phase 1), world-gen, any new simulation system.
