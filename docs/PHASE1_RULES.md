# P1 settlement mechanics — candidate contract v0.1

**PROPOSED / UNVALIDATED.** This is a reviewable numeric starting point, not accepted tuning, implementation approval, or test evidence. Phase 0 remains open. Applies only to the aggregate single-settlement P1 described in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). The user confirmed settlement-first P1, named individuals in P2, and an unhurried normal-speed target of roughly 10–15 minutes per simulated year. Exact constants below remain proposals. No disease, migration, disasters, magic, player commands or forced narrative arcs are introduced here.

The arithmetic examples establish dimensional consistency only. A versioned configuration must contain every constant below; changing one changes the simulation version/config digest. Companion geography, determinism, persistence and archive contracts must close the remaining [PLAN_REVIEW.md](PLAN_REVIEW.md) checklist before implementation.

## Units and authoritative state

| Quantity | Candidate definition |
| --- | --- |
| Tick/calendar | One simulation day; 30 days/season, four seasons/year, 120 days/year. Tick 0 is founding; days 1–30 are the first season. Proposed 1x schedules one day per six wall-clock seconds: 12 minutes/year, within the confirmed 10–15-minute target. 4x/16x only schedule more identical ticks. |
| Food | One integer ration feeds one resident for one day. No fractional rations or different food types. |
| Materials/work | One integer wood unit; one worker-day is one integer work unit. Idle labor expires each day. |
| People | Integer population `N`; households are a derived occupancy statistic `ceil(N/4)`, zero when `N=0`, without family identities. |
| Health | Settlement index `Q` from 0 to 100; describes aggregate nutritional/shelter stress, not individual diagnoses. |
| Structures | Persistent ID, type, tile, condition 0–12, construction progress/required work, paid wood; each occupies one tile. |
| Fields | Fertility 25–100 integer percent; accumulated integer crop numerator `A`, reset after each seasonal harvest. |
| Sources | Each accessible woodland tile has 0–20 wood; each accessible unoccupied grass tile has 0–6 forage rations. |

Also persist food/wood stores, seasonal weather, shortage/surplus flags, per-season ledger, previous harvest yield, tick, RNG streams, ID allocation and historical entity/location records. Household count is recomputed, never independently mutated. No hidden age cohorts, adult identities, travel or private household inventories exist in P1.

## Starting ledger and geography boundary

- Founding: `N=20`, households `5`, `Q=100`, food `900`, wood `60`, `previousHarvestGross=0`; five finished huts, four finished fields, one finished store; all condition `12`, fields `A=0`. These are explicit initial endowments, not historical construction events.
- Each hut shelters four; settlement food capacity is `300 + 900 × finished stores`; wood capacity is `200`, independent of buildings. Initial housing `20`, food capacity `1200`; no negative or already-overflowing founding inventory.
- All sites/sources are in a fixed connected land footprint within Chebyshev distance 6 of the settlement anchor. Accessibility is generated once; no worker pathfinding. Sort tiles by `(y,x)`. Construction accepts only unoccupied grass, fields additionally require fertility at least 50. Do not clear forests or expand the footprint in P1.
- Valid start requires ten distinct eligible building tiles (including four fields of fertility at least 75), eight additional eligible grass tiles for growth/foraging, and eight accessible woodland tiles. Sources start full. Reserve and place the four founding fields first, taking the first four fertility-at-least-75 grass tiles in `(y,x)` order; then place the five huts and finally the store on remaining eligible tiles in that same order. Huts/store cannot consume reserved field sites.
- The geography contract must specify bounded generation attempts/fallback and explicitly fail without creating a partial world when these conditions cannot be met. An all-water map is not repaired silently by these economic rules.

## Exact daily order and visibility

Advance from completed tick `t-1` to `t` transactionally. Each phase sees prior phases' changes below; internal loops read their stated input snapshots. Preserve phase-local ledger facts for events. No UI state is an input.

1. **Season opening** (`t=1,31,61,…`): draw weather for the new season; regenerate each woodland source by one wood, capped at 20. Every day regenerate each eligible forage tile by one ration, capped at six. A newly occupied tile loses its remaining forage, recorded as land-use loss.
2. **Work budget:** snapshot `N`; available workers `W=ceil(N/2)` if alive, otherwise zero. Snapshot finished structures. Allocate each worker at most once, using the priorities below. Harvest crop growth uses today's assigned workers and current seasonal weather.
3. **Work effects:** apply each allocation immediately in priority order: farming, foraging, repairs, then a project or needed wood collection as detailed below. Project payments/progress precede collection by leftover workers; newly collected wood is available for repairs/project starts tomorrow. Completion becomes a finished structure for capacity now, but cannot farm or receive another work assignment until tomorrow.
4. **Harvest** (`t mod 30=0`): convert every extant finished field's accumulated crop to food, in ID order. Reset crop accumulators. Aggregate gross yield, admitted food and overflow separately; set `previousHarvestGross` to this harvest's total gross yield, including zero. Capacity limits apply on every food addition.
5. **Consumption/health:** current population demands `N` rations; consume `min(food,N)`, record unmet demand. Update health by the formula below. Compute shortage transitions after consumption.
6. **Season-end demographics** (`t mod 30=0`): mortality, then births, using the pre-demographic population and post-consumption health/stores. Recompute households. New births first consume/work tomorrow.
7. **Year-end wear** (`t mod 120=0`): decrement every finished structure's condition by one, including today's completions; remove those reaching zero. Apply resulting housing/storage changes and capacity overflow. Ruins retain historical identity but release the tile for tomorrow. Crop still on a removed field is lost explicitly.
8. **Finalize:** detect surplus transition and extinction, close any seasonal ledger, increment the completed tick, append events in phase/emission order and assert invariants. Archive/storage limits must be checked before committing a tick; an uncommittable tick changes neither state nor RNG.

Zero population does not disable stepping, inspection or history. Calendar, weather, source regrowth and wear continue; labor, consumption and demographic draws stop, and population never revives spontaneously.

## Food and weather

- Season-opening weather draws one uniform integer `u∈[0,999]`: drought if `u<150` (25% production), ordinary if `150≤u<850` (100%), favorable otherwise (125%). Each season draws independently; no pity timer. Seasons are calendar labels in this minimal candidate; all four support crops, with no separate winter multiplier.
- One worker per finished field per day adds `8 × fertility × weatherPercent` to its crop numerator `A`. At harvest, yield is `floor(A/10000)` rations; discard the remaining fractional numerator and record it. Unworked fields add zero; crops neither grow nor rot between work days. This is an abstract tended-crop model, not agronomy.
- Food addition admits `min(amount, capacity-food)` and records the remainder as overflow loss. No storage spoilage in this candidate; finite capacity supplies the only storage loss. No seed-food charge.
- If food before today's consumption is below `7N`, remaining workers forage before maintenance/construction. One worker takes up to two available rations, visiting eligible sources in tile order; withdraw exactly the amount added or lost to overflow. Stop assigning forage when food reaches `7N`, sources are exhausted or labor ends.
- Health: if `N>0`, let deficit be unmet daily rations. If deficit is positive, subtract `ceil(10×deficit/N)`; otherwise add one. Then subtract one if `N>housing`. Clamp to `[0,100]`. Health does not reduce labor in P1, preventing an automatic health → lost work → hunger spiral. Housing never directly deletes residents.
- Emit shortage started on transition from zero to positive daily deficit and shortage ended on return to zero. At season end, one ledger reports ration demand, consumed food and unmet rations even if a shortage persisted throughout. Do not emit a headline each hungry day.

## Work, maintenance and autonomous building

Allocate available workers in this exact priority: farming within the reservation below; emergency foraging; repairs; then construction and wood collection. All unused workers are idle. For each action, availability is checked before allocation; no worker is reassigned after producing an effect.

- **Recovery reservation (proposed):** when `W≥2`, assign at most `W−1` workers to fields, one per field in ID order. The remaining worker is available to the subsequent priorities, so population loss cannot let extant fields monopolize all labor. When `W=1`, reserve that worker on odd ticks and allow farming on even ticks; when `W=0`, all allocations are zero. Reserved workers follow the ordinary nonfarm priorities and idle if none can act; do not silently reassign them to fields. This guarantees access to nonfarm work, not successful recovery when resources or food are absent.

- **Repair:** each structure with condition below 12 can receive at most one worker/day, ordered by `(condition,ID)`. Spend one stored wood and one worker to restore one condition point; without wood, skip it. If unrepaired damage remains, wood collection takes priority over new construction. Healthy settlements therefore need only ten wood/worker-days per year to maintain the founding buildings, versus eight wood regrown each season.
- **Gather:** one worker extracts up to two wood from sources in tile order, capped by stored-wood capacity; sources lose exactly the stored amount. Depleted sources yield nothing; there is no free construction. With no work project/repair need, collect only until stored wood reaches 60.
- **Project:** at most one unfinished building. Existing projects take priority over choosing a new one. A project pays its full wood cost and occupies its tile when started; progress never decays. Allocate at most two workers/day to it, stopping at required progress. Remaining workers may gather if wood is below 60. Unfinished buildings supply no housing/storage/crops and incur no wear.
- If there is no project, no unrepaired damage and at least one remaining worker, select the first eligible need below. If its costs or site are unavailable, do not start a lower-priority project that day; workers may gather. Retry next day. No demolition, cancellation, refunds or manual build orders in P1.

| Priority/type | Need evaluated after farming/foraging/repairs | Wood cost | Worker-days | Completed effect |
| --- | --- | --- | --- | --- |
| 1 hut | `housing < N+4` | 20 | 8 | +4 housing |
| 2 field | Ordinary full-season yield of current fields `< 36N` and field count `< ceil(N/2)` | 10 | 8 | Farmable tomorrow |
| 3 store | Food capacity `< 60N`, or last gross harvest exceeds capacity | 30 | 12 | +900 food capacity |

For the field-need estimate use `Σ floor(8×30×fertility/100)` over finished fields, assuming ordinary weather and full staffing; it is a planning estimate, not granted food. Site order is `(y,x)`; type priority precedes site choice. Starting a project clears its site's forage stock as an explicit loss. Population decline can leave too many fields for labor; ascending IDs receive the bounded farming allocation first. No RNG is used for labor/build choices.

Wear events record condition changes in one annual settlement record, with affected IDs and before/after values; removals and completions are separate events. Repair/gather quantities appear in the seasonal ledger, not daily headlines. Zero-condition removal refunds no wood. Storage loss immediately discards excess food; lost housing affects health from tomorrow because wear follows today's health phase.

## Aggregate demographic contract

At each season end with pre-demographic `N>0`:

1. Snapshot `N`, `Q`, housing and food. Set death threshold `d=5 + (Q<40 ? 50 : 0) + (todayUnmet>0 ? 50 : 0)` out of 1000. Draw exactly `N` independent uniform integers `[0,999]` from the mortality stream; each value below `d` is one aggregate death. Apply all deaths together. These are anonymous risk trials, not persistent people. Event facts distinguish background risk from measured hunger/stress; prose cannot claim a specific diagnosis.
2. Draw exactly the original `N` integers from the birth stream, including when births are ineligible. Births are eligible only if surviving population is at least two, `Q≥80`, and food is at least `30×survivors`. Candidate births equal draws below `10` (1% per original resident per season).
3. Admit `min(candidateBirths, max(0,housing-survivors), max(0,floor(food/30)-survivors))` births if eligible, otherwise zero. This preserves at least 30 stored rations per post-birth resident at this boundary; it does not reserve or deduct those rations. Emit aggregate births/deaths only for nonzero changes, then recompute households.

No age distribution, pregnancy, pair matching, infant labor exclusion, departures or immigration in P1. `ceil(N/2)` is an aggregate workforce approximation, so births can affect the next day's workforce; this is a deliberate temporary limitation requiring review. Losses reduce future consumption immediately from the following day; possessions are shared, so deaths do not create/destroy inventory. At extinction, emit one event with last population change/cause reference; keep remaining stores and structures subject to ordinary capacity/wear rules.

## Canonical facts, events and invariants

- Every event includes persistent event ID, tick/phase, type, settlement/place IDs, immutable location, causal references where available, observed input facts, actual effects and importance. Founding emits once at tick 0; weather records each draw and multiplier even if unchanged; harvest records worked field-days, fertility/weather contributions, yield and overflow, including zero yield.
- Seasonal ledgers close after demographics/wear and include opening/closing population, resources and all resource flows. Include source regeneration/extraction, crop and land-use losses, building costs, repairs, consumed food and overflow so every stock balances. Weather/zero-yield records are observed facts, not fabricated changes.
- Surplus means `N>0` and closing food `≥45N`; emit only on entry, silently reset on exit. Founding initializes flags from its ledger. Shortage/surplus changes include the underlying numeric threshold and applicable harvest/consumption facts, not invented intent. Event presentation may group records; canonical records remain immutable.
- Population/stores/source stocks/work/progress are nonnegative integers; health and condition stay within bounds. Stored resources never exceed capacity. Household count is exactly `ceil(N/4)`. Housing may legitimately be below population. At most one structure/project occupies each tile; new IDs are never reused.
- Food closing = opening + admitted harvest/forage − consumption − capacity-loss; gross additions = admitted additions + immediate overflow. Wood closing = opening + extraction − repairs − project starts. Every allocated worker appears in exactly one activity; allocations sum to at most `W`.
- Same complete state/config/RNG yields the same tick. All percentages use integer numerators, flooring only where specified; never round through floating-point probability. Stable structure order is numeric ID order. Uniform draws, stream algorithms, canonical digests and bounded arithmetic need the companion determinism contract.

## Worked boundary and recovery examples (arithmetic, not a simulated test)

**Ordinary harvest:** hold population at 20, four fertility-75 fields staffed for all 30 days, weather 100%, no overflow/forage/other food flows. Each field yields `floor(8×75×100×30/10000)=180`; total 720. Starting food 900, after days 1–29 consumption it is 320. Day 30 harvest brings food to 1040 (below capacity 1200), then consumption to 1020. Season balance: `900+720−600=1020`. Crop production exceeds consumption by 120, so the initial economy has no arithmetic starvation countdown.

**Construction on day 1:** ten workers allocate four to fields and two to a hut project. Pay 20 of 60 wood; remaining four workers can gather eight wood, ending at 48. Eight total work units complete the hut on day 4 if two/day remain available; housing becomes 24 that day. It does not multiply food production or create residents. Its site must be one of the spare grass tiles.

**Labor after decline:** with `N=8`, `W=4` and four extant fields, three workers farm and one can forage or maintain structures instead of all four being trapped in farming. With `N=2`, `W=1`, a 30-day ordinary season offers 15 farm days and 15 nonfarm days. One fertility-75 field yields `15×6=90` rations against seasonal demand `2×30=60`; the reserved days allow repairs or forage. Starting food 60, no demographic change and no food losses, closing food is at least 90, permitting later birth eligibility if health/housing also suffice. This is an arithmetic recovery fixture, not a guarantee against mortality/drought. The founding example is unchanged because its four fields fit within `W−1=9`.

**Drought season:** with the same fields/weather 25%, yield is 180. Starting at 900 and holding other food flows absent ends at `900+180−600=480`, with no starvation. This is a controlled ledger fixture, not a claim that the autonomous builder makes no other changes. A following ordinary season ends at `480+720−600=600`; emergency forage may improve this lower-bound example. Multiple droughts can deplete reserves; actual forage availability and demographic draws determine decline/recovery, not a scheduled catastrophe.

**Boundary population:** after the ordinary example, suppose mortality draws produce one death and birth draws produce one candidate. With housing 24 and health 100, survivors 19, food 1020, eligible births `min(1,5,34−19)=1`; population returns to 20 and households stay five. Both changes remain distinct canonical facts. Year-end wear then changes condition/capacity; an oldest store reaching zero would lower food capacity to 300 and discard 720, without revising the earlier harvest or birth facts.

## Evidence required and decisions still open

Before adopting this contract, review the proposed 120-day calendar/six-second tick against the confirmed watch-pace target, abstract four-season crops, proportional workforce and background demographic risk. Review the numeric thresholds as a set; they are not independently approved defaults. The aggregate-first phase boundary is user-confirmed; this does not imply approval of the demographic formulas.

After implementation is authorized: check each ledger above; insufficient wood/labor/sites, source exhaustion/regrowth, completion/harvest/wear on one boundary, population 0/1, starvation/recovery and storage loss fixtures; same-seed save/resume and browser/headless equality; then the plan's 100-seed batch and ten-seed qualitative review. Inspect stalls caused by field labor, impossible building needs and long drought runs before tuning. No claim of balanced longevity or interesting stories is justified until those results exist.
