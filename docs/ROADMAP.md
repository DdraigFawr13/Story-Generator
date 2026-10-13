# Roadmap

Detail for every phase lives in [REBOOT_PLAN.md §9](REBOOT_PLAN.md#9-phases); once a phase has a spec in `docs/phases/`, the spec wins where they differ. Each phase gets a spec of at most two pages in `docs/phases/` before implementation and ends with a playtest check-in.

| Phase | Name | Size | Key output | Status |
| --- | --- | --- | --- | --- |
| 0 | Reset and skeleton | 2–3 PRs | New docs, slim CI, engine core, person record, `?next` | Done ([spec](phases/PHASE_0.md)) |
| 1 | World generation | 6–7 PRs | Topography, seasonal climate, rivers, biomes, resources, aura, fertility and wildness, world map, names, passes and harbours, routes | Done ([spec](phases/PHASE_1.md)) |
| 2 | Legends | 6–8 PRs | Races, cultures, inheritance, sites, demographics, families/dynasties, history, legends browser | Done ([spec](phases/PHASE_2.md)) |
| 3 | Live site (**Milestone A**) | 10–14 PRs | Full everyday life thinly: needs, mood, health, environment, family, relationships, work, threats, light magic; saves | In progress: M3.1–M3.10 done ([spec](phases/PHASE_3.md)) |
| 4 | Living world | 6–8 PRs | Monthly world during play, world↔site links, medium politics/trade, deeper life, perilous places and expeditions (M4.7) | |
| 5 | Magic depth | 5–7 PRs | Schools, lineages, books, magic in life and war, enchanting, magical beasts, race dependencies, legends' deeds (M5.5), dragons as individuals (M5.6) | |
| 6 | Kingdoms | 6–8 PRs | Governments, diplomacy, armies, deep trade, multiple sites, bigger worlds | |
| 7 | Institutions | 5–8 PRs | Guilds, temples, orders, attitudes to magic | |
| 8 | Hybrid modes | 5–8 PRs | Steward mode, follow-a-character mode | |
| 9+ | Expansion | ongoing | Art, sliders, races, z-levels, narrator | |

## Deferred decisions (asked when the phase arrives)

- Switching the watched site (Phase 4 or 6).
- Magic school flavour, whether to extend the flat list of six schools, and the casting-cost fork (Phase 5).
- The institutions brief (Phase 7); the order of Phases 7 and 8 (Phase 6 check-in).
- Z-levels, the LLM narrator, more races, sliders, a beta save lock (Phase 9+).
