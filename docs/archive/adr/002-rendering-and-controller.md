# ADR-002 — Canvas map, HTML panels and fixed-tick controller

**Status:** Accepted by the repository owner on 2026-10-09. **Date:** 2026-10-09. **Decision owner:** repository owner.
**Scope:** Phase 0.7 / Q-003.

## Context

Direction C requires a readable pixel map synchronized with a chronicle and inspector on desktop and phone. Camera activity and frame timing must not change history. Canvas interaction needs a corresponding keyboard and readable HTML path.

## Proposed decision

Use Canvas 2D for the initial terrain/building/resident-marker renderer, with nearest-neighbor sprite scaling. Use normal HTML for controls, statistics, chronicle and inspection. Introduce PixiJS or a Web Worker only after measured performance demonstrates the need.

The renderer receives readonly view data and selection/camera state. It emits selection intents containing stable entity/tile IDs. It cannot call core reducers, consume simulation RNG or mutate resources. Cosmetic animation may use a separate presentation source; it never enters saved/digested world state.

A controller serializes play, pause, step, new-world, resume and save operations. Core execution remains fixed-tick; speed determines how often ticks are requested. requestAnimationFrame presents views and may trigger bounded controller work, but its timestamp never enters the simulation.

## Scheduling and publication

- Process ticks in the exact core rule order and commit complete ticks only.
- Limit work per event-loop turn and yield between batches; determine the batch budget from measurements.
- Publish only committed views. Renderer may skip intermediate presentations at high speed, while the archive retains every admitted event.
- Pause prevents the next tick from starting; single-step admits exactly one tick.
- Manual save captures the latest fully committed tick. New-world/resume replaces a world only after session/write coordination and candidate validation.
- On backgrounding, pause simulation scheduling and clear presentation timing debt. Returning does not simulate elapsed real-world time. Resume only through the play control.
- If execution cannot sustain the requested speed, show achieved progress honestly. Yielding or slowing requests must never reorder, partially apply or pretend to complete ticks.

These are control policies. Equal initial state and equal admitted tick count produce equal canonical outcomes regardless of speed, frame rate, visibility or selected place.

## Normal-speed target and scheduling proposal

D-015 recovers the user-confirmed target of roughly 10–15 minutes per simulated year. For the current proposed weekly calendar (48 ticks/year), 1x therefore needs 12.5–18.75 seconds per tick. **Proposed controller default:** 15,000 ms per tick at 1x (12 minutes/year), 3,750 ms at 4x (3 minutes/year), and 937.5 ms at 16x (45 seconds/year), excluding pauses or inability to sustain the requested rate. This exact default is not approved by the earlier architecture decision. Scheduler fractions are presentation timing; core arithmetic remains integer weekly ticks. The older branch's six-second daily tick belongs to its 120-day/year proposal and must not be reused with the weekly calendar.

Scheduler interval, accumulated presentation time and play state are outside authoritative snapshots/digests. A saved-world Resume restores a committed world paused; Play starts from fresh presentation timing. Hidden/closed time never accrues catch-up work. Review the resulting autosave loss window alongside Q-006 before adopting the exact interval.

Controller acceptance must cover hiding immediately before a due tick, hiding after a committed tick, repeated hidden/visible transitions, and save/resume while paused. Each return stays paused, preserves the committed tick/RNG/IDs and advances only after explicit Play or a foreground Step. These are future tests, not executed browser evidence.

## Interaction and accessibility

Provide keyboard-operable chronicle entries and an HTML inspector that expose the selected location/entity and its actual facts. Event activation focuses the corresponding place and inspector. Historical records remain inspectable after a building disappears.

Map panning/zooming and selection must support touch with sufficient targets. Readable text stays in HTML; meaningful state must not rely on color alone. Ensure focus remains visible and controls have accessible names. Avoid announcing every rapid tick through a live region; offer explicit status and pause/read behavior.

Visual density, palettes, target sizes and desktop/phone layouts are still governed by the pending art/UI validation. This ADR is not screenshot evidence or visual approval.

## Alternatives and consequences

Canvas suits a small tile grid with limited sprites. PixiJS would add batching/scene features at additional dependency cost. DOM/SVG tiles can support accessibility but may add many nodes at the proposed grid size; the accessible HTML inspection path avoids tying core state to the rendering choice.

Controller/view contracts permit replacing the renderer later. Worker migration must preserve candidate admission, run-session order and deterministic equivalence; it is not an automatic P1 dependency.

## Verification and reopening triggers

Compare equal-N runs at all advertised speeds and with different frame/selection schedules. Exercise pause/step, background/return and save capture under rapid advancement. Verify event/map/inspector agreement, keyboard operation and phone interaction.

Measure frame/tick latency and long tasks on target devices with a growing archive. Revisit rendering/worker choices when these measurements expose responsiveness problems. No numerical performance claim is made before implementation.
