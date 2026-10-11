# Phase 2 — Peoples and Legends

**Goal:** after the map generates, about 250 years of history run in a few seconds. Peoples settle the best land, grow, starve, migrate, trade, raid and go to war, and leave ruins, dynasties and legends behind. You browse who lived, what happened and why, on the map and in a linked legends browser.

## Status

Approved 2026-10-11 with all four recommended fork answers. M2.1 done: race and culture sketches approved 2026-10-11 (Tylwyth, Dvergar; Gwerin, Skarn, Tarqai, Ushani, plus one culture each for Tylwyth and Dvergar, 6 in all). Next: M2.2. Builds on Phase 1: fertility, wildness, resources, aura spots, regions (passes, fords, harbours) and the route graph.

## Milestones

**M2.1 Races and cultures** (~600 lines, mostly content)
- Real race sketches replace the two placeholders (fork 1); 4 human cultures (fork 2) with values weights, marriage and inheritance customs, default government, attitude to magic, religion tag, name tables and preferred biomes.
- `CultureDef` in `content-types.ts`; `content/races.ts`, `content/cultures.ts`, per-culture syllables in `content/names.ts`.
- `validateContent` checks biome ids (today's placeholders point at ids that don't exist, such as `river_valley`) and race balance (R-29).
- Tests: validation catches a bad biome id and an unbalanced race.

**M2.2 Settlement and sites** (~900 lines)
- `engine/history/settle.ts`: 3–8 civs (more on more landmasses). Each starts from 1–2 founding sites (fork 3) on route nodes or fertile river cells its race and culture favour.
- `Site` kinds: hamlet, village, town, city, fortress, mine, temple, port; ruins and lairs come in M2.4. Carrying capacity = fertility, fish and game within 3 cells, plus trade access (port, ford, road). Mines need a deposit; temples prefer aura spots; ports need a harbour.
- Population as counts by race, culture and age band (child, adult, elder from the race's maturity and lifespan).
- Map: Sites overlay (glyph by kind, size by population) and a Civs base layer (territory = cells nearer a civ's sites along the route graph). Inspector "Site" block.
- Tests: tiny-fixture placement prefers fertile river cells; no site in sea or on a lake.

**M2.3 Yearly history: life and land** (~1,000 lines)
- `engine/history/` systems, yearly, fixed order: harvest (from fertility, a drought roll from `risk.drought`, a harsh-winter roll from `risk.snow`), demographics (births, deaths, ageing by band, growth of 1–3% toward capacity), famine when stores run out, plague (1–3% per region per decade, spreading along routes), migration along route edges to better-fed sites, expansion when a site passes 80% of capacity.
- Every change emits an event with a template and cause links: famine → migration → new village.
- Runs in the worldgen worker after the routes stage, with progress per decade.
- Tests: a site in a drought cell starves before one on a floodplain; plague only travels along routes; determinism over 50 years.

**M2.4 Beasts, trade and war, thinly** (~1,000 lines)
- `content/creatures.ts`: wolves, bears, great beasts and a few rare legendary beasts, each with a biome, a wildness threshold and a danger. Lairs spawn in wild cells and raid sites within reach; a hero can slay them.
- Thin trade: once a decade each site swaps surplus for shortage with its route neighbours; salt, iron and gems matter.
- Thin war: grievance (raids, border clashes, insults between notables) plus opportunity (strength ratio, route distance, passes and fords in between) over a threshold. A battle resolves on strength plus randomness under R-24. Conquest moves a site to the winner; razing makes a ruin.
- Tests: no war without a grievance event in its causes; ruins persist; some seeds have no war in a given century.

**M2.5 Notables and families** (~1,200 lines)
- Notables are created by deeds (founding, leading, slaying, winning, a strong mage birth) plus each civ's ruler and heirs; cap about 3,000 alive. Others stay counts.
- Births use the existing `rollAptitude` (race, parents, birthplace aura), so bloodlines and high-aura birthplaces show. The legend cap (at most 3) is enforced.
- Marriages, children, dynasties, rivalries and sworn enemies; succession by culture rule, including disputed successions; artifacts and books made, inherited, lost and stolen.
- Tests: family links are symmetric; the dead stay dead; legend cap holds over 250 years.

**M2.6 Notability and biographies** (~600 lines)
- `importance = base(type) + fame(actors) + scale + novelty` (REBOOT_PLAN §10); historian templates for every event type; biography assembly per notable, site and civ; trivial events roll up into yearly aggregates.
- Drama check: `npm run drama -- --seeds 5 --years 250` adds history time, civ and site counts, peak and final population, wars, famines, plagues, ruins, notables, legends alive, race shares and the longest cause chain.

**M2.7 Legends browser and timeline** (~1,000 lines; mock-up first, fork 4)
- A Legends view beside the map: search and lists of civs, sites, races, figures, families, beasts, artifacts and events. Every name links; every event shows "why?" through its cause chain.
- A year slider on the map shows borders, sites and ruins at any year. Opening a site, figure or event centres the map on it.
- Smoke test: generate → open legends → follow a cause link → back to the map.

**Close:** drama check over 5 seeds, the playtest check-in (REBOOT_PLAN §1E) and race and culture sketches recorded in `CONTENT_GUIDE.md`.

## Data shapes

```ts
interface Civ { id: Id; name: string; raceId: string; cultureId: string; capital: Id;
  founded: number; fell?: number; rulerId?: Id; grievances: Map<Id, number> }
interface Site { id: Id; name: string; kind: SiteKind; cell: number; civId: Id | null;
  founded: number; ruinedYear?: number; pop: PopBand[]; stores: number; wealth: number }
interface PopBand { raceId: string; cultureId: string; band: 'child' | 'adult' | 'elder'; count: number }
interface Creature { id: Id; defId: string; lair: number; born: number; died?: number; deeds: Id[] }
interface Item { id: Id; kind: 'artifact' | 'book'; name: string; made: number; holder: Id | null; deeds: Id[] }
interface WorldState { civs: Map<Id, Civ>; sites: Map<Id, Site>; creatures: Map<Id, Creature>; items: Map<Id, Item>; … }
// Person gains: siteId, civId, title?, causeOfDeath?; Person.deeds already exists.
```

## Cross-domain links

- Fertility, rivers and fish → site capacity → famine → migration along the route graph → new villages.
- `risk.drought` and `risk.snow` → bad harvest years → famine and plague deaths → grief and succession in notable families.
- Resources → mines, trade value and envy → grievance → war; passes and fords decide where armies cross.
- Wildness → lairs and beasts → raids → heroes and legends.
- Aura spots → temples and mage births through `rollAptitude` → magical bloodlines (R-26).
- Harbours and sea lanes → ports → faster trade and faster plague.

## Defaults chosen

- **Clock:** a yearly step (R-21); 250 years by default (`params.historyYears`).
- **People:** counts by age band; notables only as full records, capped near 3,000 alive.
- **Budget:** 250 years in under 10 s in the worker on desktop, measured by the drama check, not gated in CI.
- **Territory:** route-graph distance from a civ's sites, not drawn borders.
- **No director:** every outcome comes from weighted rules in content; tuning is by weights only.

## Design forks (decided 2026-10-11)

1. **Races:** keep the two placeholder shapes (a long-lived, magic-leaning forest people and a strong, slow-breeding mountain people) as the base for the sketches? **Decided: yes.** Full sketches (names, numbers, downsides) come for approval as a doc at the start of M2.1.
2. **Cultures:** 3 or 4 human cultures? **Decided: 4**, roughly one per continent.
3. **Start:** civs grow from 1–2 founding sites, or start already spread across the land? **Decided: founding**, so expansion and first wars become stories.
4. **Legends mock-up:** approve a mock-up of the legends browser before M2.7 is built, as with the M1.4 viewer? **Decided: yes.**

## Tools and connectors

| Milestone | Tools |
| --- | --- |
| All | GitHub (branch, draft PR, CI); `implementer` (Sonnet) for bulk code, `test-runner` (Haiku) for checks; Vercel to confirm the production deploy after each merge |
| M2.1 | Claude Docs for the race and culture sketches you comment on |
| M2.2–M2.6 | `npm run worldmap` PNGs and drama output in shared files (`history/M2.x/`); an Artifact gallery per milestone |
| M2.3 | tldraw for the yearly-loop and cause-chain diagram if a doc diagram is not enough |
| M2.7 | Figma (or an Artifact) for the legends browser mock-up; Mobbin needs a paid plan |
| Close | A routine for a weekly drama run, if you want one |

Not used: Supabase and Stripe (no backend or payments, R-16); OpenArt (art is Phase 9+, R-17); Canva and Google Drive (nothing to publish there).

## Done when

- [ ] 3 seeds each reveal several interlinked stories in 10 minutes of browsing, such as a famine leading to migration and a new town, or a dynasty feud leading to war.
- [ ] Every chronicle line has a template, and every war, famine and migration has at least one cause link.
- [ ] Race shares stay balanced: no race above 70% of population on 4 of 5 seeds.
- [ ] Some civs flourish and some fall; every seed has at least one ruin.
- [ ] At most 3 legends alive at any time on every seed.
- [ ] 250 years run in under 10 s on desktop without blocking the UI.

## Out of scope

The live site and daily life (Phase 3); history running during play (Phase 4); magic schools in depth (Phase 5); deep trade and politics (Phases 4 and 6); world-gen sliders; final art.
