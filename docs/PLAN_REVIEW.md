# Plan review and remaining pre-build contracts

**Review date:** 2026-10-09 UTC. **Status:** documentation revision; Phase 0 remains open. Basic local save/resume in P1 is user-approved (D-012). Architecture and numeric mechanics below remain proposals requiring the existing pre-build review; no application has been implemented or tested.

## Assessment

Keep the village-first scope, pure deterministic core, state-grounded chronicle and original simplified Direction C presentation. They support the central experience: watch a society change and inspect why.

The main risks are incomplete rule contracts, loss of early worlds before saves arrive, and promises of replay or unlimited historical retention without sufficient state/storage contracts. Resolve those before scaffolding; do not add more content families to compensate.

## Changes made in this review

| Finding | Plan correction |
| --- | --- |
| Save/resume postponed until P5 | User approved basic local manual save/resume and autosave in P1; P5 expands management and seeking |
| Chronicle facts mistaken for a replay log | Resume complete snapshots; seek by restoring checkpoints and executing ticks with authoritative commands |
| Bounded live log confused with complete archive | Separate presentation window from canonical archive; define supported limits and preserve the last good save on failures |
| Seed-only replay claims omit Spotlights | Include ordered tick-stamped commands from P2 and active state/cursor in snapshots |
| Selected-area simulation could affect history | Deterministic authoritative schedules; selection only changes presentation |
| P1 examples imply individuals, disease, fracture or regional relocation | Keep aggregate population/households in P1; named people in P2; political/regional systems later |
| Species/remote sharing both parked and scheduled | Keep additional intelligent species and remote publishing parked; basic local history exports remain P5 |

## Architecture recommendation

Retain TypeScript strict, pure simulation modules, Vite/React for the app shell, Canvas 2D for the map, Vitest and Playwright. Use IndexedDB for the approved local save scope. No server or runtime language model is needed.

Record accepted choices as short architecture decision records after review. Choose a supported runtime, package manager and exact dependency versions during that decision/scaffolding preparation. Do not add PixiJS, workers or backend services without measured need. Architecture acceptance does not by itself close the visual and numeric-rule gates.

## Required P1 mechanics contract

Create a single versioned rules/configuration specification before implementing systems. Each rule must list state inputs, units, preconditions, stable update order, RNG use, effects, events, invariants and a worked example. The values must be proposed and reviewed; the following checklist is not a claim that tuning is settled.

| Area | Decisions required | Evidence needed before the rule is considered ready |
| --- | --- | --- |
| Time | Tick duration, ticks/season and seasons/year; phases and within-tick visibility of effects | A boundary tick example shows production, consumption, construction and demographics in unambiguous order |
| Geography | Logical dimensions (64×40 candidate), fertility/resource bounds, valid start requirements and bounded generation fallback | All-water/poor-land fixtures terminate deterministically with a valid start or a clear generation failure |
| Founders | Initial population, household counts, stores, shelter and occupied tiles | Initial resource and occupancy ledger balances; residents are aggregate markers, not invented individuals |
| Food | Food unit, ration, field growth/harvest timing, weather modifiers, storage capacity and overflow/spoilage | Worked normal season and failed-harvest season balance production, consumption and loss without negative stores |
| Labor/materials | Aggregate workforce availability, allocations, gathering source, finite/regrowing material rules | Construction cannot use the same worker or material twice; depleted inputs prevent work |
| Buildings | Hut/field/store costs, build time, priorities/ties, site eligibility, repair/decay/removal and capacity changes | Insufficient labor/material, occupied land and lost housing have defined outcomes |
| Demographics | Birth/death cadence, food/health/housing effects, household count updates and ordering | Growth, decline and recovery are possible without guaranteed arcs; population and household bounds remain consistent |
| Departures/extinction | Whether P1 includes aggregate departures, their resource accounting, behavior at zero population | No destinations/new settlements or spontaneous population revival; time controls/history remain usable at extinction |
| Determinism | PRNG algorithm/version, stream derivation/state, entity ordering, ID allocation, integer/fixed-point arithmetic, rounding and canonical digest format | Same fixture matches headless/browser results and survives snapshot restoration |
| Chronicle | Event emission thresholds, cause facts/references, unchanged-state fact events, headline grouping | Grouping never rewrites canonical records; deleted entities retain resolvable historical identity/location |
| Local persistence | Autosave cadence, one-slot replacement semantics, complete snapshot/archive transaction, schema/version rejection | Reload/resume matches uninterrupted ticks; partial/corrupt saves and unavailable/quota-limited storage never replace a valid save |
| Limits | Archive event/byte bounds, live-feed window, supported run length and target devices/browsers | Measure size and tick/UI latency at the agreed horizon; archive limit pauses advancement explicitly without deleting evidence |

Do not choose final rates from a single attractive seed. Once implementation is authorized, run resource ledgers, invariant fixtures and a fixed seed battery before qualitative tuning. Numeric proposals must clearly separate dimensional consistency from empirically tested balance.

## Candidate specifications prepared after this review

- [Product brief](PRODUCT_BRIEF.md): intended experience, confirmed product priorities and first-session acceptance scenarios.
- [Geography contract](GEOGRAPHY_CONTRACT.md): candidate integer terrain generation, bounded attempts and reserved valid starts.
- [Phase 1 rules](PHASE1_RULES.md): explicit proposed numeric mechanics with worked accounting examples; not empirically balanced.
- [Technical contract](TECHNICAL_CONTRACT.md): proposed engineering decisions, save semantics and validation budgets; not benchmark results.

These make review concrete. They do not close the pre-build gate or authorize app scaffolding.

## Ordered remaining work

1. Prepare the numeric rules and storage contract above and architecture decision records for review. This is documentation work and can progress alongside visual exploration.
2. The three art treatments were compared, the user selected the original first concept with human-shaped figures, and the phone arrangement is approved. Finish displayed sprite/text scale and source/export conventions per ART_UI_SPEC.md. Visual fixtures remain explicitly illustrative; human sprites do not imply P2 identities.
3. Record the accepted architecture, mechanics, storage budgets and visual evidence. Keep unfinished Phase 0 boxes unchecked; request only outstanding product decisions.
4. After the existing Phase 0 approval gate, build separate scoped increments: seed/clock and CI → terrain/founders → balanced resource and demographic loops/events → local persistence → integrated viewer and end-to-end acceptance. The numbered implementation checklist defines deliverables, not a requirement to defer persistence until all UI work is finished.
5. Demonstrate the first playable using multiple seeds, one causal chain visible in both map and chronicle, and save/reload continuation on desktop and phone. No forced catastrophe or seed-specific storyline.

## Validation of this revision

This is a documentation review, supported by independent focused reviews of architecture and scope. Check cross-document phase ownership, approval status, replay inputs, archive semantics and changed relative links. Runtime, balance, persistence and browser tests are future acceptance requirements; none has been run against an application because no application exists.

