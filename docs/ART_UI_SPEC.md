# Direction C — Naturalist's Observation Desk

**Decision:** Direction C is the **approved presentation baseline** (user confirmed 2026-10-08, Pacific time). This approves the visual direction and information hierarchy, **not** every pixel-art setting, screen layout dimension, sprite, or technology choice.

## Visual identity

A living **top-down** pixel-world terrarium accompanied by an understated historian's notebook. Watch a place change over decades, see small individuals living in it, select an event and inspect exactly what happened. The log is as important as the map: both read the same simulation state.

- **Mood:** curious, organic, quietly fantastical but emotionally capable of portraying grim losses and warm communal successes. Avoid excessive HUD chrome, over-animated effects, neon colors and noisy visual information.
- **World:** **simple, stylized original orthographic sprites**, inspired by RimWorld's map legibility and restraint, with slightly more artistic detail (roof texture, expressive shape, clothing accents, foliage). **Avoid the densely detailed/isometric medieval diorama seen in earlier exploratory mockups.** River, woodland, farmland, paths, houses, storehouses and people reflect actual state. See [ART_STYLE_REFERENCE.md](ART_STYLE_REFERENCE.md).
- **UI:** relatively crisp nonpixel typography for long chronicle entries and inspecting statistical details. Discrete accents may evoke an ink-and-parchment field journal, but prioritize readable contemporary layout.
- **Fantasy tone:** middle fantasy. First playable world can appear primarily mundane. Later magic/creatures should visually differ from mundane entities because those effects exist in sim rules, not as ungrounded set dressing.
- **Avoid:** mandatory isometric projection, dense medieval manuscript ornamentation, fake narrative text disconnected from state, unreadably small pixel-font paragraphs, and a continent-level interface before there are multiple settlements.

## Desktop information hierarchy

```text
┌─────────────────────────────────────────────────────────────┐
│ Story Generator  [Seed] [Year/Season] [Pause] [Step] [Speed] │
├────────────────────────────────────┬────────────────────────┤
│                                    │ WORLD CHRONICLE        │
│   LIVING PIXEL WORLD               │  Year 42 — event...    │
│   (pan / zoom / select)            │  Year 41 — event...    │
│                                    │  Year 40 — event...    │
│                                    │  [filters later]       │
├────────────────────────────────────┴────────────────────────┤
│ INSPECTOR: selected place / building / person / event       │
│ State, relationships, origin and cause/effect (as available)│
└─────────────────────────────────────────────────────────────┘
```

- Map approximately **70%** of primary width and chronicle around **30%** on a comfortably sized desktop viewport. Exact breakpoint and widths are proposals for implementation testing, not locked.
- A chronicle click recenters/highlights its linked location and opens event facts; nothing mutates the simulation.
- Inspector appears only when selecting an object/event, ideally integrated in the side panel or a lower drawer to avoid blocking the map.
- Top status stays succinct: season, current year, seed and pace. Sim metrics live in the inspector, not a dense permanently visible HUD.

## Phone information hierarchy

- Full-width, touch-friendly map is the primary surface.
- Compact pinned date/seed/time controls (may collapse less common controls).
- Chronicle via a **user-controlled bottom sheet**, with headline preview when collapsed and scrollable history when expanded.
- Selected event/detail can appear within the sheet, with a clear return-to-map action.
- Tap and drag to pan, accessible zoom controls (do not rely solely on pinch), sensible hit areas.
- The expanded sheet must not hide the entire map without a way to dismiss it; back navigation should be predictable.
- Core functions must work without hover and without a physical keyboard.

## Pixel art and rendering parameters: proposed for visual prototyping

| Choice | Working proposal | Why / validation |
| --- | --- | --- |
| Camera projection | Orthographic top-down, 2D | Readable map; simple hit testing; matches approved direction |
| Logical terrain size | ~64 × 40 tiles for Phase 1 | Manageable simulation; first-map constraints from roadmap |
| Source tile art | **Undecided**; compare 24, 32, 48-pixel candidates or simple vector-like sprite units | Prior 16px suggestion was not approved; choose based on artwork and phone readability |
| Scale | Integer nearest-neighbor scaling for rendered sprites where practical | Preserve crisp pixel edges; avoid fractional blur |
| Zoom | Preview multiple effective art scales, plus fit-to-world | Zoom must suit selected source-art method, not presume 16px tiles |
| Motion | Sparse: brief walking cues, water movement, growth/season cues, event highlight | Reduce visual distraction; UI motion does not touch sim RNG |
| Palette | Restrained olive/forest, slate-blue, warm earth, muted jewel-toned highlights for meaningful fantasy elements | Artistically stylized, limited noise; contrast review |
| UI text | Readable sans-serif body text, not tiny all-pixel lettering | Efficient continuous reading of histories |
| Events | Subtle pulse/marker and log entry, persistent selectable object | The chronicle and map must show the same state |

These are **candidate values**. Confirm with a full desktop view and at least one realistic phone screen before finalizing art assets.

## Event/chronicle visual behavior (Phase 1 scope)

1. A canonical state update emits an event with ID, time, place, actors if known, causal facts and changed values.
2. Map displays the changed state and optionally a brief highlight around the actual event location.
3. Chronicle appends a headline or groups repetitive minor events by timeframe/importance (without inventing claims).
4. Clicking an event selects the exact historical record, highlights the relevant tile/entity and opens the source facts.
5. If a historical entity no longer exists, its last recorded location and prior identity still resolve to history; inspectable depth increases in later phases.
6. Pause, follow, inspect, and opening/closing panels must never consume sim random numbers or alter outcomes.

## Usability acceptance for visual gate

- [x] Direction C chosen as baseline
- [x] Approved direction recorded in repo design and decision docs
- [ ] Verify pixel complexity and contrast at actual displayed sizes on phone and desktop
- [ ] Compare three simple original art treatments; decide actual source sprite size, pixel density, zoom and movement emphasis (not a mandatory 16px tile)
- [ ] Confirm collapsed/expanded chronicle on representative phone width via static layout/prototype
- [ ] Check event selection, map focus and inspector on desktop and phone
- [ ] Approve UI specs and resolve any art constraints before generating production sprites

## Following and spotlight indicators (future phases)

- Inspection/selection is purely visual. A passive bookmark can store a user interface preference.
- When the later deliberate **Story Spotlight** feature arrives, distinguish its explicitly activated **expanded opportunity eligibility** from selection. A subject might encounter more *possible* choices, but can still reject, fail or never act on them. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md).
- Place spotlight badges/markers with restraint; do not overload sprites or suggest outcomes are guaranteed. The first visual prototype need not implement spotlight logic.

## Out of scope

Full continent views and political overlays arrive in Phase 4. Detailed individual biographies in Phase 2/5. Viewer nudges remain deferred outside approved development milestones.

## Art direction refinement checkpoint

Compare three simplified original treatments of the **same** overhead village composition and chronicle: minimal graphic, illustrated minimal (preferred candidate), and soft illustrative. Only then finalize exact pixel density, silhouette detail and production assets. This does **not** reopen the approved Direction C interface structure.

## Recommended continuation

Proceed to architecture review in [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md), then confirm numerical simulation rules for Phase 1; static visual verification remains a gate before implementation.
