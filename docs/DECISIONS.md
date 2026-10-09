# Decision register and idea backlog

The register distinguishes what was **approved**, what is **pending review**, and what is **parked**. A note marked PARKED is not a committed roadmap item and cannot be implemented without a separate explicit decision.

## Approved direction

| ID | Decision | Why | Scope impact |
| --- | --- | --- | --- |
| D-001 | Simulation first, narration second | Unscripted causal stories rather than random narrative flavor | Every story claim grounded in world history |
| D-002 | Living World long-term, village-first first playable | Build complete systems at small scale before continental scale | Phase 1 one settlement; Phases 2–6 expand |
| D-003 | Middle-fantasy baseline | Mix grounded societal histories with meaningful supernatural possibilities | Mundane foundation P1–2; first bounded fantasy rule P3 |
| D-004 | P1 is passive observation; later explicit Story Spotlights are distinct | World should be compelling without artificial player-driven plots | Inspect/bookmark/follow never mutate simulation; deliberate P2+ Spotlights may change trajectories under D-009; direct nudges stay parked |
| D-005 | Detailed phase specs precede engineering | Control scope and avoid rebuilding modules later | P0 approval gate; ordered tasks and tests per phase |
| D-006 | Scoped PRs + squash merges + merged-branch cleanup | Keep repository navigable | Only main persists between short-lived tasks |
| D-007 | Responsive browser-first is planning baseline | Start easily on phone or desktop | Final framework selected before Phase 1 scaffolding |
| D-008 | **Direction C: Naturalist's Observation Desk** approved | Living top-down pixel diorama plus chronicle and historical inspection | Keep UX structure, revise art density/style |
| D-009 | Broaden **eligible opportunities** for deliberate Story Spotlights | User wants greater scope of potential divergent storylines, not enforced outcomes | Multi-scale spotlight opportunity families gradually introduced P2–P4; preserve autonomous refusal/failure/missed paths |
| D-010 | Full moral and tonal range | Dark tragedy/cruelty and warm triumph/compassion both deserve equal possibility, grounded in world conditions | No quotas, no chosen-hero protection, no scripted morality outcomes |
| D-011 | Rework map art: simple, stylized, original, RimWorld-like readability with slightly more detail | Previous images were too dense and intricate | Direction C layout remains; comparison completed with Illustrated Minimal selected under D-014 |
| D-012 | Basic browser-local save/resume belongs in the first playable (user confirmed 2026-10-09 UTC) | Keep a settlement between sessions | P1 manual save/resume and autosave; P5 retains multiple named worlds, migrations and timeline seeking |
| D-013 | Architecture approved by the user on 2026-10-09: ADR-001–003 | Strict TypeScript core, React/Vite shell, Canvas 2D/HTML, Node 24 LTS/npm, IndexedDB, Vitest/Playwright | Phase 0.7 complete; exact versions at scaffolding; visual and mechanics/storage gates remain open |
| D-015 | Unhurried normal speed: roughly 10–15 minutes per simulated year | Allow time to notice and inspect change | Exact scheduling remains proposed; faster controls preserve equal-tick outcomes |
| D-016 | Desktop-led usability review with complete phone usability | Prioritize desktop composition without excluding phone users | Review desktop first, then the complete phone flow |
| D-017 | Seasons materially change the economy, including preparation for winter | Harvests and reserves should matter | Exact seasonal multipliers, foraging policy and reserve thresholds remain proposed |
| D-018 | Pause while closed or backgrounded; return paused with explicit Play | The viewer should not miss unseen history | Clear scheduling debt; no elapsed-time catch-up; saved-world Resume does not implicitly start Play |
| D-019 | Phone arrangement approved: map above expandable chronicle, time controls at top | Preserve the reviewed information hierarchy | Actual-size, accessibility and interaction checks remain open |

## Art selection — 2026-10-09

**D-014:** The user selected **Illustrated Minimal**, option 2 of the final three-image comparison. This retains Direction C and chooses its map-art treatment. Collapsed and expanded phone chronicle studies were subsequently generated. This is art selection, not evidence that source sprite size, actual-device readability, interactions, numeric mechanics or the entire pre-build gate are approved. See [continuation review](CONTINUATION_REVIEW.md) for the exact selected artifact and outstanding checks.

## Recovered decision provenance

D-015–019 carry forward compatible user-confirmed requirements from the unmerged `docs/phase0-product-contracts` branch at [0dbcead](https://github.com/DdraigFawr13/Story-Generator/commit/0dbcead1371cd46dc6b26c3e35fef65af275a7aa), last updated at 06:22 UTC on 2026-10-09. Its decision register used D-014 for pacing, D-015 for device priority and D-018–020 for seasons, background pausing and phone layout. New IDs here preserve main's existing D-013 architecture and D-014 art meanings. That branch's aggregate-first reaffirmation agrees with D-002 and the current P1 scope.

Later merged architecture/art decisions take precedence over the branch's earlier pending architecture and original-concept art notes. Its daily calendar, numeric economy, geography and alternate save format remain older proposals; do not combine them with the newer weekly [settlement rules](SETTLEMENT_RULES.md), [terrain contract](TERRAIN_CONTRACT.md) or [local persistence contract](LOCAL_PERSISTENCE_CONTRACT.md). See [project handoff](PROJECT_HANDOFF.md) for the reconciliation and next work. No new user approval or completed runtime validation is inferred from this recovery.

## Pending Phase 0 decisions

| ID | Question | Candidate approach | Blocking work |
| --- | --- | --- | --- |
| Q-001 (resolved) | Which pixel-world interface presentation? | **C: Naturalist's Observation Desk**, approved (D-008) | Exact art settings + layout validation still pending |
| Q-002 | Exact pixel art constraints? | Illustrated Minimal selected (D-014); source density, zoom and actual-size validation remain open; 16px is not prescribed | Asset pipeline |
| Q-003 (resolved) | Rendering, app/test/build frameworks? | Accepted [ADR-001–003](adr/README.md) under D-013 | Overall pre-build gate still required |
| Q-004 | Complete P1 mechanics and numeric units? | Review [SETTLEMENT_RULES.md](SETTLEMENT_RULES.md): concrete numeric/order/RNG proposals; checklist in [PLAN_REVIEW.md](PLAN_REVIEW.md) | Phase 1 sim behavior |
| Q-005 | Spotlight interaction and budgets? | Explicit activated opportunity-expansion vs passive bookmark; cap counts and family complexity | Phase 2 spotlight mechanics; see [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md) |
| Q-006 | P1 archive/storage limits and autosave cadence? | Review [LOCAL_PERSISTENCE_CONTRACT.md](LOCAL_PERSISTENCE_CONTRACT.md): one-slot atomic snapshots, cadence/budgets, ownership, failures and archive admission (proposed) | P1 persistence and long-run acceptance |
| Q-007 (resolved) | First-playable emphasis and normal-speed pacing? | Settlement-first D-002 and 10–15 minutes/year D-015; exact scheduling remains proposed | Numeric mechanics and scheduling review remain open |
| Q-008 (resolved) | Initial device-review priority? | Desktop-led review, full phone usability D-016 | Actual-size and interaction validation remain open |

## Parked concepts — DO NOT IMPLEMENT

### F-001: Observer nudges (distinct from approved Spotlight Opportunities concept)

**Origin:** possible future engagement mechanism; user specifically asked to leave the idea open but not implement it as part of the active plan.

**Concept families for later review:**
- *Prompted opportunity*: rare optional choice tied to an existing world condition, such as whether a lone scholar finds safe passage.
- *On-demand minor nudge*: limited disturbance or encouragement (weather variation, a rumor, a small find) under world-rule constraints.
- *Hybrid*: occasional organic prompts with a highly limited on-demand allowance.

**Rules if ever explored:** baseline must remain playable and compelling without intervention; a player-caused change must be distinguishable in event records; it should be legal under simulation mechanics and replayable given input history; no scripted arc completion guarantee; avoid forcing moral choices or redirecting culture in arbitrary ways.

**Status:** PARKED. No task, PR, UI control, event command, API, prototype or release commitment. Reconsider only after first observing whether user engagement needs it. The architecture need only avoid blocking a future validated event source.

### F-002: Alternate world fantasy profiles

Future grounded, low-, high-fantasy and nonhuman world presets are possible. Only middle fantasy is currently selected; do not divert Phase 1 work toward generalized profiles.

### F-003: Future interaction/format expansions

Optional full god-mode control, modding, remote seed sharing, illustrated documentary exports, extensive magical pantheons and additional intelligent species remain speculative. Basic local recorded-history exports remain in P5; they do not authorize a publishing service or illustrated documentary pipeline. Review each for fit, cost, performance and causality before adding it to a roadmap.

## Change control

When a new idea is approved or an old assumption changes:
1. Record the specific decision here.
2. Identify impacted simulation invariants/data contracts and UI.
3. Update implementation-plan steps and acceptance tests.
4. Apply via a scoped branch and PR.
5. Verify merge and branch cleanup before moving on.
