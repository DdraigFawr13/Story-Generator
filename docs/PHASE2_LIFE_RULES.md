# Individual settlement baseline — p2-settlement-v1

I.2 adds an internal advancing world with actual resident identities. New worlds use schema 3 and `p2-settlement-v1`; the P1 viewer remains unchanged until I.3 connects it. P1 v1/v2 and the founding-only P2 codec retain their formats. Numeric life rules are explicit engineering baselines for further balance and human review.

## Complete-week order

Keep v2 terrain, seasons, weather, resource costs, harvests, construction, repairs, decay and capacity accounting. The shared economic kernel uses a trusted P2 policy for person work, health, demographics and household accounting. No saved payload can supply that policy. Every week still admits or rejects state, all RNG streams, global IDs and archive together.

1. Draw seasonal weather.
2. Reserve eligible person work and opening materials, then record changed assignments.
3. Perform the existing field/foraging/gathering budgets and seasonal harvest.
4. Apply storage capacity, opening demand and seasonal spoilage.
5. Allocate individual rations and update health.
6. Complete reserved repairs/construction and seasonal removal.
7. Perform ordered person death/birth trials, handle extinction, then allocate actual homes and derive active households.
8. Record shortage/surplus transitions and publish the complete economic/person ledger.

## Work and care

Eligible economic workers are people aged 18 to below 60 with opening health at least 40. Each household with children below four reserves one eligible adult for care, preferring a known living parent and otherwise the lowest ID. This establishes care work, not adoption or inferred parenthood. An unattended young child receives a two-point weekly care penalty.

The economic workforce is the smaller of the existing v2 population-based workforce and remaining eligible adults. Assign field, foraging, repair, building, gathering and unused budgets to those people in ID order. Everyone else rests. Children and seniors have no economic assignment in this baseline. Care and economic assignments are exclusive. Protected foraging reserves at most the actual available workforce.

`activity` records the weekly assignment and target, not a permanent profession or guaranteed productive contribution. Excess reserved construction labor still idles when a project finishes, under the existing ledger. Radius-based gathering/foraging remain abstractions; no travel/pathfinding is implied. Traits are retained identity facts; they do not yet drive decisions. Grouped `work_changed` records report actual assignment changes, with previous/new activity and target references.

## Rations, health and homes

Each opening living person demands one food. Allocate consumed units in rotating ID order, starting at `(tick - 1) modulo opening population`, with at most one ration per person. Fed and housed people recover two health; a missed ration costs 20 and lack of shelter costs five. Subtract the care penalty when applicable, clamp each health to 0–100, and use the floor of the living mean for settlement health. Newborns first consume next week. The last-week ledger retains opening IDs, individual ration/home/care/health facts and actual worker/caregiver assignments.

After construction and demographics, retain valid occupied home slots, enforcing four living occupants per hut. Give remaining unhoused people free hut slots in ID order; otherwise they stay at the center. Record `home_changed` with actual prior/new home and tile. A household can occupy multiple huts; its primary home is the lowest-ID housed living member's home. Empty household identities retire but remain resolvable. The active count comes from living membership, rather than the P1 population approximation. This slice keeps the six founding households; forming/merging households belongs to later partnership/succession rules.

## Demographics and evidence

At season end, visit opening living people by ID, consuming one demographic draw in 0–999 each. Death threshold is `min(1000, 5 + floor((100-health)/2) + 2*max(0,floor(ageWeeks/48)-60))`; from age 100 it is 1000. The ledger and death record identify the actual victims, age, health, ration/housing/care facts, draw and threshold. The aggregate threshold field is the maximum individual threshold that week, zero when there are no trials. These are modeled risk inputs, never a medical diagnosis. Retain every deceased identity and its evidence.

All death draws precede conditional birth draws. A surviving person aged 18 to below 50 with health at least 70 and no recorded birth in the previous 48 weeks is eligible when opening rations were full and food after consumption/spoilage/removal covers six weeks per survivor. Visit eligible parents by ID and consume every eligible draw, even with no shelter room. Successes below 15 become births up to actual spare shelter capacity. Update the parent's last-birth tick only for a real birth.

Each newborn receives age zero, health 100, the parent's household/name and one **known** parent; the other is unknown. This is a simplified demographic model, not marriage, a complete reproductive model or retroactive kinship. Each birth consumes the global entity allocator and the independent resident stream for a given name and three traits. Choose a name unused by living/pending members of that household while available; after the authored pool is exhausted, repetition is allowed. Names may recur across generations; IDs distinguish people. Founders retain their recorded age at entry and unknown birth/parents.

Founding and birth records retain immutable identity facts, including traits; grouped births/deaths contain their real participants and immediate population changes. Home/work records retain every assignment change. No revival or protected hero is added. Extinction retains people, buildings, escrow and history, with no future labor/births; environment and decay continue.

## Validation and current evidence

Validate evolving state directly without regenerating a world from its seed. Check version/configuration, all RNG states, contiguous global IDs, event references/fields/phases, living census, active households, life/parent links, immutable entry facts, home capacity, assignment history, age/health eligibility and complete resource/person accounting. Validation caches are scoped by simulation version so a P2 record cannot bypass P1 shape checks.

Targeted tests cover saved continuation, controlled actual birth/death trials, parent birth spacing, child care, rotating partial rations, corrupt independently checksummed state, version isolation and whole-week limit rollback. A 100-seed first-year battery passes. The preliminary ten-seed 1,000-week sample retains 22–35 living people and real births/deaths. RIVERSIDE's 10,000-week run retains 35 total identities, 11 births, 35 deaths, a known grandchild chain and natural extinction; the archive is 1,305,828 bytes with 2,372 records. This is one long-run trajectory, not multi-seed centuries or human balance acceptance. Full regression/browser verification is recorded in the integration checkpoint before merge.

Permanent professions, age-specific food needs, injuries/sickness, partnerships, inheritance/guardianship, social memory, autonomous social choices and Spotlight commands remain subsequent P2 slices. Keep their acceptance steps open.
