# Product brief and first-playable quality bar

**Status:** working synthesis of recorded user decisions, 2026-10-09 UTC. Open questions are not approvals. No application implementation is authorized by this brief.

## The experience we are building toward

Start a world, become curious about a place or person, watch real changes unfold, and discover why they happened. The destination is an original, open-ended middle-fantasy world whose personal and societal histories emerge from interacting rules. The map, inspector and chronicle describe the same reality.

Observation should reward attention without requiring constant input. People can thrive, fail, act kindly or cruelly, be forgotten or leave a legacy. The simulation must not protect favorites, schedule a catastrophe for entertainment, or generate prose that invents facts. Later explicit Story Spotlights broaden context-valid opportunities; they do not select outcomes. Passive inspection never changes the world.

The visual target is the approved Naturalist's Observation Desk: readable overhead world, literary but crisp chronicle, contextual inspection. After comparing three concepts and rejecting a blended refinement, the user chose the original first concept’s simple graphics with only the resident markers changed to recognizable human shapes. That targeted edit has been shown and is the working visual reference; phone/scale validation remains open. Human-shaped sprites in P1 represent aggregate population without implying simulated individual identities.

## Confirmed requirements

- One settlement before continental scope; no server/account or paid generation prerequisite for the first playable.
- Seeded, reproducible histories; complete local save/resume in the first playable.
- Desktop and phone usability; useful touch and keyboard controls, legible prose and map states.
- Broad moral and emotional range grounded in circumstances, with neither dramatic quotas nor guaranteed arcs.
- Careful pre-build understanding, explicit unresolved decisions and reviewable scoped work. Engineering starts after the recorded Phase 0 gate.

## Product priorities confirmed by the user

| Decision | Confirmed direction (2026-10-09 UTC) | Why it matters |
| --- | --- | --- |
| First-playable emotional focus | Settlement development first; named personal stories in P2 | P1 remains an aggregate settlement simulation; named lives are a later milestone |
| Normal-speed pacing | Roughly 10–15 minutes per simulated year, with pause/step and faster speeds | Viewers have time to notice and inspect seasonal change |
| Initial usability-review priority | Desktop-led composition with complete phone usability | Determines the order of visual validation, not whether phone is supported |
| Seasonal economy | Growing seasons and winter preparation materially affect food/resources | Seasonal visuals must correspond to real economic consequences |
| Time while away | Pause when the app is closed or in the background; no catch-up on return | The viewer can follow history without missing unseen years |

These product priorities are confirmed; exact simulation constants remain proposals. Simulation time units and wall-clock presentation speed are separate contracts; changing play speed must not change the result after the same tick count. Three desktop art concepts and subsequent refinements were reviewed; the working target is original concept 1 with human-shaped figures. Phone and actual-size validation remain open.

## First-session acceptance scenarios

1. **Begin:** enter or generate a seed, understand the starting settlement and find the time controls without external instructions. Explain generation failure without a frozen screen.
2. **Notice:** identify a real change on the map and its matching chronicle record. No decorative residents imply individual identities or actions that P1 does not simulate.
3. **Understand:** select the record and see its time, place, changed values and recorded causes. Distinguish facts from absent evidence. Old records remain intelligible after a building disappears.
4. **Explore:** pause, step, change speed, pan, zoom and inspect without changing canonical history. Reading older entries does not repeatedly snap the reader back to the newest headline.
5. **Return:** save, reload and resume from the saved tick with the same world/history. Show saved versus unsaved progress; disclose local-device storage. Confirm before replacing a world with New World.
6. **Encounter adversity:** understand shortage, decline or extinction through recorded evidence. No forced rescue or automatic restart; the final world and history remain inspectable.
7. **Use a phone:** operate time controls and event inspection without hover; open/dismiss the chronicle predictably while retaining orientation on the map.

## Quality evidence required before calling the first playable ready

| Dimension | Evidence |
| --- | --- |
| Causal honesty | Selected headlines trace to canonical facts/deltas; maps, counters and inspection agree at the same tick |
| Reproducibility | Fixed seed/config/version tests, cross-runtime digests, speed/view independence and save/resume continuity |
| Understandability | A viewer can explain one consequential chain using the interface alone; record observed confusion and fix it |
| Variety | Review multiple seeds for meaningful differences without hand-picking a dramatic success or imposing outcome quotas |
| Resilience | Interrupted/quota-limited writes, unsupported/corrupt saves, generation failure, zero population and archive limits have tested recoverable behavior |
| Accessibility | Keyboard focus and labels, DOM alternatives for relevant map details, non-color-only state indicators, readable contrast, usable touch targets and reduced motion |
| Responsive presentation | Check actual displayed text/sprite sizes, long names, crowded events, narrow layouts and expanded/collapsed phone sheets |
| Performance | Measure tick/render/input latency, save cost and memory on named desktop and phone targets; proposed budgets are not measured results |

A functioning engine alone does not satisfy this quality bar. Conversely, attractive mockups cannot demonstrate simulation correctness or real-world performance. Keep design evidence, implementation tests and user observations separately identified.

## Decisions for the team to handle

Recommend technical details with reasons rather than asking the user to choose PRNGs, package managers or database transaction shapes. Ask about tradeoffs that materially change the desired experience: scope, pacing, presentation, controls or persistence expectations. Keep exact tuning provisional until both arithmetic review and multi-seed runtime evidence exist.
