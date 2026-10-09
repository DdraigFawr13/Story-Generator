# Product brief and first-session quality bar

**Status:** synthesis of recorded user decisions, recovered on 2026-10-09 UTC. Architecture and art selection are settled; numeric mechanics, terrain/storage policy and visual validation remain open. D-020/D-022 now authorize implementation; this brief does not imply first-playable acceptance.

## The experience

Start a seeded world, become curious about a settlement, watch real changes unfold, and discover why they happened. The eventual destination is an original, open-ended middle-fantasy world with personal and societal histories emerging from interacting rules. The map, inspector and chronicle describe the same reality.

Observation rewards attention without requiring constant input. Societies may thrive, decline, recover or become extinct. Later people may act kindly or cruelly, live quietly or leave a legacy. No favorites receive protection, no catastrophe is scheduled for entertainment, and no prose invents facts. Future explicit Story Spotlights widen context-valid opportunities without choosing outcomes; passive inspection never changes the world.

## Confirmed requirements

The weekly engine, playback, local saves and functional viewer are implemented under D-020/D-022. [PHASE1_VIEWER.md](PHASE1_VIEWER.md) records current interaction/storage evidence and remaining gates; the acceptance scenarios below remain the complete first-playable target.

| Requirement | Recorded decision | Practical consequence |
| --- | --- | --- |
| Settlement-first | D-002; reaffirmed in the recovered branch | P1 uses aggregate residents/households; named personal histories start in P2 |
| Simulation-first history | D-001 | Every headline and inspected cause is grounded in canonical facts |
| Middle fantasy | D-003 | Build mundane P1 foundations; introduce consequential fantasy through later rules |
| Local saves in the first playable | D-012 | Manual Save, Resume and autosave; no account, server or paid generation prerequisite |
| Architecture | D-013 | Pure TypeScript core, React/Vite, Canvas/HTML, Node 24/npm, IndexedDB and Vitest/Playwright |
| Visual direction | D-008/D-014 | Direction C's map, chronicle and inspector with Illustrated Minimal art |
| Normal viewing pace | D-015 | Roughly 10–15 minutes/year at 1x, with pause, Step and faster controls |
| Review priority | D-016 | Desktop-led composition review retains full phone usability |
| Seasonal preparation | D-017 | Seasonal production and winter reserves materially affect the economy |
| Time while away | D-018 | Pause while hidden/closed, clear scheduling debt, return paused and require Play; no catch-up |
| Phone arrangement | D-019 | Map above expandable chronicle, time controls at top; retain map context and accessible sheet controls |

Exact tick/calendar units, seasonal factors, resource sources, demographic risks and save budgets remain proposals. Changing presentation speed changes scheduling only; equal admitted tick counts must produce equal histories. Saved-world Resume restores state and remains paused.

Illustrated Minimal is the current art target. The older branch's original-first-concept preference predates the final merged selection and does not reopen it. Human-shaped P1 markers represent aggregate population; they cannot imply simulated individual identities, destinations or biographies. Generated studies establish a target, not production assets or measured usability.

## First-session acceptance scenarios

1. **Begin:** enter or generate a seed, understand the starting settlement and find the time controls. Explain invalid input or generation failure without leaving a partial world.
2. **Notice:** identify a real map change and its matching chronicle record. Decorative markers do not imply individual actions that P1 does not simulate.
3. **Understand:** select a record and inspect its time, place, changed values and recorded causes. Old records remain understandable after their building disappears.
4. **Explore:** pause, Step, change speed, pan, zoom and inspect without changing canonical history. Reading older entries does not force-scroll to new headlines.
5. **Prepare:** understand how the season changes production and what stored food means for winter. Capacity and planning estimates do not promise survival or create resources.
6. **Return:** save, reload and Resume into the same committed world/history, paused. Show saved-through tick and unsaved progress; explain browser-local storage. New World cannot overwrite the saved world without the replacement choice.
7. **Leave briefly:** switch tabs while playing and return without hidden-time advancement or automatic restart. Play resumes from the committed world, with no catch-up burst.
8. **Encounter adversity:** explain shortage, decline or extinction through recorded evidence. Retain the final world/history for inspection without forced rescue or restart.
9. **Use a phone:** operate time controls and event inspection without hover; open and close the chronicle predictably while retaining map orientation. Enlarged text stays readable.

## Evidence before calling the first playable ready

| Dimension | Required evidence |
| --- | --- |
| Causal honesty | Headlines, counters, map and inspection agree at the same committed tick |
| Reproducibility | Golden vectors, cross-runtime digests, speed/view independence and save/resume continuity |
| Understandability | A viewer can explain a consequential chain using the interface; record confusion and address it |
| Variety | Fixed-seed review without hand-picked dramatic outcomes or seed-specific scripts |
| Resilience | Quota/abort/corruption, replacement, writer ownership, rejected candidate ticks and extinction behave predictably |
| Accessibility | Keyboard labels/focus, HTML inspection, non-color-only indicators, readable contrast and at least 44 × 44 CSS px control targets |
| Responsive visuals | Actual-size sprites/text, long entries, 320/390 CSS px layouts, enlarged text, tablet/desktop and both sheet states |
| Continuity | Hidden/closed return and Resume remain paused; no elapsed-time catch-up; saving never advances simulation |
| Performance | Named runtime/browser measurements and physical-device evidence for claims of device support |

Core/browser reproducibility, save resilience, navigation/phone interaction and desktop long-history storage evidence now exist. Ten-seed analysis still shows forgiving early winter balance. Selected-art comparison, physical-device evidence and a human understandability study remain open. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for source provenance and next work.
