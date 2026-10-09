# Narrative divergence, moral range, and multi-scale spotlight (design brief v1)

**Status:** user-approved goals (richer divergences across people, settlements, kingdoms; both dark and uplifting plots). **Mechanism pending review.** This is a design specification and long-term plan, not working code or approval to add spotlight-induced simulation interventions.

## Core objective

The viewer should be able to become attached to an individual, family, settlement, or faction and witness multiple plausible futures, ranging from tragic to triumphant, benevolent to cruel, lawful to chaotic. *Outcomes must arise from the world's causal state and agent incentives*, not mandatory hero's journeys, forced tragedies, dramatic timers, or "morality balancing" algorithms.

## Two separate, important concepts

### A. Passive focus / deep historical tracking — recommended to build

A user follows/bookmarks a subject. UI then:
- highlights relevant canonical events (including quiet everyday events); follows relationships, family connections, rivals, mentors, heirs, alliances, and associated places;
- shows the subject's motivations, stressors, memories, unresolved conflicts, opportunities, and alternate pressures **only when they exist in actual simulation state**;
- presents summaries at varying scales and increased chronicle resolution for that subject; minimizes unrelated global noise;
- allows user to jump between the chosen subject and connected entities, with genealogy, event cause chains, and preserved history after death/collapse.

**Invariant:** same seed + config + simulation version produces exactly the same global historical events, states and outcomes regardless of what the viewer follows, which panel is open, or where the camera looks. The subject can experience many potential causal outcomes without the act of watching determining which outcome occurs.

**Performance path:** all actors use the same authoritative deterministic rules. At regional scale, simulate them at a globally defined tier of detail *independent of focus/viewport*; the spotlight retrieves and narrates existing events and bounded memory. Never secretly increase an entity's outcome RNG or change simulation tick phases because it was clicked.

### B. Active / fate-amplifying focus — parked design question

The user is also interested in **more actual opportunities for divergence** when a person/town/kingdom is watched, bookmarked or tagged. This could mean a tagged subject receives more state-changing pressures/opportunities than an untagged subject. **That would make following an intervention.**

Do not quietly implement this: compare it to ordinary passive bookmarks in a later product review. Candidate future variants:
- explicit *Fate Focus* mode or prompt, clearly labeled as simulation-altering;
- a separate world configuration established at run start;
- reproducible fork from a bookmark/timestamp with a recorded external command.

If approved later, provenance must record the action; seed+configuration+recorded player decisions must replay. Keep default observer runs strictly unmodified. This concept is distinct from and compatible with *observer nudges*, which remain parked.

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

- **Phase 1:** canonical IDs + settlement events/links; basic settlement follow/bookmark as display-only candidate.
- **Phase 2:** people/families and their reasons, memories, long-run continuity; build person/family spotlight depth.
- **Phase 3:** institutions/culture, power, lawful/chaotic governance and social/ethical consequences; complex local plots.
- **Phase 4:** faction, kingdom and world-level follow, cross-scale event links.
- **Phase 5:** rich biographies, timelines, event causality, follow feeds, bookmark exports and history navigation.
- **Phase 6:** measure narrative diversity and darkness/hope range across seeds; fix repetitive patterns and excessive trauma loops.

**Do not pull a Phase 4 kingdom feature into Phase 1.** The spotlight should gain depth with the underlying systems at their intended milestones.

## Tests and evidence once implemented

1. Same seed/config/version after N ticks yields identical world/event hashes whether nothing, a person, a town or a kingdom is followed.
2. Changing focus frequently or viewing different map regions never changes RNG consumption or causal outcomes.
3. Every spotlight event references canonical records; no invented secret villains, manufactured crimes, assured hero arcs, or fake causal relationships.
4. Related-event retrieval includes cross-scale entity ties and persists after death, rename, conquest and collapse.
5. Deterministic multi-seed analysis evaluates distinct arc types, rare/ordinary events, outcomes, lifetimes, and runs with both dark and hopeful histories, **without quotas**.
6. Bookmark/feed cost and stored detail remain bounded at high actor counts.

## Deferred design decision

**Must ask explicitly before building any active fate-focus:** Should marking a subject *only change how much of its real life we see*, or may a separately identified mode *change its chances*? User has expressed interest in both, but has not decided the precise boundary.
