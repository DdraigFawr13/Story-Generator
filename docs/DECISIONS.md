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

## Engineering defaults (recorded by agents)

| Date | Phase | Choice |
| --- | --- | --- |
| 2026-10-11 | 0 | Year = 12 months × 28 days (336 days). |
| 2026-10-11 | 0 | RNG = `sfc32`, one stream per `(seed, name)`. |
| 2026-10-11 | 0 | CI = `core` + Chromium smoke; no tiers or batteries. |
