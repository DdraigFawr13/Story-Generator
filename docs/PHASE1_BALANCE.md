# Phase 1 winter and recovery study — 2026-10-09

This is a reproducible diagnostic for the open winter-preparation and low-population questions. It does not select new production rules or close first-playable acceptance. The application still creates and resumes `p1-settlement-v1` worlds with the complete original configuration.

## Reproduce

```sh
npm ci
npm run benchmark:balance
```

The default report path is `/tmp/story-generator-balance-report.json`; `STORY_GENERATOR_BALANCE_REPORT` can select another path. The committed [raw report](evidence/phase1-balance-study.json) records the source revision, complete baseline configuration, candidate parameters, final state digests, seasonal resource accounting and deliberately forced recovery inputs.

The script uses the production pure reducer, invariant validator and whole-week admission inside separate Vite SSR module graphs. Only the diagnostic graph substitutes each candidate's configuration. Experimental worlds receive distinct `p1-balance-study-*` version tags. It never opens IndexedDB, loads the browser application, changes source constants or writes a production save. These candidates are not supported save formats.

All profiles use exactly RIVERSIDE and TERRAIN_000–008 for 240 weeks (five years), without selecting seeds for a desired story. The baseline's population/health/food/timber at weeks 48, 96 and 240 must match the previously committed ten-trajectory report. Each profile validates its final states and compares RIVERSIDE's JSON-captured week 57 plus 183 weeks against its uninterrupted result, including RNG, IDs and full events.

## Seasonal findings

| Diagnostic profile | Harvest base | Winter crop factor | Worlds with shortages / 10 | Total weeks with a food deficit | Minimum health | Week-240 population range |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Production baseline | 240 | 40% | 0 | 0 | 100 | 24–31 |
| Dormant winter | 240 | 0% | 0 | 0 | 100 | 24–31 |
| Moderate harvest | 160 | 0% | 0 | 0 | 100 | 24–31 |
| Lower harvest | 120 | 0% | 0 | 0 | 100 | 24–31 |
| Scarcity boundary | 100 | 0% | 2 | 19 | 27 | 24–29 |
| Low-yield stress | 80 | 0% | 5 | 111 | 0 | 16–29 |

No sampled profile became extinct within five years. Every sample remained fed during its first winter, including the low-yield stress case. Its first-winter food range was 98–450, compared with 645–1,562 under the baseline. These horizons are observations, not survival guarantees.

Dormant winter alone reduces reserves but leaves the forgiving baseline's large productive surplus intact. Under harvest base 100, RIVERSIDE experiences three shortfall weeks in year-five spring; TERRAIN_000 experiences nine in year-three spring and seven in year-four spring. The gap follows winter draw-down before the spring harvest, rather than an invented winter crisis. The same profile produces no shortfalls in the other eight seeds. Harvest base 80 produces more frequent distress and population decline in several seeds; it is a stress bound, not a recommendation.

A candidate is not accepted because it makes an interesting counter. Before adopting any tuning, review longer fixed-seed samples, actual seasonal explanation in the viewer, and the recovery issue below. A production change needs a new version and explicit dispatch/validation for existing v1 saves; replacing the global constants would silently change resumed histories and is not permitted.

## Forced low-population recovery

These are **one-week diagnostic phase inputs**, not autonomous trajectories, historical claims, or save fixtures. At the RIVERSIDE week-37 state, retain three existing fields, weather, buildings and materials; change opening population/households, empty food, and health 100. Reduce week 38 and validate its complete output.

| Opening residents | Workers | Tended fields | Foragers | Food produced | Food deficit | Closing health |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 0 | 0 | 0 | 1 | 80 |
| 2 | 1 | 1 | 0 | 0 | 2 | 80 |
| 4 | 2 | 2 | 0 | 0 | 4 | 80 |
| 8 | 4 | 3 | 1 | 1 | 7 | 82 |
| 24 | 12 | 3 | 6 | 6 | 18 | 85 |

All six scalar profiles have the same result: they do not change field-first labor allocation. At populations 2 and 4, tending absorbs every worker, so no one forages, repairs, builds or gathers timber that week. At population 1 there is no worker. A future recovery policy must specify the exclusive worker order, seasonal crop-care cost, food/material tradeoff, RNG use and event/ledger consequences. This study does not silently add a reservation or promise recovery.

## Verification and next work

- The complete six-profile study passed: 60 five-year runs, final invariant checks, baseline reference assertions and six full JSON continuation comparisons.
- The original runtime configuration and save schemas are unchanged. The command is a local diagnostic, outside normal CI and the browser bundle.
- Next: select the intended preparation/recovery experience, specify a versioned labor/tuning change, and run the 100-seed/long-history battery before adopting it.
- Exact selected-art references, physical Android/installed Safari evidence and a human causal-chain usability review remain open. No individual-agent phase, Spotlight mechanic or deployment is inferred from this study.
