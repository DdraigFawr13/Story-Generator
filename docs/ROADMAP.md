# Roadmap

Detail for every phase lives in [REBOOT_PLAN.md §9](REBOOT_PLAN.md#9-phases); once a phase has a spec in `docs/phases/`, the spec wins where they differ. Each phase gets a spec of at most two pages in `docs/phases/` before implementation and ends with a playtest check-in.

| Phase | Name | Size | Key output | Status |
| --- | --- | --- | --- | --- |
| 0 | Reset and skeleton | 2–3 PRs | New docs, slim CI, engine core, person record, `?next` | Done ([spec](phases/PHASE_0.md)) |
| 1 | World generation | 6–7 PRs | Topography, seasonal climate, rivers, biomes, resources, aura, fertility and wildness, world map, names, passes and harbours, routes | Done ([spec](phases/PHASE_1.md)) |
| 2 | Legends | 6–8 PRs | Races, cultures, inheritance, sites, demographics, families/dynasties, history, legends browser | Done ([spec](phases/PHASE_2.md)) |
| 3 | Live site (**Milestone A**) | 10–14 PRs | Full everyday life thinly: needs, mood, health, environment, family, relationships, work, threats, light magic; saves | Built: M3.1–M3.12, the village life pass and the close; playtest add-ons (weddings and fame, colleges and free cities, culture values, closer peoples, more races and peoples, compact continents, roaming beasts, more land and free cities); Milestone A playtest next ([spec](phases/PHASE_3.md)) |
| 4 | Living world | 8–11 PRs | Site life fixes (M4.0), monthly world during play, world↔site links, medium politics/trade, trade between peoples, deeper life, perilous places and expeditions (M4.7), named battles (M4.8), annals of each people (M4.9), dwarven holds (M4.10), armies and settlers moving on the map (M4.11) | M4.0 site life fixes, M4.11 armies and settlers on the map (2026-10-17), M4.8 named battles, M4.9 annals, M4.10 dwarven holds and M4.7's history part (expeditions and perilous places) built (2026-10-14); M4.7's map layer and Places page, M4.6, M4.4 and M4.1–M4.3 still to come |
| 5 | Magic depth | 5–7 PRs | Schools, lineages, books, magic in life and war, enchanting, magical beasts, race dependencies, legends' deeds (M5.5), dragons as individuals (M5.6) | M5.5 legends as champions and M5.6 dragons as individuals built (pulled ahead, 2026-10-14); M5.2 spellbooks and lineages built 2026-10-16 |
| 6 | Kingdoms | 6–8 PRs | Governments, succession wars and dynasties, diplomacy, court intrigue, armies, deep trade, multiple sites, bigger worlds | Succession wars and dynasties built (pulled ahead, 2026-10-14); court intrigue built (2026-10-16); diplomacy built (2026-10-17); house family trees in the People room (2026-10-17, #124); vassals in the UI and the dragon at court still to come |
| 7 | Institutions | 5–8 PRs | Guilds, temples, orders, gods and holy wars, attitudes to magic | Religion (faiths, high priests, prophets, schisms, holy wars) built (pulled ahead, 2026-10-14); its screens come with the UI redesign |
| 8 | Hybrid modes | 5–8 PRs | Steward mode, follow-a-character mode | |
| 9+ | Expansion | ongoing | Art, sliders, races, z-levels, narrator | |

## Build order after Phase 3

Since 2026-10-14 work follows Morgan's ranked list rather than phase order: legends as champions (M5.5, built), site life fixes (built), named battles, annals of each people, dwarven holds, succession wars and dynasties (built), dragons (M5.6, built), religion (built), spellbooks and lineages (M5.2, built), court intrigue (built), story threads, expeditions (history part built), diplomacy (built), trade between peoples, the world moving during play, then armies and settlers moving on the map (M4.11, added 2026-10-14 from Morgan's playback notes; built 2026-10-17). The UI redesign (Four rooms, [spec](phases/UI_ROOMS.md)) runs alongside: the Tales, People, Book and Town rooms are built, with the after-play map (#117) and the house family trees (#124, 2026-10-17). The full list with value and effort, what is left of it and a proposed next set for Morgan to pick from are in [REBOOT_PLAN §9](REBOOT_PLAN.md#build-order-after-phase-3-morgans-ranked-list-2026-10-14).

## Deferred decisions (asked when the phase arrives)

- Switching the watched site (Phase 4 or 6).
- Magic school flavour, whether to extend the flat list of six schools, and the casting-cost fork (Phase 5).
- The institutions brief (Phase 7); the order of Phases 7 and 8 (Phase 6 check-in).
- Z-levels, the LLM narrator, more races, sliders, a beta save lock (Phase 9+).
