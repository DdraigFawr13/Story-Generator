# Functional viewer and storage evidence — 2026-10-09

PR #14 is merged at [af30301](https://github.com/DdraigFawr13/Story-Generator/commit/af30301fc5a60e8a57eeb3d5820097950cb4594e). D-022 authorizes continued engineering and verified milestone merges. This slice completes functional navigation and older-record access; selected-art fidelity and physical-device acceptance remain separate. Storage and trajectory reports below measure `p1-settlement-v1`; the subsequent v2 amendment has its own [balance record](PHASE1_BALANCE.md).

## Viewer behavior

- The map keeps a readable 12px default tile size on phones instead of shrinking the full geography. Five zoom levels, pointer dragging, directional buttons and arrow keys change only the camera. Coordinate inspection and event selection focus the actual tile. High-DPI drawing, construction outlines, durability opacity, building-type symbols and removed-building crosses derive from current/historical state. Drawings remain temporary.
- The phone chronicle is a nonmodal bottom sheet. Opening retains visible map context; its history/evidence scroll independently. Back to map/Escape returns focus to the opener beside the map. Map buttons remain available; there is no focus trap.
- The live 200-record window preserves an older reader’s visible record/offset as new entries arrive. A record-number lookup and previous/next controls access the complete retained archive, including records outside that window. This selects evidence without changing the current simulation week or reconstructing past world state.
- The settlement shows stored food as whole weeks of **current** demand, plus the actual seasonal crop factor and last-week production. Estimates explicitly exclude future production/spoilage; they do not promise survival. Event production factors display percentages rather than internal fixed-point units.

## Browser and core evidence

81 browser checks passed locally across Chromium 156.0.8078.4, Firefox 157.0 and Playwright WebKit 27.2, including navigation/history independence, older archive access, preserved reading position, event focus/map context, pointer-focus scroll regressions and 320/390px enlarged-text controls. Prior save/ownership/rollback/visibility/parity checks remain included. PR #14's final hosted verification passed all 102 core and 81 browser tests, formatting, strict types, boundaries and build before merging.

PR #13’s hosted browser job completed all 57 checks with one WebKit mock-clock setup retry (`pauseAt(new Date())` could target the past). This slice anchors the mocked date before loading the page and pauses at a fixed later timestamp; the updated checks pass in all three local engines. This was test scheduling, not an observed simulation catch-up failure.

Screenshots in `docs/evidence/phase1-viewer-*.png` record desktop, phone-map and expanded-sheet states. They are functional engineering evidence, not a comparison against the unavailable selected references.

### Resumed verification: pointer focus scrolling

PR #14's first hosted run passed core verification but failed Chromium's founding pointer check twice: the click expected tile 1290 and selected tile 1226. A controlled short-viewport reproduction showed canvas focus scrolling the document between pointer-down and pointer-up, moving the map under the pointer. The pointer handler now prevents the default focus action and focuses with `preventScroll`; keyboard focus and dragging remain available. Regressions leave the map partly above and below the viewport and check focus, unchanged page scroll and the actual selected tile. The controller tests also replace an iteration-count wait with a bounded time-based poll: asynchronous WebCrypto hashing can outlast 500 immediate callbacks under load. Save queue behavior and assertions are unchanged. Local and hosted suites passed on head `4415d08`; the initial local Firefox profile-launch problem was resolved before full verification.

## Real storage measurements

The reproducible `npm run benchmark:storage` command generates the same RIVERSIDE snapshots in Node, saves/validates them in real browser IndexedDB, advances restored and original snapshots ten weeks, compares digests, then reloads and resumes through the UI. The [raw report](evidence/phase1-storage-benchmark.json) records exact values. Node 24.19.0 generated the 10,000-week retained world in 98,152ms during concurrent verification.

| Engine | Week | Payload bytes | Prepare/hash ms | Atomic write ms | Read/validate ms | Ten weeks ms | UI reload/Resume ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chromium | 1000 | 374096 | 80.9 | 5 | 74.9 | 51.9 | 424.9 |
| chromium | 10000 | 1211545 | 167.8 | 24.4 | 210.8 | 159.5 | 707.2 |
| firefox | 1000 | 374096 | 157 | 19 | 192 | 114 | 1012.1 |
| firefox | 10000 | 1211545 | 367 | 23 | 496 | 228 | 1498.2 |
| webkit | 1000 | 374096 | 265 | 10 | 203 | 149 | 787.9 |
| webkit | 10000 | 1211545 | 476 | 23 | 522 | 403 | 1438.0 |

All six continued histories matched. Week 1,000 has P=39 and 480 events; week 10,000 retains P=0, 2,438 events and the history of natural extinction at week 1,980. No history truncation or seeded refounding occurs.

These are single observational desktop Linux measurements in the managed environment, with concurrent verification and local browser accommodations recorded in PHASE1_FOUNDATIONS.md. They are not percentile/phone budgets. Chromium’s post-measurement used-heap observations were 45,851,268 and 117,660,825 bytes; those include multiple comparison snapshots and UI/runtime overhead and are **not** isolated payload memory or measured peak heap. Firefox/WebKit expose no equivalent value here.

Run after installing Playwright browsers/dependencies:

```sh
npm run benchmark:storage
npm run benchmark:crash
```

Optional `STORY_GENERATOR_STORAGE_REPORT` and `STORY_GENERATOR_CRASH_REPORT` select output paths; defaults are `/tmp/story-generator-storage-report.json` and `/tmp/story-generator-crash-report.json`. These diagnostics are not in the normal CI suite. The crash command uses a fresh temporary profile and kills only its own detached Chromium process group.

## Process-crash recovery

The reproducible Chromium crash study holds a read-write transaction open **after its put request succeeds**, then kills the owned browser process group with SIGKILL. Reopening the same profile recovered the prior complete week-1,000 envelope and exact digest `19ab0ce4e2186cb775116aa72b1af5c06e3f3bcb9d3ce286c91c361a816269ff`. See the [raw report](evidence/phase1-crash-study.json).

This is one explicitly controlled Chromium crash point. It supplements transaction-abort tests; it does not establish every browser’s disk durability, eviction protection or recovery after power/device loss.

## Ten-seed experience review

The [trace report](evidence/phase1-ten-trajectories.json) follows the same ten seeds used in the weekly-engine record at weeks 12/24/36/48/96/240/480/1,000. No parameters were changed and no seed was selected for dramatic outcomes.

| Seed | Year-one residents | Year-one food | Winter harvest | Week-1,000 residents | Week-1,000 stores | Observed trajectory |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| RIVERSIDE | 23 | 988 | 163 | 39 | 23 | Early storage overflow, then moderate growth; finite timber is gone by week 1,000. |
| TERRAIN_000 | 23 | 921 | 144 | 47 | 41 | Lower early yields but enough reserves; later storage expansion supports 47 residents. |
| TERRAIN_001 | 25 | 1253 | 317 | 40 | 54 | High early yields, repeated overflow and broad storage expansion. |
| TERRAIN_002 | 25 | 1067 | 128 | 52 | 86 | Three drought seasons in the first year still leave ample reserves; later population reaches 52. |
| TERRAIN_003 | 25 | 1562 | 232 | 40 | 70 | Wet spring/autumn boost yields and early storage; later population levels at 40. |
| TERRAIN_004 | 24 | 1476 | 195 | 39 | 41 | No first-year overflow; strong reserves and continued modest population growth. |
| TERRAIN_005 | 26 | 645 | 111 | 32 | 1 | Low early timber and one-store capacity constrain food retention; population reaches its 32-person shelter. |
| TERRAIN_006 | 28 | 1168 | 268 | 44 | 48 | Fast first-year growth to 28; later expands fields, housing and storage. |
| TERRAIN_007 | 26 | 1560 | 311 | 48 | 66 | Wet summer/winter and early overflow; population later reaches 48. |
| TERRAIN_008 | 25 | 1074 | 136 | 32 | 12 | High cumulative overflow and more modest storage/housing bound growth at 32. |

The first winter visibly reduces crop output (111–317 food across these seeds), but all ten stay at health 100 with zero shortage starts through week 1,000. Seed trajectories differ in yields, births, storage/overflow and capacity; this does **not** establish a compelling preparation/adversity experience. The current production/construction baseline is forgiving early and constrained by finite timber later. Keep winter/low-population recovery tuning explicit and versioned; no change was silently made.

## Remaining first-playable gates

- Recover exact selected desktop/phone images and compare production art at actual source density. Current symbols/layout do not establish that fidelity.
- Review the 20-week autosave loss window and human winter-preparation experience. D-023 resolves the tuning emphasis; v2 implementation/evidence is recorded in [PHASE1_BALANCE.md](PHASE1_BALANCE.md).
- Obtain physical Android and installed Safari interaction/performance evidence; desktop emulation and Playwright WebKit do not substitute.
- Obtain a viewer usability review demonstrating that someone can explain a consequential chain from the interface. No human study was inferred from automated checks.

No individual agents, biographies, Spotlight commands, historical seeking, cloud accounts or deployment were added.
