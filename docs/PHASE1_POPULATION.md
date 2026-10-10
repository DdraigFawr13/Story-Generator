# Aggregate population display — 2026-10-09

This milestone completes the functional rendering part of task 1.17: the map now includes lightweight resident dots alongside the existing terrain, structures and fields. D-022 authorizes continued engineering and verified milestone merges. The display uses the current committed population, including after demographics or Resume, and does not introduce individual agents or change the simulation version.

## Display contract

- Each dot represents one resident, with a maximum of 96 dots. The accompanying text reports the exact number represented and the complete population, so the display cannot imply that a larger population has disappeared.
- Placement is explicitly illustrative. The projection prefers unoccupied, cleared grass within five tiles of the settlement center, then uses hut tiles as a dry fallback. It excludes water, rock, standing forest, fields, stores and the construction project's tile. If space is insufficient, the reported count reflects the actual available symbols.
- Four distinct offset slots per eligible tile keep the projection bounded and repeatable. Placement does not establish identities, households, home assignments, work destinations or travel. It uses no simulation RNG, IDs or new authoritative records.
- Zero population produces no dots and the factual “No residents remain” message. Historical terrain, ruins and records remain available.
- The Residents button shows or hides the dots with an accessible pressed state. The dots use a dark circular border, the legend identifies them, and the canvas description includes the population explanation. Zoom, pan and selection use the existing camera; selection remains drawn over the dots.
- Visibility is a temporary viewing preference. Save payloads, rule versions, event history, ownership and continuation are unchanged; a freshly loaded page shows the dots again.

The projection is memoized from immutable map/building/settlement inputs. Camera changes do not rebuild population placement. These are original programmatic shapes, consistent with the existing temporary drawings; they are not the selected production art or evidence of its source density.

## Verification

Four projection tests cover:

1. All 100 fixed founding seeds: all 24 founders represented, unique positions on eligible ground, identical output after JSON restoration and unchanged canonical state.
2. RIVERSIDE week 48: the current 23 residents replace the founding count of 24.
3. A controlled large-population display input: at most 96 dots while retaining the full population count of 5,000. This is a presentation fixture, not a simulated trajectory.
4. Extinction and construction exclusion: no dots for zero population and no dots on a reserved project tile.

The browser flow resumes the real week-48 save, checks its population description, hides the dots, saves and verifies the unchanged digest, then reloads, resumes, steps and matches the week-49 Node digest. The existing phone camera test now also checks the visibility button with keyboard activation: pixels change when hidden, restore exactly when shown, and the final saved history remains identical.

Local full verification passes **118 core tests** and **87 browser checks** across Chromium 156.0.8078.4, Firefox 157.0 and Playwright WebKit 27.2, alongside formatting, strict types, 27-module boundaries and the production build. Existing seed/long-run, old-save compatibility, ownership, rollback, phone sheet, focus, enlarged-text and runtime-parity checks remain included.

[Desktop](evidence/phase1-population-desktop.png) and [phone](evidence/phase1-population-phone.png) screenshots show the actual RIVERSIDE founding world with 24 dots, at the 18px zoom level. Both captures were inspected; the capture flows reported no page or console errors. Browser checks also exercise the default 12px view, zoom changes, 320/390/768/1280px layouts and 44px controls. These are desktop-browser engineering observations, not physical-device or selected-art acceptance.

## Existing development warning and remaining gates

The local Firefox suite emitted an intermittent React development warning through Vite's console forwarding around context teardown; browser console assertions and all functional checks passed. An isolated five-context, ten-step comparison reproduced the warning with the original viewer from `4aeb121`; the marker viewer had no warning in that comparison. This identifies a pre-existing viewer lifecycle follow-up, without claiming that every occurrence or its root cause is resolved. The controlled comparison did not modify production source files.

Task 1.17's functional state-derived rendering is complete. Selected Illustrated Minimal references remain unavailable, and gate 0.6 stays open. Physical Android/installed Safari evidence, human understandability/engagement review and final autosave-policy acceptance are still required before accepting Phase 1 and entering P2. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).
