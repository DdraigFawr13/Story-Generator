# Phase 3 — Live site (Milestone A, the first playable)

**Goal:** pick any site on the generated world and watch it live, day by day. Every resident is a person who eats, sleeps, works, talks, falls in love, quarrels, sickens, grieves, ages and dies, under the seasons and weather of their cell and the threats of the world around them. The chronicle and inspector always say why.

## Status

Approved 2026-10-12 with all four recommended fork answers and no zoom-in spike. **M3.1 built** (2026-10-12): the site-view mock-up was reviewed and approved (revision 2, [artifact](https://claude.ai/artifact/5TUrhLivRW5Rrr7KXx3wuQ)); the local map spans the site cell plus half of each neighbour (48 tiles per cell) so an adjacent river or coast shows, and the no-op tick runs far above budget (millions of days per second for 150 residents in Node). **M3.2 built** (2026-10-12): four blocks a day, eight needs, mood, memories, traits, stress and four breakdown kinds, A* walking; both M3.1 loose ends fixed (people snapshots every 100 ms while playing; Back after "Open in Legends" returns to the site). Defaults chosen: until M3.3, field work brings in the site's normal-year history harvest, so a fed site neither starves nor gains much; a witness keeps one memory per kind (a second tantrum refreshes the first) and a breakdown leaves a strong "vented" memory, so a famine gives about 10 breakdowns a day for 150 people rather than a cascade. A stable site has no breakdowns: hardship comes with M3.4 weather and crops. Samples in `/mnt/project-files/worldgen/M3.2/`. Amended 2026-10-12 after the magic, dragons, dungeons and items review ([proposal](https://claude.ai/code/artifact/6ed1c2b5-be5b-4223-9bb0-d1a281a54da8)): item effects in M3.3, great beasts reaching the site in M3.8 and item awakenings in M3.9; the new systems (perilous places, expeditions, dragons as individuals) go to Phases 4 and 5. Starts when Phase 2 closes. Written after the plan review of 2026-10-12, whose answers this spec assumes: Phase 2 delivers a goods vector per site (M2.4), importance scores and yearly rollups (pulled forward into M2.4–M2.5), diseases as content, save compression, and deletes the legacy app at its close, so `/` already shows the new app. No zoom-in spike runs before M2.5; M3.1 is the first zoom-in and carries the performance check the spike would have done.

## Milestones

Vertical slices (REBOOT_PLAN §9A): every milestone leaves the site watchable and adds chronicle lines. Life before danger: M3.2–M3.6 before M3.8.

**M3.1 Embark, local map and promotion** (~1,300 lines)
- "Watch this site" in the Site inspector (any live site), or "Found an outpost" on an empty fertile cell: 8–14 settlers from the nearest site of a civ that can reach it.
- `engine/site/localmap.ts`: a 96×96 map (fork 1) from the cell and its neighbours: elevation, river or coast, soil from fertility, trees from biome, stone and ore from deposits, and a starting layout (homes, fields, well, stockpile, shrine) sized to the site's population and kind.
- Promotion (REBOOT_PLAN §7.4): notables keep their records; other residents come from a new `rollAttributes` plus the existing `rollAptitude`, matching the site's race, culture and age bands, grouped into households by the culture's marriage custom. Goods become stockpile items. Sites over ~150 people simulate one quarter of about 150; the rest stay counts.
- `WorldState.activeSite`; the site sim runs daily in the worker. Site view: Canvas 2D tile map with glyphs (fork 2), pause/1×/4×/16×, and the Phase 2 inspector and chronicle panels reused.
- Tests: LOD round trip (promote → demote keeps counts, notables and goods); same seed gives the same local map. The smoke test's world hash (review item 16) gains a local-map hash. Profile a 150-resident no-op tick against the budget here.

**M3.2 Daily life core** (~1,100 lines)
- Four day blocks (night, morning, afternoon, evening); needs per §6A (food, water, rest, warmth, safety, companionship, purpose, faith where the culture has one) in `content/needs.ts`.
- Mood from needs, memories and traits; stress builds below −30; breakdowns by trait (tantrum, despair, wandering, theft) leave memories in witnesses. `content/traits.ts`, `content/memories.ts`.
- Movement: grid A* with a per-tick budget and a path cache (fallback: straight lines).
- Tests: a person with no food breaks down before a fed one; memories decay; the A* budget is respected.

**M3.3 Work, skills and steward AI** (~1,400 lines)
- `content/jobs.ts` (farm, forage, fish, hunt, fell, quarry, mine, cook, build, craft, heal, haul) gated by attributes and skills (R-25); learning by doing and from a teacher; skill toward potential (R-27).
- `content/items.ts`: each item maps to one world good (food, ore, timber, salt, luxury), so demotion sums back into the goods vector. An entry may carry `effects` (attribute bonus, granted ability, combat value, or a power bonus) and `downsides` (envy, theft draw, curse; R-29). An item lifts its holder at most one magic tier and never past Legendary (decided 2026-10-12). A promoted notable brings their world items to the site. `content/buildings.ts`: homes, fields, stockpile, workshop, well, wall.
- Steward AI ranks food days left, shelter, threat, repairs and shortages, then assigns people by suitability, traits and mood. Profile again at the end of this milestone.
- Tests: no one works a job they can't do; stock never goes negative; a food shortage moves people to food jobs.

**M3.4 Environment and stressors** (~900 lines)
- Daily weather from the cell's climate, shifted by the region's climate epoch from Phase 2 (a dry run in history means a dry run at the site). Seasons and day length, temperature and exposure, crops by season, soil, water and labour; frost and drought damage; spoilage; fire spreading over flammable tiles; local depletion of timber, game and soil; wild animals as wildlife, not yet threats.
- Tests: frost ruins an unharvested field; preserved food outlasts fresh; fire stops at stone and water.

**M3.5 Health** (~900 lines)
- Health 0–100 plus conditions: hunger, thirst, exposure, exhaustion, wounds (minor, serious, critical, with lasting harm), the Phase 2 diseases spreading daily among household and co-workers, chronic illness, old-age frailty. Healers and herbs. Death with a cause.
- Tests: infection only passes by contact; a healer lowers childbirth and wound deaths; the dead stay dead.

**M3.6 Family and relationships** (~1,200 lines)
- 1–3 sampled evening interactions per person (chat, joke, help, argue, insult, flirt) in `content/interactions.ts`; opinion per pair, only for pairs that met; friend, rival, enemy and lover labels; grudges, revenge and forgiveness.
- Courtship, marriage by culture, childbirth risk, children growing up and coming of age, households forming and splitting; death → grief → inheritance by culture rule, widowhood, orphans and guardianship (reusing the M2.5 succession rules).
- Tests: family links are symmetric; inheritance follows the culture rule; orphans always get a guardian.

**M3.7 Society** (~700 lines)
- Status from role, wealth, fame and family; thin crime (theft, brawl, murder) from breakdowns, hunger and grudges; punishment by culture values (fine, labour, exile, execution) leaving grudges; festivals and funerals on culture dates; thin religion from the culture's tag.
- Tests: a hungry thief is punished by the culture's rule; an exile leaves and appears in the world's site list.

**M3.8 Threats** (~1,200 lines)
- Wildlife and beasts from real lairs within reach (M2.4), raiders from real civs with a grievance against this site's civ. Great and legendary beasts (the dragon included) can come too: the chronicle gives warning signs (livestock taken, smoke seen) a few days before, and the steward AI can order a flight to the nearest site. The site may fall (R-20). Site combat uses attributes, skill, equipment, numbers and fatigue, tested against the tier-equivalence table (R-24). Militia, walls, looting, wounds and deaths feed health and grief.
- Tests: no raid without a real grievance or lair in its causes; one combat round never exceeds the R-24 caps.

**M3.9 Light magic and lore** (~700 lines)
- Common cantrips (mending, warmth, small healing, weather-reading) taught by parents or a hedge-witch (R-28); gifted residents visible in the inspector; books as Phase 2 items that can be read, lent and lost.
- Awakenings (REBOOT_PLAN §5.3) as content in `content/awakenings.ts`: a book or an effect item can teach an ability or raise a person one magic tier, once, within the tier caps, as a chronicled event with a cause (decided 2026-10-12: a person with no power can rise to Faint this way; no spontaneous talent, R-26). Race dependencies act at the site: Tylwyth fare worse on low-aura land, Dvergar need ore work (the review's balance-by-mechanism, item 3).
- Tests: no one casts without a teacher or book; a lost book ends a cantrip's teaching; an awakening happens at most once per person and never crosses more than one tier.

**M3.10 Thin politics and trade** (~600 lines)
- A leader and succession by culture rule; a seasonal caravan from a real route neighbour that swaps surplus goods for shortages (goods vector); news of the caravan's home in the chronicle.
- Tests: caravans only come along existing routes; succession never leaves the site leaderless.

**M3.11 Chronicle, recaps and inspector** (~1,000 lines)
- Person inspector (§8): biography, family tree, relationships with reasons, memories, needs and mood with "why" lines ("Hungry: no meal for 2 days"), health, job and schedule, the optional numbers panel (R-14). Household and site panels. Seasonal and yearly historian recaps. Chronicle filters by domain and by the importance score from Phase 2, so trivial lines roll up instead of flooding. Every new event type ships with 3 or more template variants (review item 8). Phone: bottom sheet, as on the map.

**M3.12 Time and saves** (~700 lines)
- "Run until notable" and auto-pause by category (fork 3), using the importance score; save, load and autosave of world plus site in IndexedDB, compressed as in Phase 2.
- Smoke test: generate → legends → embark → play → save → reload → continue.

**Close:** `npm run drama -- --seeds 3 --site --years 3` adds site-tier stats (events per month by domain, longest site cause chain, deaths by cause, breakdowns, marriages, births, days per second), CONTENT_GUIDE examples for each new content type, and the Milestone A check-in (REBOOT_PLAN §1E).

## Data shapes

```ts
interface ActiveSite { siteId: Id; enteredDay: number; map: LocalMap; residents: Id[];
  households: Map<Id, Household>; buildings: Map<Id, Building>; stock: Map<string, number> /* item id → count */ }
interface LocalMap { width: number; height: number; elevation: Int16Array; terrain: Uint8Array;
  water: Uint8Array; tree: Uint8Array; mineral: Uint8Array; building: Uint16Array }
interface Household { id: Id; members: Id[]; head: Id; home: Id | null }
interface Building { id: Id; defId: string; cells: number[]; owner: Id | null; condition: number }
interface Condition { defId: string; severity: number; sinceDay: number; healDay?: number }
// PersonDetail gains: conditions, block, status; Person gains siteId (Phase 2) and causeOfDeath.
// WorldState gains activeSite: ActiveSite | null.
```

## Cross-domain links

- Region climate epoch → site weather → failed harvest → hunger → theft → punishment → grudge → feud.
- Death → grief memories → stress → breakdown; death → inheritance → dispute between heirs.
- Disease → healer's workload → untended fields → food shortage → caravan trade for food.
- Real lairs and real civ grievances from Phase 2 → raids → wounds and deaths → orphans and guardianship.
- Aura and deposits at the cell → Tylwyth and Dvergar wellbeing → who stays and who leaves.
- Goods vector ↔ stockpile items: what the site makes or loses shows in the world record on demotion.

## Defaults chosen

- **Start:** the site starts at the end of history (year 250 by default); the world tier is frozen during Phase 3 apart from threats and caravans drawn from its state (it runs monthly in Phase 4).
- **Size:** about 150 simulated residents; bigger sites simulate one quarter. Budget: 10+ days per second at max speed on desktop.
- **Observer only (R-01):** the steward AI decides; the command queue seam stays unused.
- **Content first:** needs, traits, memories, jobs, items, buildings, interactions and cantrips are content entries with one-line comments; tuning is by weights only.

## Design forks (decided 2026-10-12)

1. **Local map size:** 64×64, 96×96 or 128×128. **Decided: 96×96** (the plan's default).
2. **Glyph style:** coloured letters on tinted tiles, simple shape icons or small pixel sprites. **Decided: coloured letters** (cheapest, readable on a phone; art waits for Phase 9 under R-17).
3. **Auto-pause defaults:** pause on deaths, breakdowns, fires, raids and arrivals, or on nothing by default. **Decided: pause on those**; births, marriages and festivals go only in the chronicle.
4. **Site view mock-up:** approve a mock-up before M3.1's UI is built, as with the map viewer? **Decided: yes.**

## Tools and connectors

| Milestone | Tools |
| --- | --- |
| All | GitHub; `implementer` (Sonnet) for bulk code, `test-runner` (Haiku) for checks; Vercel to confirm the production deploy after each merge |
| M3.1 | Figma (or an Artifact) for the site view mock-up; shared files `site/M3.x/` for local-map PNGs and drama output |
| M3.2–M3.12 | Drama output and screenshots per milestone in shared files; the balance baseline diff from Phase 2 |
| Close | The weekly balance run gains the site-tier stats |

Not used: Supabase and Stripe (R-16); OpenArt (R-17); Canva, Google Drive, Mobbin.

## Done when (Milestone A)

- [ ] 3 random seeds, about 20 minutes each, each show a family or relationship story, an environmental hardship, a health crisis, an outside threat and a breakdown or grief reaction, each with cause links.
- [ ] Every person visibly sleeps, eats, works and socialises; the inspector says why for every need and mood.
- [ ] Winters matter without killing half the site; the chronicle is not flooded with trivial lines.
- [ ] 150 residents run at 10+ days per second on desktop without blocking the UI.
- [ ] Generate → legends → embark → play → save → reload → continue works, and the phone can view and read it.

## Out of scope

The world moving during play and world↔site links (Phase 4); perilous places, hoards and expeditions (M4.7); switching the watched site (Phase 4 or 6); magic schools, enchanting and dragons as individuals (Phase 5); deep politics and trade (Phases 4 and 6); steward and follow modes (Phase 8); z-levels and final art (Phase 9+).
