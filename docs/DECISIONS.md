# Decision register and idea backlog

The register distinguishes what was **approved**, what is **pending review**, and what is **parked**. A note marked PARKED is not a committed roadmap item and cannot be implemented without a separate explicit decision.

## Approved direction

| ID | Decision | Why | Scope impact |
| --- | --- | --- | --- |
| D-001 | Simulation first, narration second | Unscripted causal stories rather than random narrative flavor | Every story claim grounded in world history |
| D-002 | Living World long-term, village-first first playable | Build complete systems at small scale before continental scale | Phase 1 one settlement; Phases 2–6 expand |
| D-003 | Middle-fantasy baseline | Mix grounded societal histories with meaningful supernatural possibilities | Mundane foundation P1–2; first bounded fantasy rule P3 |
| D-004 | Current experience is observer-only | World should be compelling without artificial player-driven plots | Inspect, bookmark, follow and study; no gameplay interventions |
| D-005 | Detailed phase specs precede engineering | Control scope and avoid rebuilding modules later | P0 approval gate; ordered tasks and tests per phase |
| D-006 | Scoped PRs + squash merges + merged-branch cleanup | Keep repository navigable | Only main persists between short-lived tasks |
| D-007 | Responsive browser-first is planning baseline | Start easily on phone or desktop | Final framework selected before Phase 1 scaffolding |
| D-008 | **Direction C: Naturalist's Observation Desk** approved | Living top-down pixel diorama plus chronicle and historical inspection | Map-first desktop + phone sheet; exact pixel/render settings await validation |

## Pending Phase 0 decisions

| ID | Question | Candidate approach | Blocking work |
| --- | --- | --- | --- |
| Q-001 (resolved) | Which pixel-world interface presentation? | **C: Naturalist's Observation Desk**, approved (D-008) | Exact art settings + layout validation still pending |
| Q-002 | Exact pixel art constraints? | Tile density, palette, UI scale, zoom levels, animations | Asset pipeline |
| Q-003 | Rendering, app/test/build frameworks? | See [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md): TS + React/Vite + Canvas 2D candidate | Phase 1 scaffolding |
| Q-004 | Time and simulation resource units? | Explicit tick-to-season conversion and realistic bounded quantities | Phase 1 sim behavior |

## Parked concepts — DO NOT IMPLEMENT

### F-001: Observer nudges

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

Optional full god-mode control, modding, remote seed sharing, documentary exports, extensive magical pantheons and additional intelligent species remain speculative. Review each for fit, cost, performance and causality before adding it to a roadmap.

## Change control

When a new idea is approved or an old assumption changes:
1. Record the specific decision here.
2. Identify impacted simulation invariants/data contracts and UI.
3. Update implementation-plan steps and acceptance tests.
4. Apply via a scoped branch and PR.
5. Verify merge and branch cleanup before moving on.
