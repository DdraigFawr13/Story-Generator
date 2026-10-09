# Playback, local saves and functional chronicle — 2026-10-09

PR #12 is merged at `2c1e4de`. D-022 authorizes continued work and milestone merges at engineering discretion. This slice completes continuation **1D**, and connects a functional chronicle and inspector to the actual running settlement. It does not close selected-art or first-playable acceptance.

## Implemented behavior

- The controller publishes only complete admitted weekly snapshots. Play/Pause, single step and 1x/4x/16x are outside canonical state. The documented 15-second normal week gives 12 active minutes/year. One timer admits one week and then schedules fresh timing; slow execution adds no catch-up debt.
- Hidden/pagehide pauses and cancels the timer. A callback also checks actual visibility before reducing a week. Return and saved-world Resume remain paused. Scheduling fractions never enter core arithmetic or saves.
- The landing page checks storage before offering Resume/New World. It does not construct a default world over a saved slot. Manual New World builds an in-memory candidate; an existing/invalid slot requires the explicit **Replace local save with this world** action before any candidate write.
- Save envelopes contain the full schema-2 state/archive/RNG/allocators, canonical SHA-256, timestamp, operational session and increasing generation. All validation/hashing occurs before the single IndexedDB read-write transaction. Saved status follows transaction completion, not request success.
- One save is in flight; one manual capture retains its clicked tick; pending automatic captures coalesce. World changes discard pending requests and wait for the old in-flight transaction. A late completion cannot mark a new world saved. Failed writes preserve the old slot and show unsaved memory.
- The explicit baseline requests autosave after 20 weeks since the last successful save, throttles automatic starts for five seconds and backs off failures for 30 seconds. Manual retry bypasses those delays. Pausing does not cancel pending autosave. The UI explains the five-active-minute 1x loss window; this cadence is still an experience-review item.
- Web Locks grants one application-lifetime writer. A refused lock yields a read-only saved-world viewer, including empty/corrupt-slot cases. Take ownership rereads/validates the latest slot and returns paused. Missing persistence capabilities allow explicit unsaved play with disabled saves. An unreadable slot cannot accidentally enable automatic overwrites.
- Chronicle headlines derive from immutable event facts. The latest 200 records form a presentation window; the complete archive stays in every save. Selection shows immediate changes, facts and backward causes and selects the event's real tile. Phone history opens by button and closes with Back to map/Escape with focus return; selection survives closing.

## Evidence

- 16 controller/envelope/queue tests passed locally, in addition to all 83 prior fast core tests. They cover all speeds, hidden-before-deadline/repeated return, complete-tick limit rejection, 57+80=137-week continuation, failed replacement/load, lock denial, unreadable slots, captured manual ticks, coalescing, throttled pending saves, backoff and in-flight session barriers.
- 57 browser checks passed across Chromium, Firefox and Playwright WebKit: prior terrain/weekly parity and viewport/inspection checks, actual save/reload/paused Resume equality, real abort after IndexedDB put request success, injected quota failure/manual retry, damaged and independently checksummed invalid records, candidate replacement, two-tab ownership/latest-slot takeover, unsupported empty-slot ownership, unavailable locks, playback/hidden return, factual cause selection and phone focus return.
- Fresh Firefox checks explicitly reject browser console errors; desktop/phone screenshot captures also had no console/page errors or horizontal overflow. Development warnings seen during hot edits did not reproduce in fresh checks.
- Desktop/phone screenshots at spring week 12 are recorded as engineering evidence in `docs/evidence/`. They use temporary drawings and are not comparisons against the unavailable selected images.

## Remaining acceptance

Real browser transactions establish atomic replacement in the tested cases. Injected quota failure is not a measurement of actual device quota; a test does not guarantee protection from eviction, clearing browser data or device loss. A process-kill/crash durability study, long-history write/load/memory measurements, installed Safari and a physical Android phone are still open.

The current phone map still fits the whole geography; crop/zoom/pan and selected-location visibility will follow in the next viewer slice. Selected sprites, full visual reference comparison and first-session winter balance remain open. No individual residents, Spotlights, historical seeking, accounts, cloud sync or deployment were added.
