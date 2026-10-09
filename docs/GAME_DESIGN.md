# Game design and agreed direction (v0.2)

> **Approved:** living world vision, settlement-first vertical slice, middle-fantasy baseline, initially observer-only. **Still to review:** final pixel size/mobile static layout and engineering contracts. **Approved visual baseline:** Direction C — Naturalist's Observation Desk; see [ART_UI_SPEC.md](ART_UI_SPEC.md). See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Core fantasy

Create a unique world from a seed. Press Play. Watch a society inhabit the land, struggle, grow, form institutions and relationships, sometimes fracture, and eventually die, change, or give birth to successor civilizations. The viewer can click what is happening to learn why it happened and read the accumulating history.

**A simulation that makes stories, not a story generator that pretends to simulate.**

### Design pillars

1. **Causality:** Every historically significant entry comes from an actual state transition with a clear reason; consequences remain in the world.
2. **Emergence:** Simple overlapping systems yield unplanned combinations and surprising outcomes, not a long list of disconnected random cutscenes.
3. **Observe at multiple scales:** A readable pixel map, persistent people and places, a timeline, and an inspectable chronicle all describe the same world.
4. **Unique and reproducible:** World seed + configuration + simulation version reproduce the same history; store this with the save.
5. **Legible complexity:** Show what happened and why, with layered detail from major headlines to individual lives.
6. **Unscripted endings:** No mandatory final collapse or prescribed age order. Extinction, migration, integration, renewal, or enduring stability are all possible.

## Product concepts considered

| Concept | Focus | Strength | Risk |
| --- | --- | --- | --- |
| A. The Living Village | One settlement and individual residents | Strong attachment to people and meaningful local change | Narrower world-scale politics |
| B. Chronicle of Kingdoms | Regional polities, territory, dynasties and wars | Rich historical arcs and world maps | Emotional distance from individual people |
| C. The Living World (recommended) | World-scale simulation with settlement/individual inspection | Personal-to-epic stories; flexible growth path | Potentially huge scope without careful levels of detail |

**Scope recommendation:** pursue C as a destination while shipping A as the **first playable vertical slice**.

## Player/viewer loop

1. Generate a world using a seed, biome settings, and an era baseline.
2. Follow the map while time runs (pause, 1x, 4x, 16x, single-step).
3. Notice a new headline or visual change, jump to its location.
4. Open a resident, structure, family, settlement, faction, or event to inspect its history, relationships, and causes.
5. Bookmark interesting actors/events, follow them through generations, and review the chronicle or timeline.
6. Export/share a seed and eventually a generated illustrated historical account.

## Visual layout direction

- **Main canvas (~65% desktop):** top-down pixel world with rivers, forests, roads, farms, houses, moving residents, weather, and overlays.
- **Right panel (~35%):** live chronicle (latest first, filter by importance). Clicking a log event focuses the map and opens its cause/effect record.
- **Top bar:** world name, seed, year/season, play/pause, speeds, next-event/single-tick, world status.
- **Bottom/expandable panel:** selected person, family, building, community, faction; relevant statistics and historical connections.
- **Mobile:** map as primary surface and collapsible chronicle/inspector; large touch targets, no hover-only controls.
- **Visual default:** restrained, readable pixel art; avoid visual overload and tiny text.
- **Later:** pan from continent to settlement via level-of-detail views; history timeline + genealogy + dynasty maps.

### Example of live chronicle (illustrative, not scripted)

- Year 12, Spring — **Riverside grain stores run low.** Two successive poor harvests and rising population exhausted reserves.
- Year 12, Summer — **The miller refuses the council's levy.** Grain shortages have reduced her household's ration, deepening an existing dispute.
- Year 12, Autumn — **A new group leaves Riverside.** Eleven people migrate north carrying grain and tools; a second settlement may result.
- Year 14 — **Northbridge opens its first marketplace.** Migrants from Riverside have established a trade route.
- Year 19 — **Riverside remembers the Grain Dispute.** A communal law forbids unilateral seizure of winter stores.

Each historical entry must link to the actual resources, locations, characters, causes, and changed outcomes in that run.

## World tone (approved)

**Middle fantasy:** believable settlements, politics, environment, material economies and intergenerational relationships, with real but unevenly available magic and fantastic creatures. Magical systems must affect the state and have costs/limitations. Do not establish full magic mechanics before their implementation phase.

Future configurable world profiles might be grounded, low-, medium- or high-fantasy and alien worlds, but they are not part of the active build. See [WORLD_TONE.md](WORLD_TONE.md).

## Viewer interaction: current and parked

**Approved current model: Pure Observer.** Explore the world, track people and places, inspect causes, bookmark events, and review chronology. These actions do not alter the simulated history.

**Parked idea (no active milestone):** small, optional observer nudges, either offered at natural moments or chosen by the viewer. Future design must explicitly consider causal honesty, limits and replay/versioning. Do not add intervention controls or roadmap commitments now; only avoid architectural coupling that would make valid externally sourced effects impossible later. See [DECISIONS.md](DECISIONS.md).

## Non-goals for first playable version

- Full individual pathfinding on a planet-wide tile map.
- LLM-authored events as the simulation's source of truth.
- Multiplayer, combat tactics, modding UI, economy with hundreds of goods.
- Beautiful sprite packages before the simulation produces interesting histories.

## Next design checkpoint

Direction C has been approved. Validate exact pixel-art, map controls and phone chronicle layout, then confirm proposed [architecture](ARCHITECTURE_REVIEW.md) and Phase 1 engine/rules contracts before coding.
