# P1 geography and founding — candidate contract v0.1

**PROPOSED / UNVALIDATED.** This is a deterministic generation specification for review, not accepted terrain tuning, implemented code or test evidence. Phase 0 remains open. It complements [PHASE1_RULES.md](PHASE1_RULES.md) and [TECHNICAL_CONTRACT.md](TECHNICAL_CONTRACT.md); it does not authorize scaffolding.

The user-approved settlement-first scope and simple original art direction remain unchanged. Human-shaped resident sprites are presentation of aggregate P1 population, not named agents. Geography determines tiles/resources; sprite detail cannot change generation. Meaningful seasonal preparation and pause while away are user-confirmed; their exact mechanics/scheduling contracts live in the companion specifications.

## Configuration and parameter bounds

| Parameter | Candidate default | Accepted configuration bounds |
| --- | --- | --- |
| Logical width / height | 64 / 40 tiles | Exactly 64 / 40 for P1; other dimensions rejected |
| Lattice spacing `S` | 4 tiles | Exactly 4 in this generator version |
| Lattice samples | Integers 0–1000 inclusive | Fixed range |
| Water cutoff `waterMax` | 350 | Integer 100–450 |
| Rock cutoff `rockMin` | 850 | Integer 750–950 |
| Forest cutoff `forestMin` | 580 | Integer 400–800 |
| Fertility | Integer 25–100 | Derived below; never independently randomized |
| Working footprint radius | Chebyshev distance 6 | Exactly 6; connected subset, not automatic access to the whole square |
| Maximum complete attempts | 8 | Exactly 8; no unbounded retries |
| Start requirements | 18 grass, including ≥4 fertility-75 grass; ≥8 woodland | Fixed minimums from PHASE1_RULES.md |

Every value is part of the versioned configuration. Invalid configuration fails before consuming RNG or mutating the current world. P1 exposes a seed, not terrain sliders; bounded parameters support internal fixtures/tuning rather than a new UI commitment. No parameter is adjusted automatically when generation fails.

## Integer terrain construction

Use only the exact `terrain` stream specified in the technical contract. Leave `weather`, `mortality` and `birth` untouched. Each attempt continues the terrain stream from the preceding attempt; never reseed it, use a browser clock or introduce hidden stream names.

For a uniform integer in `[lo,hi]`, set `k=hi−lo+1` and `limit=floor(4294967296/k)×k`; draw unsigned 32-bit words until `r<limit`, then return `lo+(r mod k)`. Consume at least one word even when `k=1`. This fixes rejection behavior and draw consumption for lattice samples and anchor choice.

1. Allocate three lattices named elevation, moisture and canopy, in that order. Each is 17 columns × 11 rows: `ceil((dimension−1)/S)+1` nodes per dimension. For each lattice, draw a uniform integer 0–1000 for every node in row-major order using the contract's rejection sampler. Generate all nodes even if a later start check will fail.
2. For every tile `(x,y)` in row-major order, set `i=floor(x/S)`, `j=floor(y/S)`, `u=x mod S`, `v=y mod S`. For each lattice with surrounding node values `a=L[j,i]`, `b=L[j,i+1]`, `c=L[j+1,i]`, `d=L[j+1,i+1]`, interpolate:
   `value=floor((a×(S−u)×(S−v)+b×u×(S−v)+c×(S−u)×v+d×u×v)/(S×S))`.
3. Store the three resulting integer values as `elevation`, `moisture` and `canopy`. Store `fertility=25+floor(75×moisture/1000)` on every tile; fertility is usable only on grass/fields. The interpolation numerator is at most 16,000 and the fertility multiplication at most 75,000; both remain exact safe integers.
4. Assign exactly one immutable base terrain, testing in this order: water when `elevation<waterMax`; rock when `elevation≥rockMin`; woodland when `canopy≥forestMin`; otherwise grass. Equality at `waterMax` is land. Water overrides canopy; rock overrides woodland.
5. Water is impassable. Grass, woodland and rock are traversable land for the founding connectivity test; rock supplies no building site/resource in P1. No slope/pathfinding cost, river carving, erosion, biome library or noise dependency is implied.

This interpolation produces correlated patches using integer arithmetic. It is a candidate visual/geographic distribution, not a claim of realistic terrain. Land/water fractions, fertility diversity and success rate must be measured before accepting the cutoffs. Renderer shoreline variants use tile data only and do not consume simulation RNG.

## Deterministic valid-start search

1. Enumerate every grass tile as a candidate anchor in `(y,x)` order. The anchor is a settlement coordinate, not an additional occupied building tile.
2. For each anchor, restrict traversal to in-bounds tiles within Chebyshev distance 6. Flood-fill traversable land from the anchor using cardinal neighbors in north, east, south, west order, FIFO queue, marking visited when enqueued. A diagonal touch alone does not grant access. Sort the completed footprint by `(y,x)` for all later use.
3. Count grass and woodland inside that footprint. A start is valid only with at least 18 distinct grass tiles, at least four of those with fertility ≥75, and at least eight woodland tiles. Rock and water cannot satisfy these counts. The footprint is fixed thereafter; construction does not sever abstract access and no P1 action expands it.
4. Collect all valid anchors in the enumeration order. If there is at least one, draw one uniform index into this list from `terrain` and choose that anchor. Even a single valid anchor consumes one uniform-choice operation. Do not favor the earliest/most fertile start or retry merely to improve its score.
5. Reserve the first four fertility-75-or-higher grass tiles in footprint order as fields. Remove them from the placement candidate list. Place five huts, then one store on the first six remaining grass tiles. At least eight unoccupied grass tiles remain. Each placement occupies exactly one tile; the settlement anchor itself can coincide with a building because settlement identity does not occupy a tile.

The selection therefore conditions the map on a viable founding inventory, not on later success. Different seeds can select different terrain, fertility and available expansion sites. There is no identical starter clearing stamped into each world, protected fertile patch or hidden favorable-weather override. Accepted maps may contain disconnected islands and unusable terrain outside the footprint.

## Bounded retries, failure and world replacement

- If an attempt has no valid anchor, discard its draft map and run the next complete attempt with unchanged parameters and continued `terrain` state. Consume no anchor-choice draw on an empty candidate list. Record diagnostic attempt counts outside the world until generation succeeds.
- After eight failures, return a typed `NO_VALID_START` result with seed, config and attempt count. The UI can suggest another seed; it cannot silently alter the seed/config, carve land, substitute a template or create a partial settlement. Retrying the same inputs deliberately reproduces the same failure.
- The retry sequence is the only proposed fallback. Invalid-configuration and allocation/validation errors are separate errors, not reasons to keep drawing until a map passes.
- Generation runs in an isolated draft. Failure leaves the current world, active RNG, ID counters and saved slot unchanged. Success publishes a validated tick-0 world only after the normal New World replacement choice; saving follows the atomic persistence contract. Terrain generation never overwrites a valid local save on its own.
- At most eight complete maps of 2,560 tiles and 2,560 bounded footprint searches per map are evaluated. A footprint visits at most 169 tiles. Do not terminate by elapsed time or device speed; yielding work to keep UI responsive must preserve this operation order.

## IDs, resources and provenance

- Assign accepted tile IDs `1+y×64+x`; reserve this range before allocating entities. Allocate settlement ID 2561, then four field IDs, five hut IDs and the store ID in placement order; next entity ID is 2572. Event IDs use their separate typed monotonic counter. Rejected drafts allocate no persistent entity/event IDs.
- Persist generator version, complete config, accepted attempt index (1–8), accepted anchor, sorted footprint, tile data, placements and post-generation terrain RNG state. Save all four named RNG streams; no runtime regeneration substitutes for restored authoritative terrain/state.
- Initialize accessible woodland stocks to 20 wood and unoccupied footprint grass stocks to six forage rations. Occupied grass starts with zero forage; fields start with crop numerator zero. Outside-footprint terrain is visible but has no accessible resource stock or autonomous source regrowth in P1. Inside-footprint source depletion never changes base terrain or access.
- Initial buildings and inventory are endowments under the mechanics contract. Do not charge construction costs or record founding grass clearance as a simulated loss: the founding ledger begins after placements. Later occupation/regrowth/removal follows the ordinary mechanics ledger.
- Founding emits the single tick-0 event with settlement ID, anchor, founder/endowment facts and geography provenance. It must not invent past clearing, travel, disasters or individual biographies.

## Required headless fixtures and acceptance evidence

These are future checks, not results. Fixtures may inject lattice/sample outputs to test failure branches; those test-only controls are not production presets or extra RNG streams.

| Fixture | Required assertion |
| --- | --- |
| Interpolation | At `u=v=0`, result equals `a`; four equal nodes retain that value; nodes 0/1000/1000/0 at `u=v=2` produce 500; last row/column have valid surrounding nodes |
| Class boundaries | Elevation 349/350 and 849/850 follow default cutoffs; canopy 579/580 splits grass/woodland; moisture 0/1000 yields fertility 25/100 |
| Water / unsuitable ground | All-water, all-rock, no woodland and no fertility-75 grass each fail after exactly eight attempts; no partial world or current-world mutation |
| Connectivity | Diagonal-only woodland does not count; paths outside radius cannot grant access; edge anchors use clipped in-bounds footprints |
| Exact valid footprint | Eighteen grass, four suitably fertile and eight woodland pass; reducing any requirement fails; reserved fields survive hut/store placement |
| Retry sequence | Inject failures then success; verify accepted attempt index, RNG consumption and repeatable selected anchor; eight failures terminate |
| Identity / ledger | IDs, ten unique occupied sites, eight spare grass, full accessible sources, zero occupied forage and initial food/wood ledger agree with PHASE1_RULES.md |
| Stream isolation | Generation changes only terrain RNG; first weather/mortality/birth draws match an independently initialized run |
| Replay / restore | Equal seed/config/version gives identical accepted world or failure, Node/browser digests and restored terrain/footprint/allocator state |
| Seed battery | Fixed 100-seed batch reports success/failure rate, attempt distribution, water/woodland fractions, founder fertility and footprint sizes; inspect differing accepted maps visually |

Proposed acceptance target: at least 95 of the fixed 100 default-config seeds generate within the bound, while every seed returns deterministically without crashing. This target is unmeasured; failure requires revising/reviewing the generator distribution or explicit viability requirements, not a concealed favorable seed list. Final visual approval remains separate from geographic validity and future economic balance.
