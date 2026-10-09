# ADR-002 — Canvas map, HTML panels and fixed-tick controller

**Status:** Proposed. **Date:** 2026-10-09. **Decision owner:** repository owner.
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
