# Spotlight opportunity expansion — proposed rule contract (v0.1)

**User requirement (approved intent):** Deliberately observing/following/tagging a person, family, town or kingdom should **widen the scope of possible stories they could experience**, not guarantee, force, or even favor a dramatic outcome by itself. Opportunities can be accepted, missed, refused, become impossible, fail, go unnoticed or produce small consequences. Unexpected tragedies and positive developments are both in scope.

**Design boundary:** The exact strength of the opportunity expansion, event families, caps and UI labels remain to be balanced and approved before implementation. This is not the parked manual "observer nudge" concept. The viewer does not select outcomes or command characters.

## Mechanism: broaden eligibility, retain agency

- The normal world-wide simulation has a **baseline eligible opportunity set** for everyone, whether watched or not.
- Deliberately giving a subject a **story spotlight** makes additional context-appropriate *opportunity families* eligible for evaluation over time. The extra families are **not event outcomes**, probability boosts to winning, or guaranteed scheduled arcs.
- Each opportunity has state-based prerequisites (resources, traits, relationships, location, occupation, institutions, prior events); it may present a genuine choice to an autonomous agent or society, or a possible external circumstance.
- Multiple possible agents/polities compete for limited people, resources and time; choosing one pursuit may preclude another, fail, or never start.
- Only **actual transitions** are logged as historical events. Unacted-on opportunities may expire silently or appear as a "missed chance" only if an actor actually encountered/considered it and the simulation recorded this fact.
- "Followed" does not imply protagonist privilege, plot armor, guaranteed survival, celebrity status or artificially high odds of success.
- Dark, tragic, quiet, cheerful, heroic, cruel, lawful and chaotic opportunities are available subject to **causes and context**. Do not impose a moral quota.
- Opportunistic richness may include mundane low-stakes episodes, unlikely relationship changes, moral choices, crimes and crises; not just catastrophe frequency.

## Critical distinction: inspect vs spotlight

- **Inspect/select/zoom/search/open chronicle**: visualization only; absolutely no effect on canonical state or RNG.
- **Explicit Story Spotlight / Track story (tag/bookmark in story mode)**: a deliberate choice to expand eligibility for additional opportunity families, which **can affect future simulation state** even though the viewer never picks which opportunities are taken. UI must explain this before first activation, and visibly identify active spotlights.
- **Passive bookmarks** may remain a separate simple save/follow function if needed for historians who want to observe the unmodified seeded run. If the product uses one "Track" button for both, it must clearly disclose that tracking affects opportunities.
- **Observer nudges**: different, **parked** idea where a viewer intentionally steers or prompts a specific external change; do not implement under this plan.

This preserves the user's goal of a mostly observational experience while acknowledging that **deliberate story spotlighting modifies the possible simulation trajectory**. Do not claim tracked runs are unaffected by following.

## Deterministic replay contract

- **Untouched world** reproducible from seed + config + simulation version.
- **Story-spotlit world** reproducible from seed + config + simulation version **plus an ordered, timestamped spotlight-command log** (activate/deactivate and entity IDs), or a complete save snapshot that includes spotlight status and RNG state.
- Fixed tick updates only; no variable random consumption tied to camera position, selected UI tab, user display framerate or log filters.
- Opportunity evaluations use stable per-domain/subsystem PRNG streams or deterministic keys. Spotlight commands apply only at defined simulation tick boundaries.
- When all spotlights are off, normal baseline behavior applies. Turning one on does not invent a retroactive biography.
- Simulation version changes may change outcomes and should be disclosed in shared/replayed histories.

## Narrative divergence structure

```text
Subject state + history + environment
                  |
       eligible normal opportunities
                  |
       spotlight-specific families   <- only if deliberately spotlit
                  |
       suitability, prerequisites,
       competing needs and constraints
                  |
         proposal or temptation
            /    |     \
        ignored refused considered/attempted
                          /      \
                        fails    succeeds
                                  |
                 real state changes and history
```

Any branch can end in nothing noteworthy. Opportunities do not equal executed events.

## Illustrative eligible opportunities, not hardcoded quests

| Spotlight subject | Expanded possibility family | Conditions / potential response |
| --- | --- | --- |
| Person | mentorship, romance, betrayal, invention, moral compromise | requires compatible social ties, needs/resources, disposition and reachable circumstance; may decline or fail |
| Family | contested inheritance, refuge for outsiders, reconciliation, reputation crisis | requires intergenerational links, property, political/social pressures; may never escalate |
| Settlement | charitable network, black market, civic reforms, sectarian conflict, disaster recovery | requires resource/institution/social preconditions; policy or groups may resist |
| Kingdom | ideological movement, succession crisis, diplomatic opening, tyranny/reform, secession | requires legitimacy, leadership, factions, economic and regional causes; negotiation may succeed or fail |

Examples of possible results, not guaranteed arcs: a character refuses a chance at influence; a town avoids ruin by lucky cooperation; an aspiring tyrant dies anonymously; a kingdom opts not to invade; a helpful local reform unexpectedly triggers a bitter feud.

## Balancing the expanded opportunity space

- **Depth over frequency:** more *types* of eligible possibilities and longer possible causal chains, not simply more crises per minute.
- **No forced agency:** decision weights still rely on traits, goals, relationships, ethics, knowledge, risk and material constraints.
- **No mandatory polar extremes:** injustice, generosity, cruelty, peace and chaos can happen; don't guarantee all tones in every run.
- **Bounded spotlight slots:** proposal to cap simultaneous spotlight subjects and per-period extra candidate evaluations for performance and world coherence; values to set in future design.
- **Preserve meaningful unattended world:** unspotlit entities remain active and can produce important stories. Spotlight should enrich selected accounts, not hollow out the rest of the world.
- **No guaranteed spotlight outcome:** tests assert eligible alternative types exist when prerequisites hold, **not** that any given narrative arc occurs.

## Implementation placement (future milestones)

- **Phase 1:** seed/version/event IDs; log event types, causes and entity links; no story spotlight eligibility logic.
- **Phase 2:** person/family spotlight activation record and a small, bounded set of additional eligible opportunities with autonomous acceptance/decline/failure.
- **Phase 3:** settlement spotlight families tied to economics, laws and relationships.
- **Phase 4:** kingdoms/polities, nested references, opportunity interactions across world scales.
- **Phase 5:** explanation of spotlight command history and outcomes in replay/historian views.
- **Phase 6:** balance variety across seeds and ensure performance/determinism/correspondence.

Exact spotlights to prioritize and chance strengths need simulation testing, not narrative quotas.

## Acceptance tests when implemented

1. For each subject scope, explicit activation changes eligibility of additional **valid** opportunity families in a controlled fixture.
2. Cases exist where eligible opportunities are declined, fail, expire, or are missed; none is guaranteed.
3. Changing camera/view/inspect, without activating a spotlight, has zero effect on event/state digest.
4. With the same ordered spotlight command log and same seed/version, entire state/event digest remains identical.
5. Opposite eligible outcomes for otherwise comparable subjects arise from grounded differences in state/preferences/resources; not "selected for drama".
6. The base world can produce material tragedy or joy without any spotlight.
7. Canonical chronicle never claims a hypothetical opportunity actually happened.
8. Long-run multi-seed balance does not turn every spotlit subject into a famous ruler or perpetual victim.

## Remaining design questions (NOT blockers for documenting the requirement)

- Should ordinary bookmark and active story spotlight be separate controls, or one informed "Track Story" action?
- How many spotlights can be active simultaneously at personal/town/kingdom scales?
- How large is the expanded eligibility set at each scale, and how is it tuned to avoid spam or becoming a nudge in disguise?

**This is an approved creative requirement with an engineering proposal, not an implemented mechanic or permission for immediate coding.**
