# Game design proposal (v0.1)

> **Proposal, not locked canon.** Revisit visual tone, simulation scope, and intervention before Phase 1.

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

## Simulated worlds: three tone candidates

- **Grounded early-medieval:** weather, disease, family ties, labor, local politics, migration, war.
- **Low fantasy (recommended default to discuss):** all of the above, plus rare supernatural phenomena with economic and political consequences.
- **Strange/alien civilization:** original biology, cultures and resource rules; large creative potential but a more demanding first build.

## Interaction choices still open

- **Pure Observer:** no influence; watch and archive histories.
- **Soft Intervention (candidate):** optional rare nudges such as changing weather or placing an anomaly; every action appears in the world's record.
- **Full God Sandbox:** edit geography, spawn actors, reshape societies; ambitious, potentially undermines organic storytelling.

Default planning assumption: **Observer first**, optional intervention as a future mode.

## Non-goals for first playable version

- Full individual pathfinding on a planet-wide tile map.
- LLM-authored events as the simulation's source of truth.
- Multiplayer, combat tactics, modding UI, economy with hundreds of goods.
- Beautiful sprite packages before the simulation produces interesting histories.

## Next design checkpoint

Confirm (1) grounded, low-fantasy or alien tone, (2) whether the player is spectator-only, and (3) whether the visual emphasis should be miniature village or continent map. Those decisions should guide the art mockups and first vertical slice.
