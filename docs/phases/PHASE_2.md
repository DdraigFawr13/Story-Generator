# Phase 2 — Peoples and Legends

**Goal:** after the map generates, about 250 years of history run in a few seconds. Peoples settle the best land, grow, starve, migrate, trade, raid and go to war, and leave ruins, dynasties and legends behind. You browse who lived, what happened and why, on the map and in a linked legends browser.

## Status

Approved 2026-10-11 with all four recommended fork answers. M2.1 done: race and culture sketches approved 2026-10-11 (Tylwyth, Dvergar; Gwerin, Skarn, Tarqai, Ushani, plus one culture each for Tylwyth and Dvergar, 6 in all). M2.2 done: 6 peoples on a default map, territory by travel cost from their sites (reach 150). M2.3 done: 250 yearly steps of harvest, demographics, famine, plague, migration and expansion in a `history` stage; with race fertility tuned (Tylwyth 0.6, Dvergar 0.75) humans end at 62–68% on S1–S5. Plan review 2026-10-12 ([doc](https://claude.ai/code/artifact/2b0ad371-743c-4abd-900a-11012026cb0d)) accepted in full: it adds goods per site to M2.4, inserts M2.4b (history balance, with importance scoring pulled forward), moves the legacy-app deletion to the Phase 2 close, and drafts the Phase 3 spec in parallel. M2.4 done: beasts and lairs, decade trade with goods per site, civ raids, border clashes, insults, and wars with conquest and razing. M2.4b done: climate epochs, site caps (41–102 live sites on 10 seeds), race balance by aura and ore with the sketch fertility restored, diseases as content, importance scores with yearly rollups, and the 10-seed baseline and sweep tools; ruins on every seed, civs fall on 6 of 10, and every race holds 8% or more on 4 of S1–S5. M2.5 done: rulers, heirs, founders, heroes, captains, raiders, crafters, scholars and mages as notables (333–638 alive and 1,075–2,361 ever on 10 seeds), marriages and alliance marriages, children rolled with `rollAptitude`, dynasties, succession by culture rule with disputes, sworn vengeance that adds grievance between civs, at most 3 legends alive, artifacts and books made, inherited, lost, found and stolen, decade snapshots and gzipped saves. M2.6 done: every history event type has 3–5 historian variants dated by year (48 new variants drafted by a Haiku pass and reviewed), `links` in the event content map data names to civs, sites, beasts, items and dynasties, and biographies for every notable, site, civ, beast, item and dynasty combine a summary from the records with their most important chronicle lines (`npm run bios`; the site inspector shows them). Every famine now has a cause, so no war, famine or migration lacks one on 10 seeds. M2.7 done: mock-up approved, then a Legends pane beside the map with search, eight lists, biography pages, linked names, "why?" cause chains and what each event led to, and a year slider that redraws borders, sites, ruins and lairs as of any year (borders from decade snapshots); the smoke follows a cause link back to the map and checks a SMOKE cells hash shared with a Node unit test. Next: the Phase 2 close. Builds on Phase 1: fertility, wildness, resources, aura spots, regions (passes, fords, harbours) and the route graph.

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
- Goods per site (review item 5): `Site.stores` becomes `goods: { food, ore, timber, salt, luxury }`, filled by the harvest and by deposits, features and biome in reach. Thin trade: once a decade each site swaps surplus for shortage with its route neighbours; salt, ore and luxury matter. Roads gain a `level` from trade and migration traffic that the Roads overlay shows (item 18).
- Thin war: grievance (raids, border clashes, insults between notables) plus opportunity (strength ratio, route distance, passes and fords in between) over a threshold. A battle resolves on strength plus randomness under R-24. Conquest moves a site to the winner; razing makes a ruin.
- Tests: no war without a grievance event in its causes; ruins persist; some seeds have no war in a given century.

**M2.4b History balance** (~800 lines; review items 1, 2, 3, 4, 6, 17)
- Climate epochs: one slow per-region value (own RNG stream, safe math) shifts drought and harsh-winter risk for 5–20 years at a time; `dry_years_began` and `dry_years_ended` events are the causes of the famines inside them. Content: epoch length, strength, share of the map.
- Site count and variety: expansion needs a candidate cell with at least a village's capacity after foreign-biome penalties, spacing of about 5 cells and a per-civ cooldown; mines only where the civ lacks that deposit, temples once per civ per aura spot; civ count takes a seeded jitter of ±2. Target: 40–120 live sites and 3–8 civs after 250 years.
- Race balance by mechanism: a Tylwyth site's capacity scales with mean aura in reach; a Dvergar site with no ore in reach shrinks; race fertility returns to the approved sketches (Tylwyth 0.3, Dvergar 0.5). `bad_harvest` is emitted only when stores run short; other bad years are counted in the site log.
- Importance and rollups, pulled forward from M2.6 (item 4): `importance = base(type) + fame(actors) + scale + novelty`; trivial events roll up into yearly aggregates so the event log stays readable before notables arrive.
- Diseases as content: `content/diseases.ts` with plague, fever and pox in the Phase 3 shape (`infectivity, incubation, duration, severity, ageRisk, season?`), replacing the single plague rule.
- Tools: `tests/baseline/drama-10-seeds.json` and a drama diff against it (a tool, not a gate); `npm run sweep -- --rule <name> --values a,b,c --seeds 5` prints one line per value.
- Tests: an epoch raises famine frequency inside it; no site founded within spacing; a Tylwyth site away from aura shrinks; the baseline diff reports a changed number.

**M2.5 Notables and families** (~1,200 lines)
- Notables are created by deeds (founding, leading, slaying, winning, a strong mage birth) plus each civ's ruler and heirs; cap about 3,000 alive. Others stay counts.
- Births use the existing `rollAptitude` (race, parents, birthplace aura), so bloodlines and high-aura birthplaces show. The legend cap (at most 3) is enforced.
- Marriages, children, dynasties, rivalries and sworn enemies; succession by culture rule, including disputed successions; artifacts and books made, inherited, lost and stolen.
- Decade snapshots (item 7): territory and site populations kept every decade for the M2.7 year slider; saves use `CompressionStream` (item 19).
- Tests: family links are symmetric; the dead stay dead; legend cap holds over 250 years.

**M2.6 Notability and biographies** (~600 lines)
- Historian templates for every event type, with 3–5 variants per common type drafted by a Haiku pass as content and reviewed by the orchestrator (item 8; no runtime key, R-16); biography assembly per notable, site and civ. Importance and rollups landed in M2.4b.
- Drama check: `npm run drama -- --seeds 5 --years 250` adds history time, civ and site counts, peak and final population, wars, famines, plagues, ruins, notables, legends alive, race shares and the longest cause chain.

**M2.7 Legends browser and timeline** (~1,000 lines; mock-up first, fork 4)
- A Legends view beside the map: search and lists of civs, sites, races, figures, families, beasts, artifacts and events. Every name links; every event shows "why?" through its cause chain.
- A year slider on the map shows borders, sites and ruins at any year. Opening a site, figure or event centres the map on it.
- Smoke test: generate → open legends → follow a cause link → back to the map; plus a hash of the generated cells for seed SMOKE compared with a committed value, to catch float drift between Node and Chromium (item 16).

**Close:** drama check over 5 seeds, the playtest check-in (REBOOT_PLAN §1E), race and culture sketches recorded in `CONTENT_GUIDE.md`, and one PR that deletes the legacy app (`src/sim`, `src/controller`, `src/adapters`, `src/ui`, its tests and fixtures) so `/` serves the new app (item 9; moved from M3.13). The Phase 3 spec is drafted in parallel from M2.4 on (item 7).

## Data shapes

```ts
interface Civ { id: Id; name: string; raceId: string; cultureId: string; capital: Id;
  founded: number; fell?: number; rulerId?: Id; grievances: Map<Id, number> }
interface Site { id: Id; name: string; kind: SiteKind; cell: number; civId: Id | null;
  founded: number; ruinedYear?: number; pop: PopBand[]; goods: Goods; wealth: number }
interface Goods { food: number; ore: number; timber: number; salt: number; luxury: number }  // M2.4; was stores: number
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
- **Notables (M2.5):** an overlay on the counts: creating or killing one never changes `Site.pop`; all their randomness uses the `history.notables` stream. Kin are not created at the 3,000 cap; deed notables always are. Mages among commoners come from expected strong-or-better births (`rollAptitude` with `minTier`), so no commoner is rolled one by one. Tunables in `content/notables.ts`.
- **Balance (2026-10-12):** measured by the committed 10-seed baseline diff and the drama check; CI never gates on it.

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
| M2.7 | Figma, tldraw or an Artifact for the legends browser mock-up |
| M2.4b on | The Monday test routine becomes a weekly 10-seed balance run that posts the baseline diff (review item 14), once the tool is merged |

Not used: Supabase and Stripe (no backend or payments, R-16); OpenArt (art is Phase 9+, R-17); Canva and Google Drive (nothing to publish there); Mobbin (needs a paid plan).

## Done when

- [ ] 3 seeds each reveal several interlinked stories in 10 minutes of browsing, such as a famine leading to migration and a new town, or a dynasty feud leading to war.
- [x] Every chronicle line has a template, and every war, famine and migration has at least one cause link. M2.6: `uncaused` is 0 on 10 seeds, and a unit test renders every variant of every event.
- [x] Race balance: every race survives to year 250 and holds at least 8% of population on 4 of 5 seeds, with the approved sketch fertility (humans may be the majority, R-08). Replaced the 70% human ceiling on 2026-10-12.
- [x] Some civs flourish and some fall; every seed has at least one ruin.
- [x] At most 3 legends alive at any time on every seed (at most 3 on 10 seeds, M2.5 and M2.6).
- [x] 250 years run in under 10 s on desktop without blocking the UI: generation runs in the worker, and world plus history take about 3 s per seed in Node (history 0.4–0.9 s).

## Out of scope

The live site and daily life (Phase 3); history running during play (Phase 4); magic schools in depth (Phase 5); deep trade and politics (Phases 4 and 6); world-gen sliders; final art.
