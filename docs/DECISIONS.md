# Decisions

Locked decisions from the 2026-10-11 reboot Q&A. Don't reopen them without asking the user. Full wording and context: [REBOOT_PLAN.md §3](REBOOT_PLAN.md#3-locked-decisions). The pre-reboot register (D-001–D-032) is in [archive/DECISIONS.md](archive/DECISIONS.md); only D-026 (main-only deploys) carries forward.

| ID | Decision |
| --- | --- |
| R-01 | Observer first; later hybrid modes per run: steward a settlement/institution, or follow one character. |
| R-02 | Keep the stack (TypeScript, React, Vite, Canvas 2D, Vitest, Playwright, Vercel main-only); rebuild the sim core. No old saves, rule versions or gates. |
| R-03 | Determinism is a cheap convention: seeded RNG, fixed update order, one same-seed test. No cross-version replay. |
| R-04 | World first with coarse history, then zoom into one live site, DF-style. |
| R-05 | Customize through content files and agent-added content; world-gen sliders later via a params object. |
| R-06 | "Efficient" = fast development, fast runtime (centuries in seconds, phone usable), drama visible at every scale. |
| R-07 | 2D with elevation; z-levels later. |
| R-08 | Several human cultures plus 2–3 original races from Phase 2, all content-defined. |
| R-09 | Nature, social/personal and outside threats deep early; politics and trade thin first. |
| R-10 | Medium world (~256×256, 3–8 civs, dozens of sites, a few thousand notables); bigger later. |
| R-11 | About 250 years of fast history, then live play. |
| R-12 | Magic early and light, important long-term. |
| R-13 | Magic rarity per race. Humans ~60% none, ~35% weak, ~5% real talent; strong mages 1 in several hundred or rarer. |
| R-14 | Numbers optional in the inspector; the chronicle stays narrative. |
| R-15 | First playable: world map + legends + one live site. |
| R-16 | Local data-driven templates with historian flair; optional LLM narrator seam later. No API key or backend. |
| R-17 | Simple coloured tiles and glyphs first; art pass later. |
| R-18 | Old docs archived; short new doc set. |
| R-19 | Desktop first, phone usable. |
| R-20 | Story text describes only real events; no scripted plots or protected heroes; collapse and extinction can happen; full moral range. |
| R-21 | Site ticks daily; world monthly in play and yearly in history. Speeds up to "run until notable" with auto-pause. |
| R-22 | Agents plan per phase, merge at milestones, ask on design forks; playtest check-in at each phase end. |
| R-23 | Story Spotlight folds into hybrid modes as "widen a person's options". |
| R-24 | **Scale ceiling.** Gifted ≈ 1–2 soldiers, Strong ≈ a squad, Exceptional ≈ a company, Legendary ≈ one low-end field army (~1,000) at most. 0–3 legends alive at once. Legends stay mortal. |
| R-25 | One aptitude system for skills, abilities and spells, with hard attribute requirements. |
| R-26 | Aptitude = race baseline + inheritance + environment/events. No spontaneous talent. |
| R-27 | Potential is fixed; skill grows toward it; physical attributes decline with age and injury. |
| R-28 | Magic is learned only from teachers, books and institutions, so knowledge can be lost. |
| R-29 | Every racial advantage carries a downside. Casting cost is a Phase 5 fork; default mild fatigue. |
| D-026 | Vercel production deploys only from `main`; branch previews off. See [DEPLOYMENT.md](DEPLOYMENT.md). |
| D-033 | Shared AI rules, agents, the session hook and the branch-cleanup workflow sync from AI-Master-Instructions (`.ai-master.json`); project rules stay in `AGENTS.md` and AGENT_BRIEF (2026-10-12). |

## Engineering defaults (recorded by agents)

| Date | Phase | Choice |
| --- | --- | --- |
| 2026-10-11 | 0 | Year = 12 months × 28 days (336 days). |
| 2026-10-11 | 0 | RNG = `sfc32`, one stream per `(seed, name)`. |
| 2026-10-11 | 0 | CI = `core` + Chromium smoke; no tiers or batteries. |
| 2026-10-11 | 1 | Default 3–5 continents plus islands (user choice); `params.continents`. |
| 2026-10-12 | 2 | Plan review ([doc](https://claude.ai/code/artifact/2b0ad371-743c-4abd-900a-11012026cb0d)), all recommendations accepted: race balance by mechanism with a survival floor instead of a 70% human ceiling; goods per site instead of one stores number; importance scoring pulled forward; legacy app deleted at Phase 2 close; one-page agent brief; cloud session hook. |
| 2026-10-12 | 3–5 | Magic, dragons, dungeons and items review ([doc](https://claude.ai/code/artifact/6ed1c2b5-be5b-4223-9bb0-d1a281a54da8)), all recommendations accepted: perilous places, hoards and expeditions as new M4.7; an item lifts its holder at most one magic tier and never past Legendary; a found item can awaken one tier once, as a chronicled event; dragons as individuals as new M5.6; the flat list of six schools stays until the Phase 5 fork. |
| 2026-10-13 | 4–7 | Legendary figures' deeds ([proposal](https://claude.ai/code/project/chan_0179dYk6bjUtGMabgghJ7DrS?thread=cmsg_0179dYk6bjUtGMabgghJ7DrS4Bc7M22fnZnM6BKy3XY9T5)): fame comes from deeds, not power (§1B.8); the strongest figure leads expeditions (M4.7); legends as champions, founders, avengers and rivals (M5.5); apprentices and great works (M5.2, M5.3); usurpation and betrayal (Phase 6); orders (Phase 7). |
| 2026-10-13 | 3 | The site speed guard (2.5 s for a year of 150 residents) runs alone after the unit tests (`tests/speed`), so the suite's load does not skew it (Morgan, M3.6 thread). |
| 2026-10-14 | 4–7 | Build order after Phase 3 follows Morgan's ranked list of fifteen additions ([list](https://claude.ai/code/artifact/f0a2128a-8c01-45d0-b3ed-802706df83d1), REBOOT_PLAN §9), legends as champions (M5.5) first; new M4.0 site life fixes, M4.8 named battles, M4.9 annals, M4.10 dwarven holds; succession wars, court intrigue and religion pulled forward. |
| 2026-10-14 | 5 | Dragons (M5.6): up to three alive at once by world size (one per 20,000 map cells: 1 at 128, 3 at 256), replacing "at most one per world"; danger stays 700 (Morgan, on the M5.6 card). |
| 2026-10-14 | 4 | Armies and settlers move on the map (M4.11, build order 16): one host per side per war, drawn from battle to battle and meeting the enemy's host, instead of a new flag per battle; settlers walk from the town they left to the land they found (Morgan, from the Tales playback). |
| 2026-10-14 | 7 | Religion pulled forward: a faith per culture religion with gods, two sacred values and one abhorred; clashing faiths make denunciations and holy wars; high priests, rare prophets (at most 3 alive), schisms and conversion by towns then rulers (Morgan, on the religion card). |
| 2026-10-17 | 6 | The dragon at court (P1 of the proposed next set, build order 17) is next, beside the family tree (Morgan, on a card in the plan thread): realms near a dragon court it and may set it on their enemies, fear it and pay a standing tribute, or put a bounty on it that a figure takes and hunts with a lent host; a bounty hunt kills the legend about 1 in 10 times (Morgan's hunt rule of 2026-10-16), not "more often than not". |
| 2026-10-17 | 5 | Great works and enchanting (P3 of the proposed next set, build order 18) is next (Morgan, on a card): a legend or a rich realm raises one wall, bridge, tower or warded grove in a lifetime, each with an effect on war, wealth, lore or harvest; a legend whose town fits none makes a great item; Strong mages who know a strong spell enchant items from beast remains or rare ore, so lost lore stops enchanting (R-28). The map glyph waits for the Tales map polish. |
| 2026-10-17 | 4 | Generation feuds and exile (P4 of the proposed next set, build order 19) is next (Morgan, on a card): house feuds pass to heirs and turn with each killing; killers of their own people, some losers of a disputed seat and beaten claimants go into exile and may return pardoned or to claim the seat; inheritance quarrels split houses. Legends are seldom the target (1 strike in 5, killed 15 in 100). |
| 2026-10-17 | 5 | Great beasts and the restless dead (P7 of the proposed next set, build order 20) is next (Morgan, on a card): non-dragon great beasts get names, tempers (savage, unforgiving, toll-taker) and named lairs; a robbed barrow wakes its buried ruler, who hunts the robbers' realm until it falls or priests lay it to rest. Savage raids x1.5 and a toll of 15% of stores, tuned down from x2 and 25% after 64-cell test worlds lost a quarter of their towns. |
| 2026-10-17 | 7 | Orders and academies (P6 of the proposed next set, build order 21) is next (Morgan, on a card): a legend founds an academy or a knightly order (a hero or captain of renown an order too) that recruits, passes from head to head and keeps the founder's lore only while a scholar knows it; each people reveres, licenses or hunts magic by its values, and a hunting people burns or drives out its mages, a legend only rarely (Morgan's rule of 2026-10-16). |
| 2026-10-17 | 4 | The rough-edges bundle (P8 of the proposed next set) runs beside the faith pages (Morgan, on a card, "Both"): a children's illness (the croup) brings town child deaths up to history's rate, orcs breed faster (fertility 1.25) to undo the wolf-pack thinning, and dwarves seek out mountain passes. Cross-border trade needed no change (26% to 30% of trades). |
| 2026-10-17 | 6 | Rulers with character and bynames (H2 of the second proposed set, build order 22) runs beside the orders pages (Morgan, on a card): each ruler and legend has a temper (bold, pious, greedy, cruel, cautious, learned) scored from attributes, values and upbringing with no RNG draw; it tilts war, tribute, witch hunts, great works, courting a dragon, pardons and betrayals, and the chronicle gives the why. Bynames come from deeds (the Dragonslayer, the Oathbreaker), or from two choices a temper decided (the Bold), one per life, never twice among a realm's living. |
| 2026-10-31 | all | Check runs go to the Haiku test-runner, not the main session (Morgan, on a card, "Yes, Haiku runs checks"), overriding DEL-02 for checks: on `npm run check` and the 10-seed drama diff it matched the main session's findings in 70 s at about $0.01 against about 2 min and $0.25 (estimates). |
| 2026-10-17 | 7 | Orders and academies pages (S1 of the second proposed set) run beside rulers with character and bynames (H2) (Morgan, on a card, "Orders pages + Rulers"): a page per order and academy in the People room, reached from person, realm and town pages, the Book and the Legends list. Members serving now come first; a member's deed is their most important one while a member from the person page's deed groups; a knight's hunt is one set out from a beast's raid on their people (the only hunts that carry a raid as cause). |
