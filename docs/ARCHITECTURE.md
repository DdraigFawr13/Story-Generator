# Architecture

TypeScript, React, Vite and Canvas 2D in the browser, tested with Vitest and Playwright. No backend, accounts or API keys. Full rationale: [REBOOT_PLAN.md §7](REBOOT_PLAN.md#7-architecture).

## Layers

```
src/
  engine/    pure simulation: no DOM, Date, Math.random, timers or I/O
    core/    types, content types and validation, rng streams, clock, scheduler, context, math, world/save
    people/  attributes, aptitude, magic tiers, combat scale
    worldgen/ terrain, erosion, climate, water, biomes, resources, aura, habitat, regions, routes
    history/ settlement, then the yearly loop in `history/index.ts` (38 files: harvest, demography,
             famine, plague, migration, war, notables, lineages, crafts, intrigue, feuds, faith, orders,
             diplomacy, tempers, great beasts and works, playback); per-run state in `HistoryRun`
    site/    the watched site: local map, layout, the day loop in `site/tick.ts` (needs, work, health,
             social, family, society, threats, saves)
    systems/ the day scheduler's list (only the weather demo today; the site and history have their own loops)
    narrative/ biographies, legend pages, chronicle text rendering
  content/   typed data ("raws"), one file per content type; site content under `content/site`
  platform/  browser services: IndexedDB saves, the world-gen and site Web Workers and their hosts
  app/       React: the four rooms (`tales/`, `people/`, `book/`, `town/`), their shell in `rooms/`,
             and the classic viewer (`WorldMap`, `Legends`, `SiteView`) behind `?room=classic`
```

`npm run boundaries` enforces the import table: `engine` imports only `engine`; `content` imports `engine` (types and helpers); `platform` imports `engine`; `app` may import all three. `engine` and `content` may not touch browser or nondeterministic globals, nor non-safe `Math` functions (below).

The legacy single-settlement app (`src/sim`, `src/controller`, `src/adapters`, `src/ui`) was deleted at Phase 2 close (decided 2026-10-12; was M3.13). Its code is in git history before that PR; don't port it back.

## Core rules

- **Determinism is a convention, not a gate.** Every random draw comes from a named stream (`ctx.rng('worldgen.height')`). A stream's start state is derived from `(seed, name)`, so adding a stream never reshuffles another. The generator is `sfc32` (128-bit state per stream).
- **Safe math.** In `engine`, use `+ - * /`, `Math.sqrt`, `floor`, `round`, `ceil`, `trunc`, `min`, `max`, `abs`, `sign` and `imul`. No `sin`/`cos`/`exp`/`pow`/`log` and the like: use lookup tables. `npm run boundaries` rejects them in `engine` and `content`. Iterate in id order.
- **Clock.** The day is the base unit: 12 months × 28 days = a 336-day year with four seasons. Systems declare a cadence (daily, weekly, monthly, seasonal, yearly) and run in their listed order.
- **State.** One serializable `WorldState` of plain objects, arrays and `Map`s keyed by integer ids. A save is `serializeWorld(state)`. There is no cross-version compatibility.
- **Systems** are `{ id, cadence, run(ctx) }`. They mutate state and report through `ctx.emit`, which refuses event types without content definitions.
- **Events** are `{ id, day, type, importance, actors, place, causes, data }`. `causes` links earlier events and powers "why?".
- **Commands** queue at tick boundaries and stay empty in observer mode; hybrid modes register handlers later.
- **Narrator** interface renders events (and later recaps) from templates. An LLM narrator is a later, optional seam.

## Saves

`src/platform/save-store.ts` keeps named saves in IndexedDB. A save stores the serialized world with a checksum; a write either commits completely or leaves the previous save untouched. Saves from an older build may fail to load: that is expected (R-02).

## Performance budgets (desktop)

256×256 world-gen under 2 s; 250 years of history under 10 s (about 4 s measured 2026-10-17); a 150-resident site at 10+ days/s (the speed guard in `tests/speed` asks for a year in 2.5 s). World-gen and the site run in Web Workers (`src/platform`).

## Testing

Small unit tests with tiny fixtures, one determinism test including save → load → continue, an invariant checker, and one Chromium smoke test. See [CONTRIBUTING.md](../CONTRIBUTING.md).
