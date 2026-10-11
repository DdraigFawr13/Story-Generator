# Winter reserves and recovery — 2026-10-09

D-023 records the user's emphasis: “Keep most starts viable, make winter reserves matter, and allow recovery from small populations.” [PR #16](https://github.com/DdraigFawr13/Story-Generator/pull/16) implements `p1-settlement-v2` for new worlds while retaining `p1-settlement-v1` for existing saves. Viewer PR #14 is merged at `af30301`; D-022 authorizes verified milestone merges.

## Rule amendment

Only three economy settings change:

| Rule | V1 | V2 |
| --- | --- | --- |
| Winter crop multiplier | 400/1000 | 0/1000; no winter field labor |
| Opening workforce | floor(P/2) | min(P, max(2, floor(P/2))) |
| Low-reserve foraging | Fields reserve labor first | Protect one forager before fields when P > 0 and opening food < 6×P |

P is opening population. The protected worker counts within the existing forager cap, ceil(P/4); it is not extra production. Foraging still produces two rations per worker outside winter and one in winter. Remaining labor goes to repairs, construction and timber in the original order. All resource ledgers, weather/demographic draws, capacities, construction costs, health rules and finite forest remain unchanged. Changed food/labor conditions can naturally change later birth eligibility and trajectories.

The minimum workforce is an aggregate approximation bounded by actual residents. It gives one resident one worker and two residents two workers; it does not establish individual ages or professions. P2 will need explicit agent work eligibility. Extinction remains possible, retains history and never spontaneously reverses. There is no seed-specific rescue, resource grant or fixed collapse timer.

Winter still emits the factual season-end crop record, including zero inputs/yields and actual causes. The headline reads “Winter fields rest; no crop harvest.” The map uses dashed dormant plots, the legend explains them, and the settlement shows the last week's actual labor. Existing reserve estimates remain based on current demand, without promising survival.

## Existing-save continuity

Schema 2 and the envelope remain unchanged. Both recognized versions require the exact matching configuration and equal rulesVersion/simulationVersion. Loading v1 preserves its winter multiplier, workforce, RNG, IDs and archive; it is not migrated. New worlds default to v2. Unsupported versions, relabeled profiles and independently checksummed invalid labor ledgers are rejected.

[Frozen v1 fixtures](../tests/fixtures/settlement-v1.json) were captured from pre-change commit `4415d085bdfd0010fb8041f4ab4d1c4537fd8fc9`. Six seed/week digests, RNG states, allocator states and event counts match exactly, including RIVERSIDE week 1,000. Saving at week 57 and resuming 80 weeks matches the frozen week-137 outcome. A real browser flow resumes both profiles before winter's final week, steps and saves them, checks the v2 Node digest and confirms v1 remains v1 with its original crop headline.

## Fixed-seed evidence

The [100-seed battery](evidence/phase1-balance-battery.json) uses RIVERSIDE and TERRAIN_000–098, all advanced through week 1,000 with complete-tick admission. Every run completes, all 100 digests differ, and no run has a shortage or extinction by that horizon. Week-1,000 population ranges 28–77, health is 100 throughout, food ranges 665–33,833, event counts 418–731 and canonical payloads 233,605–659,178 bytes.

Every first winter has zero crop harvest and consumes stored reserves: autumn-to-winter food decreases **190–265** across the 100 seeds, with health 100 at winter's end. This preserves viable starts while making preparation observable; it is still a forgiving early economy, not evidence that every start or later winter is safe. Finite timber and maintenance/demographic decline remain consequential.

The same ten seeds are measured under both profiles at weeks 0/12/24/36/48/96/240/480/1,000 in the [comparison report](evidence/phase1-balance-trajectories.json). No seed was selected for a dramatic outcome.

| Seed | Autumn food, both profiles | V1 winter food | V2 winter food | V2 reserve draw | V1 → V2 residents at week 1,000 | Observed trajectory |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| RIVERSIDE | 1038 | 988 | 826 | 212 | 39 → 40 | Moderate growth with clear winter drawdown; local timber exhausted by week 1,000. |
| TERRAIN_000 | 990 | 921 | 779 | 211 | 47 → 47 | Lower first-year reserves remain viable; later storage/housing support growth. |
| TERRAIN_001 | 1164 | 1253 | 939 | 225 | 40 → 44 | V1 winter added reserves; v2 spends them, with later capacity expansion. |
| TERRAIN_002 | 1165 | 1067 | 940 | 225 | 52 → 56 | Early droughts remain survivable; later growth differs through ordinary resource eligibility. |
| TERRAIN_003 | 1561 | 1562 | 1332 | 229 | 40 → 46 | Strong autumn stock covers a dormant winter and later growth. |
| TERRAIN_004 | 1499 | 1476 | 1283 | 216 | 39 → 44 | Healthy reserves and moderate growth with winter production absent. |
| TERRAIN_005 | 768 | 645 | 535 | 233 | 32 → 32 | Lowest sampled winter stock; one-store capacity and finite timber constrain expansion. |
| TERRAIN_006 | 1163 | 1168 | 902 | 261 | 44 → 48 | Fast early growth increases winter demand; later fields/housing expand. |
| TERRAIN_007 | 1537 | 1560 | 1308 | 229 | 48 → 52 | V1 winter gained food; v2 spends reserves despite wet weather. |
| TERRAIN_008 | 1164 | 1074 | 939 | 225 | 32 → 32 | More modest housing/storage expansion still keeps the first winter viable. |

All ten remain healthy with no shortage starts through week 1,000. Winter's freed farm labor can also change construction/material use; the amendment does not merely subtract food from an otherwise fixed history. Reviewing the actual differences shows varied yields, growth and capacity constraints, but a human understandability/engagement study remains required.

## Recovery and verification

Controlled depleted phase inputs start with food 0 and health 50. P=1/2 allocate one forager, meet spring rations and improve health to 52 in the first week; the selected fixture histories remain alive and reach health 100 by week 96. P=4 reserves one forager and one field worker, initially has a two-ration deficit, then records shortage recovery and reaches health 100 by week 96. These fixtures demonstrate recovery capacity, not the prevalence of naturally depleted populations or guaranteed survival across seeds. The legacy all-field starvation fixture remains explicitly tested as v1 behavior.

Local verification passed:

- `npm run check`: formatting, strict types, 26-module boundaries, **114 core tests** and production build. The full suite took 442.85 seconds; the 100-seed segment took 313.18 seconds during concurrent work. Timings are observational and excluded from canonical state.
- `npm run test:browser`: **84 checks** across Chromium 156.0.8078.4, Firefox 157.0 and Playwright WebKit 27.2, including new/legacy winter save/resume and existing ownership, rollback, visibility, navigation, accessibility and parity coverage.
- The 10,000-week v2 RIVERSIDE test retains natural extinction, ruins and the complete archive; stepping the extinct world does not consume demographic draws or revive it. JSON 57+80 continuity and chunked advancement remain equal.
- `npm run benchmark:balance`: same ten seed trajectories for both profiles, with the raw artifact above.

Reproduce the reports with:

```sh
STORY_GENERATOR_REPORT=/tmp/settlement-report.json npm test
npm run benchmark:balance
```

[Desktop](evidence/phase1-winter-desktop.png) and [phone](evidence/phase1-winter-phone.png) screenshots capture the actual v2 RIVERSIDE world at week 48, including dormant map plots and the factual winter record. Desktop labor inspection is expanded. These are functional engineering evidence using temporary drawings, not selected-art comparison or physical-device acceptance. Local browser dependency/profile accommodations follow the foundation verification record.

## Remaining first-playable work

Recover the exact selected art references and compare actual source density; functional aggregate resident representation is complete in [PHASE1_POPULATION.md](PHASE1_POPULATION.md). Obtain physical Android/installed Safari evidence and a human viewer review. D-024 selects eight-week autosaves with a two-active-minute 1x trigger; broader storage/device acceptance remains open. V1 desktop storage/crash measurements are historical evidence; no new v2 physical-device or isolated peak-memory benchmark is claimed here. Keep 1.20/1.21 and the visual/storage experience gates open until their missing evidence exists, before entering P2.
