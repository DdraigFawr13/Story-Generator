# P1 settlement rules — proposal v1.2

**Status:** implemented as the versioned `p1-settlement-v1` engineering baseline under D-020/D-021. All numbers remain provisional balance values; implementation is not final gameplay acceptance. [PHASE1_SETTLEMENT.md](PHASE1_SETTLEMENT.md) records actual forced fixtures, seed-battery results and remaining risks. The browser still shows founding-only terrain; storage and selected-art evidence remain open. Review alongside [local persistence](LOCAL_PERSISTENCE_CONTRACT.md), [architecture](ARCHITECTURE_REVIEW.md) and [implementation plan](IMPLEMENTATION_PLAN.md).

## Units and scope

One settlement; aggregate residents and household count; no named people, migration destinations, institutions, disease, magic or observer interventions. Departures are excluded from P1: population changes only through aggregate births and deaths.

| Quantity | Proposed unit/default |
| --- | --- |
| Tick | One week; 12 ticks/season; spring, summer, autumn, winter; 48 ticks/year |
| Terrain | 64 × 40 logical tiles, row-major index y × 64 + x |
| Food | One resident-week ration; whole units |
| Timber | Whole material units; no stone/metal economy |
| Labor | One worker-week; workforce floor(opening population / 2) |
| Population / households | Residents; households = ceil(population / 4), zero when extinct |
| Health | Settlement aggregate integer 0–100; initially 100 |
| Fertility | Integer 0–100 per tile; immutable in P1 |
| Founders | 24 residents, 6 households, 360 food, 40 timber |
| Initial structures | 6 huts, 2 fields, 1 store; one tile each |
| Shelter / storage | Hut: 4 residents; base food capacity 400 + 400 per store |
| Construction | Hut: 12 timber / 4 labor; field: 4 timber / 4 labor; store: 20 timber / 8 labor |
| Durability | Huts/stores: 100, lose 1 each season; fields do not decay |
| Work radius | Manhattan distance ≤ 8 from fixed settlement center |

Households are a display aggregate, not persistent kinship groups. Do not narrate marriages or family histories from that count. A field represents an abstract productive plot, not a literal one-tile farm footprint at real-world scale.

## Authoritative state and tick order

Persist tick, map (including immutable river-center metadata), settlement ID/center, population, health, food, timber, all structures and construction progress, seasonal field tended-week counters, current weather, all RNG streams and allocators, shortage/surplus transition flags, canonical events and historical entity records. Persist the current season's weather-event reference and each field's creation reference for causal lookup. No authoritative state may live only in a closure or UI component.

Tick zero is founding before the first week of spring. For candidate tick t ≥ 1, season index is floor((t−1)/12) mod 4 and year is floor((t−1)/48)+1. The boundary is t mod 12 = 0. The UI labels the last processed week; at zero display "Founding — before spring."

Each candidate tick executes these phases in this exact order:

1. **Environment:** on weeks 1, 13, 25, 37, etc., draw and store weather for the new season.
2. **Opening budgets:** snapshot opening population P and workforce W = floor(P/2). Allocate labor as below; no later births/deaths change this tick's budget.
3. **Production:** tend fields, forage, gather timber; at season end harvest all fields and reset their counters.
4. **Food:** apply capacity overflow, consume min(food, P), then spoil floor(remaining food/100) on season boundaries only.
5. **Health:** update from this tick's ration deficit and opening shelter capacity.
6. **Construction/maintenance:** perform reserved work, complete structures, then apply seasonal decay/removal. New capacity cannot retroactively retain food already lost this tick.
7. **Demographics:** on a season boundary resolve deaths, then births, then recompute households.
8. **Evidence/admission:** finish records, check invariants and persistence event/byte limits, commit the whole tick or reject it in full.

Rule effects within a phase are visible to later phases. Every event records its own immediate before/after values. Rejection restores RNG, counters, IDs and pending records as well as resources. No renderer or storage clock changes this order.

## Geography and valid founding

The proposed [deterministic terrain contract](TERRAIN_CONTRACT.md) now owns exact geography generation, founding-site ranking and fallback. It supersedes independent per-tile elevation/forest rolls and the fixed center fallback.

Generate three integer-interpolated 9 × 6 lattices and a cardinally connected three-tile river on the 64 × 40 map using the terrain stream only. Founding selects a dry 3 × 3 grass patch with at least two fertile field tiles, ranking by river distance, map-anchor distance and tile index. Candidate centers keep a radius-eight margin. Forest on the founding patch is cleared with explicit discarded-timber accounting; it does not increase starting stock.

If no naturally valid patch exists, prepare the highest-ranked dry patch without changing river tiles. Invalid all-water input is rejected, replacing the earlier all-water carving fixture. Preserve original patch values and fallback facts. See the terrain contract for exact thresholds, RNG draw order, interpolation, river metadata and generation fixtures.

Assign fields/store/huts and IDs under that contract; founding remains an endowment rather than unpaid gameplay construction. Generated name remains "Settlement x-y" from center coordinates, with no simulation RNG used for presentation names. Forest outside the patch is finite and seed-derived, with no guaranteed long-term timber.

## Labor, food and materials

At opening, reserve workers in this priority order:

1. One worker for each completed field, sorted by entity ID, while labor remains.
2. Up to ceil(P/4) foragers from remaining workers.
3. Up to two maintenance workers if an opening hut/store has durability ≤ 75 and opening timber ≥ 1.
4. Up to two construction workers if a project exists, or a new eligible project can be paid from opening timber.
5. Up to two timber gatherers from remaining workers, provided harvestable forest exists in radius.

Reservations are exclusive. Unused or blocked workers idle; do not reassign mid-tick. Maintenance and construction never spend timber gathered later that same tick: reserve their material at opening as specified below. Reserved material remains part of the conservation ledger.

Each allocated field gains one tended week, capped at 12. Each forager produces 2 food in spring/summer/autumn and 1 in winter; this is an abstract renewable local food source with no persisted depletion in P1. Foraging requires P > 0 but no particular map tile. Document that simplification in the inspector.

Each timber gatherer removes up to 3 units from eligible forest tiles ordered by tile index, continuing across tiles until its allowance or the available supply is exhausted. In P1, eligible means unoccupied forest at Manhattan distance ≤ 8 from the center with positive timber; intervening water/rock does not block gathering. This is abstract radius-based work, not pathfinding or simulated travel. Describe the abstraction in the inspector. Timber removed equals timber gained. At zero stock, a forest tile becomes cleared grass; no timber regrowth occurs. Occupied tiles cannot be forest.

At season start draw weather uniform in 0..99: 0–19 drought (multiplier 500), 20–79 normal (1000), 80–99 wet (1200). Seasonal crop multiplier is spring 1000, summer 1200, autumn 1000, winter 400. At the final week, a field yields:

floor(240 × fertility × weatherMultiplier × seasonMultiplier × tendedWeeks / (100 × 1000 × 1000 × 12)).

All multiplication intermediates fit safe integers at these bounds. Fields completed this week first receive labor next week. Every completed field resets its counter after harvest, including fields with zero labor/yield. Emit one settlement harvest record with per-field inputs/yields, including zero yields as factual harvest reports.

Pool production into food; discard max(0, food−openingCapacity) as recorded overflow. Demand equals opening P. Record shortfall = P−consumed. Food never goes negative; no debt rations. On seasonal boundaries spoil floor(post-consumption food/100).

**Ledger:** closing food = opening food + foraging + harvest − production overflow − consumed − spoilage − any post-demolition overflow. Closing timber = opening timber + gathered − maintenance spent − new project escrow; project escrow is tracked separately and burned on completion, never charged twice.

## Health and demographic outcomes

Let deficit be this tick's ration shortfall and unhoused = max(0, P−openingShelterCapacity). Health changes by +2 if deficit=0 and unhoused=0; otherwise subtract ceil(20×deficit/max(1,P)) + ceil(5×unhoused/max(1,P)). Clamp to 0..100. At P=0 keep health at zero.

At season end, for each opening resident index 0..P−1, draw one uniform 0..999 from the demographic stream. A death occurs if draw < 5 + floor((100−health)/2). Aggregate deaths; survivors S = P−deaths.

Birth eligibility requires S > 0, health ≥ 70, this tick's deficit = 0, and food after consumption/spoilage ≥ 6×S. Use shelter capacity after construction/removal. For each survivor index 0..S−1, draw one uniform 0..999 only when eligibility holds; count successes < 15. Births = min(successes, max(0, shelterCapacity−S)). Consume all S draws even if shelter room is zero. New population = S+births; newborns first consume next tick.

No age model is implied. Death events say aggregate deaths and list modeled health/ration/housing inputs; they must not invent a diagnosis or claim starvation caused the baseline component. Births are an aggregate approximation, not individual parentage.

If population reaches zero, emit extinction once, set health=0, retain terrain, ruins and history, and clear transition flags. No spontaneous revival. Subsequent steps still advance environment/decay and record actual changes, but allocate no labor, production or demographics. Fields cannot yield from earlier accumulated labor after extinction: discard/reset their counters at extinction and record abandoned crop work. An unfinished project retains its tile, identity, progress and escrow after extinction; no workers complete it and no material is refunded. Play/pause/step/save/inspection remain available.

## Building policy, maintenance and decay

One construction project at a time. A project occupies its chosen tile immediately. Opening population must be positive. Choose a new project only if no project exists, using the first affordable, site-eligible need below:

1. Hut when shelterCapacity < P+4.
2. Field when completed+in-progress field count < ceil(P/8).
3. Store when food ≥ floor(3×foodCapacity/4).

Within a type, choose the lowest-index unoccupied, cleared grass tile in radius; fields require fertility ≥ 50. No legal site/material/workers means no new project. No automatic deforestation for a site; gathering may clear one. Escrow the entire material cost once when starting, and emit construction_started with cost/location. No cancellation or refunds in P1.

Each reserved construction worker adds one progress unit. Complete at the required total; excess labor idles. A completed hut/store starts with 100 durability; field counter starts at zero. Allocate a building entity ID when its project starts, register its identity/location immediately, and keep that same ID on completion and removal. Initial structures reference the founding event; constructed fields reference their construction-completed event for future harvest causes. New buildings join the persistent registry and remain historically resolvable after removal.

Maintenance targets huts/stores with durability ≤ 75, sorted by durability ascending then ID. For each of up to two reserved workers, reserve one opening timber if available and choose the currently lowest-durability eligible target after prior planned repair. One timber/worker restores 10 durability, capped at 100. Do not reserve a worker without a payable repair. After reserving maintenance costs, construction affordability uses the remaining opening timber.

On each season boundary all completed huts/stores, including newly completed ones, lose 1 durability. At zero remove them, release their tiles, preserve historical identity/location, and emit building_removed. If food exceeds the resulting lower storage capacity, discard that overflow immediately with a separate loss record. Reduced shelter affects health next tick, but affects birth room this tick. In-progress projects do not decay. Fields persist until a later approved removal rule.

**Fixture:** opening timber 12, hut need, damaged store at 75: reserve 1 timber for repair; remaining 11 cannot start a 12-timber hut. Later gathering cannot bypass that check. The repair leaves durability 85, or 84 at a season boundary.

## Determinism contract

Proposed algorithm: xorshift32-v1 with nonzero unsigned 32-bit state. For each draw apply x ^= x<<13; x ^= x>>>17; x ^= x<<5; normalize unsigned after the sequence. Use fixed-width bitwise semantics, not floating-point randomness.

Seed input: 1–64 ASCII characters matching [A-Za-z0-9_-]; reject other strings without trimming, case folding or Unicode normalization. Derive each stream from UTF-8(seed + ":" + streamName) using FNV-1a 32-bit: start 2166136261, XOR each byte, multiply by 16777619 using low-32-bit integer multiplication. Replace a zero hash with 1. Streams: terrain, weather, demographics. Save each complete current state; never derive fresh states on resume.

For uniform integer in 0..n−1, treat raw generator output minus one as u in 0..4294967294; reject u ≥ floor(4294967295/n)×n, otherwise return u mod n. xorshift32 never returns zero, so using a 2^32 rejection range would be incorrect. Persist state after every accepted/rejected draw.

All non-RNG arithmetic is safe integer arithmetic; positive ratios use floor except explicit ceil. Config is a complete immutable versioned record; P1 exposes seed only, with numeric settings developer fixtures rather than user sliders. Reject unsupported config values before advancing.

Allocate monotonically increasing numeric IDs from separate entity and event counters starting at 1; no reuse. Tiles use their fixed row-major indices. Assign settlement first, then initial buildings in tile order. Iterate entities by numeric ID unless a rule explicitly gives another ordering. RNG trials use aggregate index, never UI iteration order.

Canonical payload encoding follows the persistence proposal, with the ASCII seed rule here resolving its seed-normalization question. Operational metadata, camera state, selected IDs, localization and wall time are excluded. Hash UTF-8 canonical bytes using SHA-256. Rule changes require rulesVersion and simulationVersion changes; existing saves are rejected unless an explicit later migration exists.

## Chronicle rules

Events contain ID, tick, phase, type, settlement/entity IDs, location, causal event IDs, numeric facts and immediate state effects. IDs allocate in phase order; within a phase use the processing orders above. Preserve immutable historical identities after demolition/extinction.

Emit founding; seasonal weather; settlement harvest; food overflow/spoilage when positive; shortage_started/recovered on deficit-positive transitions; surplus_started/ended on transitions across post-tick food ≥ 12×max(1,population), only while population > 0; construction start/completion; positive seasonal aggregate maintenance/decay summaries; building removal; positive births/deaths; extinction. Maintenance off a season boundary also gets a per-tick aggregate summary when positive. Ordinary foraging/consumption and unchanged shortage ticks update state without forcing headlines.

For first tick transition flags start false. Extinction uses its own record instead of shortage recovery/surplus-ended claims. Final transition events occur after demographics and include their exact criterion; shortages are based on opening demand even if population later changes.

Harvest references current seasonal weather and field creation records. Demographics record health, shortfall, eligible population and draw-success counts; include direct ration facts. Shortage transition records are emitted in phase 8, after demographic records in phase 7, so demographics must not reference that later event. A cause ID may reference only a record already emitted with a lower event ID, including earlier phases of this tick; never preallocate a future record to create a causal link. Do not manufacture a cause link where only correlation is known. Canonical records need not enumerate every mutation; full snapshots remain necessary.

## Worked resource fixtures

These are hand-calculated rule fixtures, not simulated playthroughs. Unless stated, no demolition or new capacity occurs.

- **Normal spring boundary:** P=24, opening food=100, two fields fertility 75, normal weather, 12 tended weeks each; six foragers produce 12. Each field yields 180. With capacity 800: 100+12+360−0−24−4 spoilage = **444 food**. Health stays 100 if housed. Workforce 12 covers 2 fields+6 foragers+up to 2 builders+2 gatherers without duplication.
- **Drought spring boundary:** same inputs, multiplier 500: fields yield 90 each; 100+12+180−24−2 spoilage = **266 food**. Lower reserves arise directly from weather.
- **Winter shortage:** P=24, opening food=0, six foragers, no harvest this week: production 6, consumption 6, deficit 18, closing food 0. Fully housed health 100 falls by ceil(20×18/24)=15 to **85**. No death roll occurs until a season boundary.
- **Capacity:** food 790 plus 30 production with capacity 800 loses 20, then consumes 24, leaving 776 on a non-boundary tick.
- **Construction:** an escrowed hut with progress 3 receives two workers: progress completes at 4; one labor unit idles; no second charge for timber; shelter rises by four.
- **Extinction boundary:** P=1, health=0, demographic draw below 55 yields one death; S=0 means no birth draws. Record extinction and preserve the saved RNG state.

## Review and implementation evidence

Before approval, decide whether weekly ticks, seasonal harvests, finite timber, abstract renewable foraging, aggregate health/demographics and fallback founding represent the intended first playable. Those are product choices, not experimentally validated balance.

After engineering authorization, implement ledger/invariant tests, deterministic Node/browser vectors, seed/hash/RNG golden fixtures, forced weather/shortage/occupancy/extinction fixtures, save restoration at phase boundaries, and candidate-tick rollback. Test 100 fixed seeds to 1,000 ticks; benchmark 10,000 ticks under the persistence budgets; qualitatively review ten seeds without special-casing them.

Explicit tuning risks: finite timber may produce eventual maintenance decline; foraging may stabilize low populations; crop labor and fertility may create self-reinforcing growth/decline. Adjust only from multi-seed evidence and version the rule change. A successful arithmetic fixture does not prove a compelling or balanced world.

No Phase 0 checkbox is closed by this draft. Architecture decision records and desktop/phone visual evidence remain separate work.

## Engineering clarification in p1-settlement-v1

Construction start is a phase 2 event: its tile/ID and opening-timber escrow become authoritative when labor/material reservations are made. Work, completion, repairs and removal occur in phase 6. This makes event order agree with actual resource changes; gathering later in the tick cannot finance an opening reservation. Fields first receive labor the week after completion. Removal-caused capacity losses cite the removal event; extinction cites the already-emitted deaths record. The full last-tick labor/resource ledger is part of schema 2's authoritative state, alongside the archive.
