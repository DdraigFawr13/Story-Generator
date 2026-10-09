# Phase 0.6 — Pixel-world visual exploration

**Status:** three design options proposed for review. They are **not approved art direction and not instructions to build the app**. One should be selected and refined before Phase 1 work. All variants depict the SAME simulation, not three distinct games.

## Nonnegotiable layout/data constraints

- World map is the primary information surface: visible river, terrain, crops, structures and agents grounded in sim state.
- Chronicle clearly identifies time, event headline, location and importance and opens an event cause/details view.
- Inspector reveals named characters/buildings/settlements and state-based reasons, reachable both from map and log.
- Time control: play/pause, single step and speeds, prominent current year/season and seed.
- Responsive: on phone, full map with an accessible chronicle tray; important map state remains readable.
- Show **real** world state in production. Mockup events below are explicitly illustrative, not evidence of implemented features.
- Colors, markers and text contrast should convey information without relying solely on hue.

## Direction A — The Illustrated Settlement

**Visual priority:** personal stories, visible people, intimacy.

- 3/4 desktop map, 1/4 scrollable chronicle; warm restrained earthy colors; clear 12–16px pixel tile logic.
- Small buildings with readable roofs, cultivated fields, a river, roads, orchard and few visible resident sprites.
- Timebar across the top; inspector as a focused bottom/right overlay.
- Information hierarchy: map selection first → people/family detail → narrative.
- Target emotional effect: watch a tiny village become a lived-in place over generations.
- Weakness: less immediate geographic scope when multi-settlement map expands.

**Mock data:** Year 28 Autumn / Redmere population 76 / a windstorm destroys a granary roof.

## Direction B — The Cartographer's Chronicle

**Visual priority:** geography, political history, continental scale.

- Wide orthographic/flat pixel regional map with rivers, ridges, trade routes and readable territorial labels.
- Right-hand ledger/log resembles a historical atlas; parchment accents but modern legible text.
- Bottom tabs for Settlement, People, Factions and History; zoom to a town to reveal buildings.
- Information hierarchy: realm/region overview → historical turning point → local outcome.
- Target emotional effect: read hundreds of years of a believable world's history as its borders shift.
- Weakness: more detached from personal lives at first, and higher UI complexity before Phase 4.

**Mock data:** Year 109 / two towns connected by trade / an old bridge closure causes rationing.

## Direction C — The Naturalist's Observation Desk (**recommended**)

**Visual priority:** a living pixel terrarium with the tools of a historian, without a full management dashboard.

- Crisp compact top-down pixel village map in cool forest greens with warm lamp/roof contrast.
- Chronicle occupies ~30% desktop as a light scholarly ledger, ordered live headlines and relationship links.
- Selection inspector slides over lower map or appears below event details; inspectors can pin a character.
- Time/seed controls remain separate from simulation metrics, minimizing visual clutter.
- Desktop split map + chronicle; on phone the log is a bottom sheet, with map focus maintained.
- Clear affordance to jump from an event to its world location and inspect contributing facts.
- Target emotional effect: like looking through a miniature lens while discovering the world's own history.
- Weakness: must carefully manage readability at small phone sizes and avoid cluttered microtext.

**Mock data:** Year 42 / Riverside population 83 / a miller's grievance and drought-related food shortage.

## Comparison

| Criterion | A Settlement | B Cartographer | C Naturalist |
| --- | ---: | ---: | ---: |
| Feel attached to individuals | High | Medium | High |
| Scale to regional history | Medium | High | High |
| Sim readability at Phase 1 | High | Medium | High |
| Mobile adaptability | Medium | Medium | High |
| Chronicle integration | Medium | High | High |
| First prototype scope | Low | Medium-high | Medium |

**Recommendation:** choose C, borrow the readable village sprites/lighting of A, and reserve B's geographical overlays for the multi-settlement phase.

## Before implementing Phase 1

- [ ] Compare three visual mockups and select preferred direction (or mix)
- [ ] Choose pixel-art complexity, map tile density, camera zoom range, and accessible label sizes
- [ ] Determine how residents/structures/important events are highlighted without aesthetic clutter
- [ ] Validate a phone-sized map/chronicle transition on a static prototype *before* coding the simulation
- [ ] Record approved choices in this file and `DECISIONS.md`
- [ ] Create renderer/stack ADR; set initial pixel art guidelines
- [ ] Only then close the design gate and begin Phase 1 engineering

**Source of truth:** `IMPLEMENTATION_PLAN.md` defines the implementation schedule. This file only defines the pending visual design gate.
