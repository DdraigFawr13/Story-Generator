# Narrative divergence, moral range, and multi-scale spotlight (design brief v1)

**Status:** user-approved goals and clarification: deliberately spotlighted people, families, towns and kingdoms should have a **wider set of possible opportunities**, not guaranteed outcomes. The exact expansion mechanism and controls are subject to review. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md). No game code has been authorized or implemented.

## Core objective

The viewer should be able to become attached to an individual, family, settlement, or faction and witness multiple plausible futures, ranging from tragic to triumphant, benevolent to cruel, lawful to chaotic. *Outcomes must arise from the world's causal state and agent incentives*, not mandatory hero's journeys, forced tragedies, dramatic timers, or "morality balancing" algorithms.

## Two separate, important concepts

### A. Passive focus / deep historical tracking — recommended to build

The user merely selects/inspects a subject, or uses a **passive follow/bookmark** control. UI then:
- highlights relevant canonical events (including quiet everyday events); follows relationships, family connections, rivals, mentors, heirs, alliances, and associated places;
- shows the subject's motivations, stressors, memories, unresolved conflicts, opportunities, and alternate pressures **only when they exist in actual simulation state**;
- presents summaries at varying scales and increased chronicle resolution for that subject; minimizes unrelated global noise;
- allows user to jump between the chosen subject and connected entities, with genealogy, event cause chains, and preserved history after death/collapse.

**Invariant:** same seed + config + simulation version produces exactly the same global historical events, states and outcomes regardless of what the viewer follows, which panel is open, or where the camera looks. The subject can experience many potential causal outcomes without the act of watching determining which outcome occurs.

**Performance path:** all actors use the same authoritative deterministic rules. At regional scale, simulate them at a globally defined tier of detail *independent of focus/viewport*; the spotlight retrieves and narrates existing events and bounded memory. Never secretly increase an entity's outcome RNG or change simulation tick phases because it was clicked.

### B. Explicit Story Spotlight — approved direction, implementation proposed

**User clarification:** the spotlight should broaden the **scope of eligible narrative opportunities**. Those possibilities may remain unchosen or fail: no guarantee of heroism, tragedy, conflict, fame or success. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md) for the proposed eligibility → decision → outcome pipeline.

This is not a manual story nudge: characters or settlements still act autonomously, with prerequisites, choices, costs and competition. But it **can change the simulation** after explicit activation. Distinguish inspection (never changes world), optional passive bookmarking (never changes world), and explicit spotlighting (possible future eligibility changes). A spotlight command must be recorded with simulation time for deterministic replay.

The exact controls, number of tracked entities, frequency and eligible families remain implementation design decisions. Do not silently make basic map clicks affect the simulation. The separate manual observer-nudge idea remains parked.

## Multi-scale scope model

| Scale | Persistent causes | Divergent possibilities | Follow UI (when phase enables it) |
| --- | --- | --- | --- |
| Person | needs, disposition, memories, relationships, opportunities, injury/status | friendship, devotion, crime, rescue, betrayal, reform, tragedy, unlikely success | biography, timeline, ties, choices/evidence |
| Family | kinship, shared resources, reputation, legacy, inheritance | reunification, disinheritance, feud, prestige, extinction | lineage, rivalries, multi-generation chronicle |
| Settlement | food, class/wealth, institutions, disasters, migration | mutual aid, rebuilding, decay, prosperity, revolt, authoritarianism | linked town log, resources, laws and eras |
| Kingdom/faction | legitimacy, claims, identity, institutions, external threats | diplomatic stability, civil war, conquest, federation, collapse | rulers, borders, wars, succession and eras |
| Region/world | geography, climate, knowledge transfer, trade, migrations | population movements, cultural blending, ages of discovery, dark eras | global atlas chronicle + eras (later) |

Support nested references: follow a person and see what their family, settlement and kingdom are experiencing; follow a kingdom and notice named figures whose decisions mattered. A tracked town retains a stable historical identity even if renamed, conquered or destroyed.

## Moral range and tragedy

**Approved tone:** no enforced goodness, hero status, or positive ending; mature and sometimes genuinely dark emergent histories are expected alongside warm, funny, ordinary and hopeful histories.

**Potential event domains** (only when supported by actual mechanics): courage, generosity, mentorship, festivals, reunions, rescue, compromise, invention, romance, mercy, feuds, deception, greed, corruption, persecution, enslavement/oppression, epidemics, starvation, cruelty, war, murder, rebellion, exile, grief, tyranny, revenge, regret and redemption.

There is **no abstract good-vs-evil event table**. Moral behavior is a function of temperament/values, needs, incentives, social pressure, status, relationships, historical memory and agency. A ruthless act can improve an institution in one dimension while devastating families in another. Labels such as "hero" and "villain" are social judgments influenced by cultures/perspectives, not omniscient classifications.

**Avoid forced symmetry:** 50% pleasant / 50% grim event quotas or an RNG trigger for sudden villainy would undermine causality. Evaluate variety across *many runs* and tune mechanisms that lead to dull uniformity or perpetual disaster loops, without scripting outcomes.

### Story patterns to support as consequences, not quests

- **Tragic ascent:** a reformer fights scarcity, gains power, then uses increasingly coercive methods.
- **Quiet triumph:** a healer's modest work and friendships avert an epidemic, without becoming famous.
- **Broken legacy:** a beloved family founder dies; descendants reinterpret an old promise and divide the settlement.
- **Law and chaos:** a ruler imposes harsh stability; resistance splinters into a constructive civic movement or violent vendetta.
- **Unexpected tenderness:** political enemies cooperate through famine and establish lasting peace.
- **Loss without meaning:** a promising life may end suddenly due to disease or war, and the world may forget that person.
- **World-scale consequence:** migrants escaping oppression found a town whose culture outlives the kingdom that expelled them.

Nothing above is an authored outcome to force. Each needs concrete causal rules, actors, resources, historical references and observable effects.

## Chronicle UX

- Follow toggle on person/family/town/faction; follow list/pinned shelf independent of world state.
- Chronicle filters: global, followed, related, major/minor; optional "show quiet moments" toggle for an emotional slice of a long history.
- Event cards: what, when, where, actors, cause/evidence, immediate consequences, longer downstream links when actually recorded.
- Follow notifications are not always crises; include relationships, discoveries, celebrations and mundane turning points.
- When a watched subject dies or a town collapses, preserve its biography, place history and successors.
- No omniscient future previews: `potential story directions` are for designers, never shown as guaranteed branch menus inside an observer-only game.

## Content presentation settings (future UI decision)

If needed, offer optional detail controls for graphic or distressing *descriptions*; they filter/render existing events, not change world history or the rate of tragedy. Avoid gratuitous gore; do not erase serious consequences or claim the world is wholesome by default.

## Development placement

- **Phase 1:** canonical IDs + settlement events/links; display-only selection/bookmark candidate; **no spotlight opportunity code yet**.
- **Phase 2:** people/families, reasons and memories; implement a small, bounded **extra opportunity eligibility set** for deliberately spotlighted people/families, with autonomous consideration/refusal/failure outcomes, plus biographical depth.
- **Phase 3:** institutions/culture, power, lawful/chaotic governance and social/ethical consequences; expand **settlement** spotlight eligibility with context-sensitive possibilities.
- **Phase 4:** faction/kingdom spotlight opportunity families and world-level follow, cross-scale event links.
- **Phase 5:** rich biographies, timelines, event causality, follow feeds, bookmark exports, and replay that shows recorded spotlight activations and effects.
- **Phase 6:** measure narrative diversity and darkness/hope range across seeds; fix repetitive patterns and excessive trauma loops.

**Do not pull a Phase 4 kingdom feature into Phase 1.** The spotlight should gain depth with the underlying systems at their intended milestones.

## Tests and evidence once implemented

1. **Viewing/inspection/passive bookmarks only:** same seed/config/version after N ticks yields identical world/event hashes. **Active spotlight:** same seed/config/version **and the same timestamped spotlight-command history** yields identical hashes; switching spotlights can legitimately change outcomes.
2. Changing camera/view, inspection, scrolling or event filters never changes RNG or causal outcomes. Explicit spotlight activation is recorded and may change extra eligible opportunity sets at tick boundaries.
3. Every spotlight event references canonical records; no invented secret villains, manufactured crimes, assured hero arcs, or fake causal relationships.
4. Related-event retrieval includes cross-scale entity ties and persists after death, rename, conquest and collapse.
5. Fixtures verify extra eligible opportunity families for valid spotlighted subjects **without mandating any result**; refusals, failures, missed and never-taken paths are possible. Multi-seed analysis evaluates dark and hopeful arcs without quotas.
6. Bookmark/feed cost and stored detail remain bounded at high actor counts.

## Deferred design decision

**Resolved at product-intent level:** deliberate Story Spotlight widens opportunity eligibility; it is not simply extra narration and does not force outcomes. **Still to design:** whether to distinguish passive bookmarks and active spotlight buttons, how many may run concurrently, and scale-specific eligibility budgets. No implementation until phase contracts are approved.
