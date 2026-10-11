# Architecture

TypeScript, React, Vite and Canvas 2D in the browser, tested with Vitest and Playwright. No backend, accounts or API keys. Full rationale: [REBOOT_PLAN.md §7](REBOOT_PLAN.md#7-architecture).

## Layers

```
src/
  engine/    pure simulation: no DOM, Date, Math.random, timers or I/O
    core/    types, rng streams, clock, scheduler, context, content validation, world/save
    people/  attributes, aptitude, magic tiers, combat scale
    narrative/ narrator interface and template renderer
    systems/ the ordered list of simulation systems
    (later: worldgen/, history/, site/, lod/)
  content/   typed data ("raws"): races, abilities, weather, event types, rules, templates
  platform/  browser services: IndexedDB saves (worker host for world generation; later: preferences)
  app/       React UI for the new engine (served at /?next until Milestone A)
```

`npm run boundaries` enforces the import table: `engine` imports only `engine`; `content` imports `engine` (types and helpers); `platform` imports `engine`; `app` may import all three. `engine` and `content` may not touch browser or nondeterministic globals, nor non-safe `Math` functions (below).

The legacy app (`src/sim`, `src/controller`, `src/adapters`, `src/ui`) still serves `/` and is deleted at Milestone A (M3.13). Don't extend it, and don't port its versioned modules into the new engine.

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

256×256 world-gen under 2 s; 250 years of history under 10 s; a 150-resident site at 10+ days/s. World-gen and history move into a Web Worker when Phase 1 needs it.

## Testing

Small unit tests with tiny fixtures, one determinism test including save → load → continue, an invariant checker, and one Chromium smoke test. See [CONTRIBUTING.md](../CONTRIBUTING.md).
