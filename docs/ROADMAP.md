# Phased plan and acceptance gates

**Status: approved strategic scope; implementation steps are documented but not yet started.** The complete ordered implementation checklist, dependencies, and acceptance gates live in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Middle fantasy is the starting direction; spectator nudges are an explicitly deferred future idea. Complete and test one phase before expanding the next.

## Phase 0 — Concept and repository groundwork (current)
- **Decided:** living-world vision with settlement-first scaling; middle-fantasy starting tone; spectator-only initial implementation.
- **Pending:** approve visual target, technical stack/ADRs and Phase 1 numerical simulation contracts.
- Publish design pillars, simulation architecture, proposed UI, and roadmap.
- Define a small, testable first vertical slice.
- Establish branch/PR hygiene and automatic merged-branch cleanup where permissions allow.

**Done when:** design choices are reviewed and Phase 1 can be built without inventing unrelated mechanics.

## Phase 1 — The Living Settlement (first playable)

**Scope:** One seeded map (~64x40 logical tiles), founder households and a single settlement. Seasons advance; vegetation, farmland, stores, dwellings and resident dots visibly change.

- New World: enter seed or generate one.
- Run, pause, one-step, 1x/4x/16x time.
- Simulated fertility, food production/consumption, weather variance, births/deaths, housing capacity, growth and decline.
- At least four **state-driven** historical event families: founding, harvest/shortage, construction/decay, population changes.
- Real-time chronicle, click-to-highlight events, selected-place details.
- Repeatable seed with 1000-tick test and event-history consistency test.

**Done when:** two seeded runs visibly diverge, same seed replays exactly, and the map and log agree about what changed.

## Phase 2 — People, memory and consequences

- Named individuals/families, jobs, relationships, needs and simple migrations.
- Reasons behind decisions, not independent random outcomes.
- Multi-step chains: surplus → construction → growth; shortage → unrest → migration or mortality.
- Filter log by actor, settlement, category, severity.
- Spotlight a person/family and see a chronological biography.

**Done when:** inspecting a historical figure reveals actions actually taken and relationships affect choices.

## Phase 3 — Institutions, politics and culture

- Council/chieftain/monarchy candidates; succession and legitimacy.
- Wealth, trade, law, social tensions, faith/culture, research and discovery.
- Political and economic interventions arise from conditions and actors.

**Done when:** distinct governing structures produce different historical trajectories under comparable stresses.

## Phase 4 — Multiple settlements and a region

- World map, resource regions, migration trails, roads, trade, alliances, conflicts and borders.
- Nested simulation detail: inspect individual settlements, aggregate less relevant areas.
- Long-lived ruins, dynasties, successor factions, renamed places, shifting boundaries.

**Done when:** settlements can found, ally, split, conquer, absorb, decline and rebuild without scripted end conditions.

## Phase 5 — Chronicle and spectator depth

- Event dependency graphs ("why did this happen?"), timelines, bookmarks, historical era summaries.
- Replay/scrub and save/load; seed sharing and exportable chronicles.
- Observer-only tools, bookmarks, inspection and non-mutating annotations. **No intervention system in the committed roadmap.**

**Done when:** a viewer can reconstruct a story spanning generations using only the world's events and inspection views.

## Phase 6 — Scope/performance/content expansion

- More biomes, species/cultures, trade goods, professions, diseases, technologies, disasters, diplomacy and lore systems.
- Pixel asset pipeline and layered effects, optimization, accessibility, mod-ready data definitions.
- Balance tests across thousands of deterministic seeds with metrics: survival, diversity, growth, event density, memory pressure.

## Suggested first demonstration

Seed `RIVERSIDE`: a small group begins next to a forest and river, clears land, builds huts and farms. Several seasons later the settlement may prosper, contract, relocate or fracture depending on simulated production, weather and demographic changes. The chronicle cites concrete state and relations. **Do not engineer a guaranteed dramatic catastrophe.**

## Process

- Short-lived scoped branch per phase or fix; one PR per branch.
- Tests required for deterministic engine changes.
- Prefer squash merges; remove merged source branches automatically.
- Never delete active/unmerged branches to tidy the list without checking ownership.
- Document revised rules and invariants alongside the code.

## Decisions and remaining Phase 0 gates

- **Decided:** middle fantasy, village-first to continent-scale, observer-first without current intervention implementation, browser-first responsive, open-ended history.
- **Remaining:** approve visual composition(s), choose stack/rendering/persistence details, define the initial numerical sim contracts and acceptance metrics. See [DECISIONS.md](DECISIONS.md).
- **Parked:** guided/on-demand nudges, alternate fantasy intensity profiles and additional species. See [DECISIONS.md](DECISIONS.md).
