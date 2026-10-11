# Story Generator — Reboot Plan: breadth-first world simulator

**Status:** approved direction from the user Q&A on 2026-10-11. This document is the hand-off for implementation agents running in planning mode. It supersedes `docs/ROADMAP.md`, `docs/IMPLEMENTATION_PLAN.md` and the phase docs. Phase 0 archives those docs.

**What changes:** the project moves from one deeply verified settlement to a Dwarf-Fortress-style world. A whole world is generated with history first, then the viewer zooms into one living site. Scope expands by phases toward multiple kingdoms and, eventually, a medieval cultivation/LitRPG world in the spirit of Will Wight's *Cradle*.

---

## 1. How to use this document (for the executing agent)

1. Read sections 2–6 once. They are the fixed decisions, principles and architecture. Do not reopen them without asking the user.
2. Work one phase at a time (section 8). At the start of a phase, write a **phase spec of at most two pages** in `docs/phases/PHASE_N.md`. It should list:
   - the milestone/PR breakdown;
   - the data shapes being added;
   - the "design forks" that need the user, if any.
3. Ask the user only about genuine design forks. Each phase lists its known forks. Pick sensible defaults for everything else and note them in the phase spec.
4. Implement in PR-sized milestones of roughly 300–1,500 changed lines. When CI is green, merge at your discretion with a squash merge. The user approved "merge at milestones, ask on design forks".
5. End each phase with a **playtest check-in**: a short summary to the user, the live link and the "drama check" output (section 9). Then wait for the go-ahead on the next phase.
6. Keep docs short. Update `docs/ROADMAP.md` status and append to `CHANGELOG.md`. Do **not** write per-feature evidence documents.

---

## 2. Vision in one paragraph

Generate a world with mountains, rivers, biomes and unevenly spread resources. Simulate a few centuries of coarse history in seconds: cultures, settlements, notable figures, beasts, wars, ruins and legends. Then pick a place and watch it live, day by day. Its people have needs, moods, relationships, jobs, grudges and ambitions. Famine, disease, beasts, raiders and their own feuds threaten them. The rest of the world keeps moving and reaches them through migrants, caravans, raids and news. Over later phases the world grows to competing kingdoms. Magic matters: power is something people cultivate, and a few rise very far. The player starts as an observer. Later they can either **steward a settlement/sect** or **follow and guide one character**. The chronicle tells true stories of what the simulation did, with a historian's flair.

---

## 3. Locked decisions (from the 2026-10-11 Q&A)

| ID | Decision |
| --- | --- |
| R-01 | **Observer first.** The architecture must keep a hybrid mode open for a later phase, and both hybrid styles must be possible, chosen per run: steward a settlement/sect, or follow one character. |
| R-02 | **Keep the tech stack and rebuild the sim core.** Keep TypeScript, React, Vite, Canvas 2D, Vitest, Playwright, the Vercel main-only deploys and the useful plumbing. Write a new, data-driven simulation core. Old saves, rule versions and compatibility are dropped. The new core inherits **none** of the old gates or contracts. |
| R-03 | **Determinism is a cheap convention, not a gate.** Use seeded RNG and a fixed update order everywhere, and keep one test that checks same seed gives the same result *within the current version*. There is no cross-version replay. Changing rules simply changes histories. |
| R-04 | **World first, then zoom in, DF-style.** World-gen comes first, with coarse history, then one detailed live site. Detail spreads outward over phases. |
| R-05 | **Customization through content data files plus agent-added content.** World-gen settings sliders come later; keep a params object ready for them now. An in-game editor is not planned. |
| R-06 | **"Efficient" means three things:** faster development (less ceremony), fast runtime (centuries of history in seconds; phone usable), and drama visible at every scale. "Skip to the good stuff" tools come gradually, without forcing events. |
| R-07 | **2D with elevation now; leave z-levels/underground as a later option.** Do not lay out code so it would block layered maps later. |
| R-08 | **Several human cultures first.** Other species are content-defined and added later without engine changes. |
| R-09 | **Drama: three systems deep early, one thin.** Nature & scarcity, social & personal, and outside threats get real depth early. Politics & trade starts thin and deepens in later phases. |
| R-10 | **Medium world, bigger later.** Start at about 256×256 world cells, 3–8 civs, dozens of sites and a few thousand notable figures, with everyone else as population counts. The architecture should scale to 512×512+ through level-of-detail and Web Workers. |
| R-11 | **World-gen history plus live play.** History is fast-simulated for about 250 years by default, then the present plays live. |
| R-12 | **Magic enters early, lightly.** Monsters, megabeasts and legendary sites/artifacts come early. Build so that magic can become *central*: the long-term goal is a medieval cultivation/LitRPG world (*Cradle*-like). |
| R-13 | **Cultivation rule: everyone can advance, few go far.** Talent, resources, techniques and institutions decide who climbs. Power gaps between stages are large and reshape politics and trade. |
| R-14 | **LitRPG numbers live in an optional inspector view.** The chronicle stays narrative. |
| R-15 | **First playable is world map + legends + one live site.** |
| R-16 | **Narration is local data-driven templates with historian flair now.** Leave a seam for an optional LLM narrator later. No API key and no backend is required. |
| R-17 | **Visuals: simple coloured tiles and icons/glyphs first.** The Illustrated Minimal art pass comes in a later polish phase. |
| R-18 | **Archive the old docs** to `docs/archive/` and keep a short new doc set. |
| R-19 | **Desktop first, phone usable.** Phone must work for viewing and reading; features are not gated on phone polish. |
| R-20 | **Retained principles:** story text describes only real simulation events; no scripted plots or protected heroes, and collapse or extinction can happen; the full moral range is possible, grounded in conditions, with no quotas. |
| R-21 | **Time:** the live site ticks **daily**. The wider world ticks **monthly** during live play and **yearly or monthly** during world-gen history. Speeds run from slow to "run until notable", with auto-pause on chosen event types. |
| R-22 | **Agents merge at milestones and ask on design forks.** Each phase ends with a playtest check-in. |
| R-23 | **The old "Story Spotlight" folds into the later hybrid modes.** It becomes one tool there: widening a person's opportunities. It is not a separate system. Direct "nudges" are part of the hybrid-mode design in Phase 8. |

**Not retained as a principle:** pause-when-tab-hidden. It is an implementation choice. Default to pausing when the tab is hidden, because browsers throttle background tabs anyway, but it is not a requirement.

---

## 4. Principles and anti-goals

### Principles
- **Simulation first.** Every chronicle line renders a real event record. Templates add flair, never facts.
- **Breadth before depth.** Each phase leaves every implemented system playable and connected to the others. A system goes deeper in a later pass, not before its neighbours exist.
- **Data over code.** Biomes, resources, cultures, creatures, jobs, needs, traits, buildings, event rules, name lists, chronicle templates and power tracks live in content files. The engine stays generic.
- **Level of detail.** Detail is expensive, so spend it where the viewer is looking. Coarse simulation must stay *consistent* with detailed simulation when a place or person moves between tiers.
- **Drama emerges from interacting systems,** not from a director forcing events. Tuning happens through content frequencies and weights, measured with the drama-check tool.
- **Every seam for the future is a cheap interface now,** not an implementation. Examples are the command queue, the power slot on people, the species registry, the world-gen params and the narrator interface.

### Anti-goals (what made the old repo slow; do not repeat)
- No per-feature evidence documents, independent oracles, 100-seed proof batteries, browser case-coverage gates or cross-version save replay.
- No frozen "rule versions". Rules change freely until a later beta milestone decides otherwise.
- No exhaustive up-front numeric specifications. Pick reasonable numbers, make them content data and tune them by playing.
- No full ECS framework and no new heavy dependencies without a reason. Plain typed tables and functions are enough.
- No pathfinding, combat or politics depth beyond what the current phase needs.

---

## 5. Architecture

### 5.1 Source layout (new)

```
src/
  engine/      pure simulation (no DOM, no Date, no Math.random, no timers)
    core/      ids, rng streams, clock, scheduler, event log, command queue, save schema
    worldgen/  heightmap, climate, rivers, biomes, resources, naming
    history/   coarse world-tier systems (civs, sites, figures, wars, beasts)
    site/      detailed site-tier systems (needs, jobs, mood, social, combat, disease…)
    power/     power-track framework (stub in Phase 0, real in Phase 5)
    lod/       promote/demote between world tier and site tier
    narrative/ notability scoring, template rendering, recap assembly
  content/     data files: biomes, resources, cultures, species, creatures, jobs,
               needs, traits, buildings, items, event rules, templates, names, power tracks
  app/         React UI (world map, legends browser, site view, inspector, chronicle)
  platform/    IndexedDB saves, Web Worker host, preferences
```

- Adapt `scripts/check-boundaries.mjs` to the new layers:
  - `engine` may import only `engine` and `content`;
  - `content` may import only `engine` types;
  - `app` and `platform` may import anything below them.
- Keep the existing forbidden-globals list for `engine`.

### 5.2 Core concepts
- **IDs:** monotonically allocated integers per entity kind, stored in state.
- **RNG:** named streams derived from `hash(seed, streamName)`, for example `worldgen.height`, `history`, `site.social`, `site.combat`. A new system gets a new stream, so adding a system does not reshuffle unrelated ones. The existing `xorshift32` in `src/sim/rng.ts` can be reused. Upgrading to `sfc32` or `splitmix32` for better quality is optional, but decide in Phase 0.
- **Float determinism (cheap rule):** in `engine`, use only `+ - * /`, `Math.sqrt`, `Math.floor`/`round`/`min`/`max`/`abs`. Avoid `Math.sin`/`cos`/`exp`/`pow`/`log`, because those may differ between browsers. Use lookup tables or polynomial approximations instead. Iterate in ID order, never in object-key or `Set` order of unknown origin.
- **Clock:** the base unit is the **day**. There are 4 seasons. Pick a year length in Phase 0 that is easy to read, for example 12 months × 28 days = 336 days. Each system declares a cadence such as daily, every 7 days, monthly or yearly. The scheduler runs due systems in a fixed declared order.
- **State:** one serializable `WorldState`. It holds world cells, civs, sites, figures/people, creatures, items (later), the event log, RNG states, ID allocators, clock and the pending command queue. Use plain objects and `Map`s keyed by ID, and avoid deep immutability copying on the hot path. Snapshots for saves are structured clones.
- **Systems:** `(state, ctx) => void` functions that mutate state and emit events through `ctx.emit(...)`. A system reads content through `ctx.content`.
- **Events:** `{ id, day, type, importance, actors[], place, causes[], data }`.
  - `causes` holds IDs of earlier events. This is cheap and enables "why did this happen?".
  - `importance` comes from content (base) plus modifiers such as actor fame and death count.
  - **Retention:** keep notable events forever. Roll trivial events up into yearly aggregates after N years so saves stay small.
- **Command queue (hybrid seam):** `state.commands` is processed at the start of each tick by a `commands` system and recorded in the event log. Observer mode never enqueues anything. Autonomous decision makers, such as the settlement steward AI and personal AI, sit behind an interface that a player controller can later replace per category (R-01, R-23).
- **Narrator interface:** `renderEvent(event, style) → string` and `renderRecap(events, period) → string`. The default is local templates. An LLM implementation can be dropped in later (R-16).

### 5.3 Two tiers of detail (LOD)

| | World tier | Site tier |
| --- | --- | --- |
| Where | Every civ and site, the whole map | The one site being watched (more later) |
| Cadence | Yearly during world-gen; monthly during live play | Daily |
| People | Population counts by culture/age band; **notable figures** as full records | Every resident is a full individual |
| Space | World cells (about 256×256) | Local site map (about 96×96 tiles) generated from its world cell |
| Combat | Strength comparisons with randomness | Individual exchanges with skills, wounds and power |

- **Promotion (world → site):** existing notables keep their records and gain detail. The other residents are generated consistently with the site's culture, age bands and wealth. Generated relationships match known family links.
- **Demotion (site → world):** people fold back into counts. People who became notable at the site stay as figures. Buildings and wealth become site aggregates. Events stay in the log.
- **A person record has optional detail blocks:** `needs`, `mood`, `skills`, `relationships` and `memories` exist only at site tier. `identity`, `family`, `deeds`, `fame` and `power` exist at both tiers.

### 5.4 Content ("raws")
- Content is typed TypeScript data modules in `src/content/*`, each exporting arrays of definitions with string IDs. This gives type checking and is easy for agents and humans to edit.
- A `validateContent()` step runs at startup and in tests: unique IDs, references resolve, numbers in range.
- Leave JSON loading of the same shapes as a later option for mods and sliders (R-05).
- **Event rules** are content entries with:
  - `id`, `tier`, `cadence`;
  - `when(ctx)`, a TS predicate;
  - `weight(ctx)`;
  - `apply(ctx)`, which mutates state through helpers and emits events;
  - `templates`.
  
  This makes adding events a data task, not an engine change.
- Write `docs/CONTENT_GUIDE.md` in Phase 0 with one worked example per content type.

### 5.5 Built for magic and cultivation from day one (R-12, R-13)
- Every person, figure and creature has a `power` block from Phase 0: `{ trackId, stage, progress }`. It defaults to the "mundane" track at stage 0.
- Combat and threat math always takes **effective might** = base skill/physique × `stageMultiplier(stage)` from the track definition. The mundane track has a multiplier of 1. Later tracks have steep multipliers, so a gap of one stage dominates. Combat built in Phase 3 is therefore already power-aware.
- World cells get an `aura` layer (ambient magical density) in world-gen. It is used by legendary sites in Phase 2 and by cultivation in Phase 5+.
- Creatures can carry a power stage, which makes magic beasts possible. Their remains can be resources (cores, hides) defined in content.

### 5.6 Runtime performance plan
- World-gen and history run in a **Web Worker** with a progress bar. The live simulation also runs in a worker from Phase 3. The UI receives state diffs or snapshots at most about 10 times per second.
- **Budgets** (desktop, mid-range laptop; phone may be 3–4× slower):
  - 256×256 world-gen in under 2 s;
  - 250 years of history in under 10 s;
  - live site with about 150 residents at least 10 simulated days per second at max speed.
- Movement on the site map uses grid A* with a per-tick budget and path caching. If profiling shows it is too slow, fall back to "walk straight, teleport the remainder".
- Render with Canvas 2D tile layers, culled to the viewport. Cache static layers in offscreen canvases.

### 5.7 Reuse map (current repo → new layout)

| Keep / adapt | Notes |
| --- | --- |
| Tooling: `package.json` scripts, Vite, TS config, Prettier, Vitest, Playwright config, `vercel.json`, `.nvmrc` | As is. |
| `src/sim/rng.ts`, `src/sim/seed.ts` | Move to `engine/core`; add named-stream derivation. |
| `scripts/check-boundaries.mjs` (+ test) | Update the layer table. |
| `src/adapters/local-save.ts`, `save-envelope.ts`, `crypto.ts`, `src/controller/save-queue.ts` | Adapt to `platform/`; drop history-limit admission and per-version codecs. Keep the atomic-write and checksum ideas. |
| `src/controller/map-camera.ts`, `src/ui/MapCanvas.tsx` | Basis for both world-map and site-map canvases. |
| `src/ui/Chronicle.tsx`, `RecapReader.tsx`, `Bookmarks.tsx`, `controller/recaps.ts`, `chronicle-filters.ts` | Reuse UI patterns and the historian-prose template style. Rewrite the data bindings. |
| `.github/workflows/ci.yml`, `cleanup-merged-branches.yml` | Slim the CI (Phase 0). Keep branch cleanup. |

**Archive (Phase 0) and delete at Milestone A (end of Phase 3):** everything else in `src/sim`, `src/controller`, `src/adapters` and `src/ui`, plus the old tests, fixtures, study scripts, probes and seed-battery tooling.

**While the old app stays live:** Vercel deploys `main`, so the old app stays the default page until Milestone A. The new app is reachable at `?next`, through a branch in `main.tsx`.

---

## 6. UI overview (desktop-first, phone usable)

1. **New World screen:** seed input or random seed, world size (small/medium; large later), Generate. The params object is ready for future sliders.
2. **World map:** pan/zoom. Layer toggles for elevation, biome, temperature, rainfall, resources, aura, civ borders and sites. Click a cell or site for an inspector. Timeline slider for borders and site ownership by year, from Phase 2.
3. **Legends browser:** searchable lists of civs, sites, figures, beasts, artifacts and events. Every name is a link, events show their causes, and per-entity timelines are available.
4. **Site view:** local tile map with people and creatures as glyphs/icons, a right-hand inspector and a bottom or side chronicle. Speed controls are pause, 1×, 4×, 16× and "run until notable", with auto-pause preferences by event category.
5. **Person inspector:** biography timeline, family, relationships, memories, needs and mood, skills, and an optional **power/stats panel** (R-14).
6. **Recaps:** seasonal and yearly historian-style summaries built from notable events, reusing the existing recap style.

On phone the map sits on top and the chronicle/inspector is a bottom sheet, matching the earlier approved arrangement.

---

## 7. Testing and quality (lightweight)

- **Unit tests** for non-trivial logic, using tiny hand-built fixtures: river flow, biome table, combat math, need decay, succession rule, LOD promote/demote round-trip.
- **One determinism test:** generate, run N days twice from the same seed and compare state hashes. Also check save → load → continue against an uninterrupted run.
- **Invariant checker:** no negative stocks, all references resolve, every dead person stays dead, population counts match records. It runs in tests and in dev builds every N ticks, never in production hot paths.
- **Seed smoke test in CI:** 5 seeds × world-gen + history + 1 live year, with no exceptions and invariants holding. It should finish in under 60 s.
- **One Playwright smoke test:** generate world → open legends → embark → play → save → reload → continue. Run it on Chromium only. Add WebKit later if cheap.
- **CI** runs format, typecheck, boundaries, unit tests, seed smoke, build and the Playwright smoke. Target under 5 minutes total. Remove the seed-battery matrix, the browser partitions and the Python probes.
- **Drama-check tool, which is not a gate:** `npm run drama -- --seeds 5 --years 3`. It prints counts of notable event types per seed per tier and the top 10 "stories" (connected event chains). It is used for tuning and for phase check-ins.

---

## 8. Phases

Each phase lists its **goal**, **scope** (in and out), **milestones** (PR-sized), **done-when** (playable criteria) and **known design forks** to ask the user about. Size estimates are rough and assume one agent.

### Phase 0 — Reset and skeleton (2–3 PRs)
**Goal:** a clean base for the new direction, with the old game still live.
- **M0.1 Docs reset:**
  - `git mv` the current `docs/*.md`, `docs/adr`, `docs/probes` and `docs/evidence` into `docs/archive/`.
  - Create `docs/VISION.md` (section 2 plus principles), `docs/ARCHITECTURE.md` (section 5), `docs/ROADMAP.md` (the phase table below with status), `docs/DECISIONS.md` (the R-table, plus a short process for new decisions), `docs/CONTENT_GUIDE.md` (stub) and `CHANGELOG.md`.
  - Keep this plan as `docs/REBOOT_PLAN.md`.
  - Rewrite `README.md` and `CONTRIBUTING.md` briefly to match.
- **M0.2 CI and boundaries:**
  - Slim the CI as in section 7.
  - Keep the legacy fast unit tests running until deletion, and drop the batteries and browser partitions.
  - Add the new layers to the boundary checker.
- **M0.3 Engine skeleton:**
  - `engine/core`: IDs, RNG streams, clock, scheduler, event log, command queue (empty), state type, save/load JSON, content registry plus validation, and the `power` block on the person type.
  - A trivial demo system, for example a "weather" system emitting seasonal events, to exercise the loop.
  - The determinism test and the `?next` entry showing the New World screen.
- **Done when:** the old app works as before at `/`, `/?next` loads the new shell, CI passes in under 5 minutes, and the docs total roughly 10 pages or less.
- **Forks:** none expected. Decide the year length and the RNG algorithm yourself and note them.

### Phase 1 — World generation and world map (3–5 PRs)
**Goal:** varied, believable worlds with interesting topography and uneven resources.
- **M1.1 Terrain:**
  - Deterministic fractal value/simplex noise using only "safe" math.
  - Continents from a few seeded plate centres plus noise; sea level; mountain ridges along plate boundaries (cheap approximation).
  - Erosion is optional and only if cheap.
- **M1.2 Climate and water:**
  - Temperature from latitude, elevation and noise; rainfall from a prevailing-wind sweep with a rain shadow behind mountains.
  - Rivers from downhill flow accumulation over the heightmap, and lakes in basins (fill depressions).
- **M1.3 Biomes and resources:**
  - A biome table (content) from temperature × rainfall × elevation.
  - Resource deposits: metals and stone by geology/elevation, fertile soil by biome and river, timber, game, fish, gems, salt and clay.
  - Each resource has clustering rules in content, which deliberately creates scarcity and competition.
  - An `aura` layer, plus a handful of **legendary site** candidates such as springs, ancient ruins or strange groves (content). They are placeholders until Phase 2.
- **M1.4 World map UI:** canvas renderer, layer toggles, hover/click inspector, legend and minimap. Generation runs in a worker with progress.
- **M1.5 Region naming:** named mountain ranges, rivers, forests and seas from neutral name lists. These are re-flavoured per culture in Phase 2.
- **Done when:**
  - 5 random seeds give visibly different worlds;
  - rivers always reach the sea or a lake;
  - resources cluster so that some regions are rich and others poor;
  - generation meets the budget.
- **Forks:** whether default worlds should be one continent, several, or a choice. The default is "a few landmasses" plus a params field.

### Phase 2 — Peoples and coarse history: "Legends" (5–7 PRs)
**Goal:** a world that already has a past full of connected stories before live play begins.
- **M2.1 Peoples content:**
  - 3–4 human cultures. Each has values/ethics weights (honour, piety, greed, martial, mercy…), preferred biomes, naming lists, government default, building style tag and attitudes to magic.
  - A species registry containing only humans.
  - Creatures: ordinary wildlife per biome, plus a few **megabeast/monster types** with lairs and power stages (light magic, R-12).
- **M2.2 Civ placement and site founding:**
  - Civs start at good cells near their preferred biomes.
  - Sites (hamlet → town → city; also fortress, mine, temple) have population, culture, owner civ, resources in reach and wealth.
- **M2.3 History loop (yearly):**
  - growth to carrying capacity from biome and resources;
  - expansion and new sites;
  - famine and plague years;
  - beasts raiding and being slain;
  - **thin** trade links between sites of the same civ or neighbouring civs;
  - **thin** wars from grievance plus opportunity, resolved by strength comparison, ending in conquest, razing or ruins;
  - legendary sites claimed and fought over.
- **M2.4 Notable figures:**
  - Leaders, heroes, founders, beast-slayers, famous crafters and villains, with birth, family, deeds, death and killer links.
  - Relationships between notables: kin, spouse, rival, sworn enemy.
  - Succession by the culture's rule.
  - Artifacts can be created by famous crafters and passed on, lost or stolen.
- **M2.5 Notability and templates:** importance scoring, historian-style templates per event type, and per-entity biography assembly.
- **M2.6 Legends browser and timeline:** lists, links, cause chains, and a world-map border/ownership timeline slider.
- **Done when:**
  - on 3 seeds, browsing for 10 minutes turns up at least a few interlinked stories, such as a beast razing a town and a later hero slaying it, or a succession dispute leading to war or a split;
  - 250 years meets the budget;
  - the drama check shows varied event types.
- **Forks:** how many cultures, and their flavour. Propose 3–4 short culture sketches to the user before writing them.

### Phase 3 — Live site: Milestone A, the first playable (8–12 PRs)
**Goal:** pick a place in the generated world and watch it live, daily, with deep scarcity, social life and threats, plus thin politics and trade.
- **M3.1 Embark and site generation:**
  - Choose an existing site, or found a new outpost of a chosen civ on a chosen cell.
  - Generate the about 96×96 local map from the world cell: elevation, river, trees, stone, ore patches, soil fertility, and existing buildings laid out procedurally for existing sites.
  - Promote residents through LOD (section 5.3).
- **M3.2 People core:**
  - Personality traits (content).
  - Needs: food, drink, rest, shelter/warmth, safety, social, purpose.
  - Mood comes from needs, recent memories and traits. Stress thresholds lead to breakdowns: tantrum, despair, wandering off, leaving the settlement.
  - Skills improve with use.
- **M3.3 Work and steward AI:**
  - Jobs (content): farm, forage, hunt, fish, woodcut, mine (abstract deposits), build, craft basic goods, cook, heal, guard.
  - An autonomous **steward AI**, run by the settlement leader's priorities, chooses what to build and staff. This is the component the hybrid steward mode replaces later.
  - Buildings (content) and stockpiles.
  - Movement uses A* with a budget.
- **M3.4 Scarcity (deep):**
  - seasons and crops tied to world climate, droughts and harsh winters;
  - spoilage and storage;
  - fire spreading in buildings;
  - contagious disease (simple per-person infection model), wounds and healing, deaths;
  - resource exhaustion on the local map.
- **M3.5 Social (deep):**
  - Opinion scores built from interactions: working together, talking, insults, fights, gifts.
  - Friendships, rivalries, romance, marriage and children.
  - Memories with decay, such as "saw kin die" or "was saved by X".
  - Grudges and revenge.
  - Thin crime (theft when hungry, brawls) with punishment set by culture values.
- **M3.6 Threats (deep):**
  - wildlife from the biome;
  - beasts and monsters from world history (a nearby lair can attack, and a megabeast already present in legends can arrive);
  - raiders sent by a hostile civ that actually exists in the world;
  - power-aware combat exchanges with injuries, fleeing and death;
  - a militia formed by the steward AI, walls and defensive buildings, and looting.
- **M3.7 Politics and trade (thin):**
  - A leader chosen by the culture rule makes the steward AI's priority calls. Succession happens on death.
  - A periodic caravan from the civ's other sites trades surplus for needs.
- **M3.8 Chronicle, recaps and inspector:**
  - Site chronicle with filters by person, type and importance.
  - Seasonal/yearly recaps.
  - Person inspector (section 6), including the optional power panel. Mostly mundane values are shown for now.
  - "Why?" cause links.
- **M3.9 Time and saves:**
  - Speeds plus "run until notable" with auto-pause preferences.
  - IndexedDB save/load of the whole world plus site, autosave, and a single save slot per world (multiple slots are optional).
- **M3.10 Switch over:** `?next` becomes the default page, and the legacy app, tests and archived code paths are deleted.
- **Done when (Milestone A check-in):**
  - on 3 random seeds, about 20 minutes of mixed-speed watching each shows at least one scarcity crisis or near-crisis, one relationship story (marriage, feud or revenge), one outside threat, and one mood breakdown or notable personal event;
  - the chronicle can explain each through cause links;
  - performance meets the budget;
  - the phone can view and read.
- **Forks:**
  - local map size;
  - whether people should be shown as simple glyphs or small coloured figures;
  - the default auto-pause categories.

### Phase 4 — The world keeps moving (4–6 PRs)
**Goal:** the live site is part of a living world, and politics/trade grows from thin to medium.
- **M4.1:** The world tier runs **monthly** during live play, with the same history systems at a finer cadence.
- **M4.2 World → site connections, each from a real world source:**
  - refugees and migrants from razed or starving sites;
  - caravans carrying real goods from real places;
  - raids from civs with real grievances;
  - visiting notables, mercenaries and monster hunters;
  - "news from afar" chronicle entries about wars, deaths of kings and beasts slain.
- **M4.3 Site → world:** the site's population, wealth, deeds and new notables update its world record, and its events appear in legends.
- **M4.4 Politics and trade (medium):**
  - allegiance to the civ, tribute and taxes;
  - conscription when the civ goes to war;
  - civ leaders making decisions that affect the site;
  - trade routes with simple price differences driven by scarcity.
- **M4.5 Story threads:** a derived (not scripted) view of unresolved situations, such as a feud still alive, a beast still roaming or a claimant in exile. Recaps can mention them.
- **Done when:** in at least some seeds, an event elsewhere in the world (war, plague, beast) clearly changes life at the site, and the chronicle shows the link.
- **Forks:** whether the viewer should be able to switch to watching another site mid-run in this phase or wait for Phase 6. The default is to wait.

### Phase 5 — Magic foundations: the power framework (4–6 PRs)
**Goal:** make power cultivable and consequential while keeping it rare at high stages.
- **M5.1 Power tracks (content):**
  - A track has named stages, thresholds, might multipliers, requirements and lifespan effects.
  - Start with one or two medieval-flavoured paths. For example, a martial path that tempers the body, and an arcane path that draws ambient aura.
  - Names are original, not copied from *Cradle*.
- **M5.2 Advancement:**
  - Training time is drawn from people's schedules.
  - Talent is a trait.
  - Resources: rare herbs, beast cores and aura-rich places from the world `aura` layer.
  - Techniques are content items learned from teachers or manuals.
  - Breakthrough attempts can fail and cause injury.
  - Result: everyone can reach early stages, and few go far (R-13).
- **M5.3 Magic beasts and resources:** creature stages, harvestable remains as valuable trade goods, and beast tides near high-aura regions.
- **M5.4 Legendary sites get mechanics:** they boost advancement or carry curses, and attract settlers, pilgrims and conflict.
- **M5.5 World tier:** notables advance in coarse history, so legends include famous cultivators. Powerful figures affect war strength and succession.
- **M5.6 UI:** power panel content, advancement chronicle events, and an optional "system notice" style for the inspector only (R-14).
- **Done when:**
  - in some seeds a single powerful individual decides a threat or a political outcome;
  - high stages are rare across seeds (check with the drama tool);
  - mundane life still matters.
- **Forks:**
  - the names and flavour of the first power paths (propose them to the user);
  - the default rarity tuning.

### Phase 6 — Kingdoms and multiple detailed sites (6–8 PRs)
**Goal:** a multi-kingdom world whose politics are now deep.
- **M6.1 Governments (content):** chiefdom, monarchy, council and sect-rule (ready for Phase 7). Includes nobles and titles, legitimacy, factions and succession disputes.
- **M6.2 Diplomacy:** alliances, vassalage, marriages between ruling houses, treaties and betrayals.
- **M6.3 War:**
  - Armies raised from sites and marching on the world map.
  - Battles are resolved at world tier, and in detail if they reach the watched site.
  - Sieges, occupations and rebellions.
- **M6.4 Trade (deep):** goods flowing along routes, roads appearing between connected sites, and wealth inequality between sites and families.
- **M6.5 Watching multiple sites:** switch the watched site mid-run, using demote/promote with consistency checks. Optionally keep 2–3 sites detailed at once if performance allows.
- **M6.6 Bigger worlds:** a 512×512 option with chunked rendering and the world tier spread across workers.
- **Done when:** over a long live run, borders visibly shift, kingdoms rise, split or fall, and the watched site's fate is tied to them.
- **Forks:** whether the default view should become a "kingdom-level chronicle" in addition to the site chronicle.

### Phase 7 — Cultivation and LitRPG depth (6–10 PRs)
**Goal:** the medieval cultivation world becomes a central pillar.
- **Institutions:**
  - Sects, schools and orders, as content.
  - Recruitment exams, ranks within the sect, techniques kept secret or shared.
  - Elders, hidden masters, inheritance and lost techniques.
- **Competition:** tournaments, contests over resource sites, rivalries between sects, and power-driven politics such as cultivator rulers, sects acting as states and mortal kingdoms bowing to them.
- **More content:** more paths, rare advancement resources, trials and tribulations (medieval-flavoured), and dangerous high-aura regions.
- **Tuning:** a balance pass across seeds so power is aspirational, not universal.
- **Forks:** several. Propose a short design brief to the user first.

### Phase 8 — Hybrid play modes (5–8 PRs)
**Goal:** the player can participate, per run (R-01). The order of Phases 7 and 8 can be swapped at the Phase 6 check-in.
- **Command layer:** implement commands through the existing queue, recorded and replayable.
- **Steward mode:** the player overrides steward-AI categories, for example build orders, zones, job priorities, laws and defence. The AI handles whatever the player leaves alone. People can still refuse or fail.
- **Follow-a-character mode:**
  - The player picks a protagonist.
  - At decision points the player picks from the options that person's AI would consider. This is where the old Story Spotlight idea lives: occasionally *widen* the option set from context, with outcomes still simulated.
  - The player makes advancement and technique choices.
- Observer remains the default.
- **Forks:** the frequency of decision points; whether the player character gets any protection (default: none, per R-20).

### Phase 9+ — Expansion and polish (ongoing, pick per check-in)
- Illustrated Minimal art pass and animations.
- A world-gen sliders UI.
- More species (content), and more cultures, biomes, creatures and items.
- **Z-levels/underground:** a decision gate. Prototype caves as a second layer first.
- An optional LLM narrator (needs a backend/API key decision).
- Multiple save slots and export of legends as text/HTML.
- Accessibility, performance and phone polish.
- Possibly lock a "beta" with save compatibility from that point on.

### Phase summary table (copy into `docs/ROADMAP.md`)

| Phase | Name | Size | Key output |
| --- | --- | --- | --- |
| 0 | Reset and skeleton | 2–3 PRs | New docs, slim CI, engine core, `?next` shell |
| 1 | World generation | 3–5 PRs | Topography, climate, rivers, biomes, resources, world map |
| 2 | Legends | 5–7 PRs | Cultures, civs, sites, figures, beasts, 250 years of history, legends browser |
| 3 | Live site (**Milestone A**) | 8–12 PRs | Daily site sim: needs, mood, work, scarcity, social, threats; chronicle; saves; legacy removed |
| 4 | Living world | 4–6 PRs | Monthly world tier during play; world↔site connections; medium politics/trade |
| 5 | Magic foundations | 4–6 PRs | Power tracks, advancement, magic beasts, legendary-site mechanics |
| 6 | Kingdoms | 6–8 PRs | Governments, diplomacy, armies, deep trade, switching watched sites, bigger worlds |
| 7 | Cultivation depth | 6–10 PRs | Sects, techniques, tournaments, power politics |
| 8 | Hybrid modes | 5–8 PRs | Steward mode and follow-a-character mode |
| 9+ | Expansion and polish | ongoing | Art, sliders, species, z-levels, LLM narrator, slots |

---

## 9. Drama at every scale (how to ensure it without forcing it)

- **Every system must produce outcomes the viewer can notice.** Add a new system only when its events have templates and an importance score. If it produces nothing visible, it is not done.
- **Notability:** `importance = base(type) + fame(actors) + scale(deaths, wealth, territory) + novelty`. Novelty is a bonus for an event type not seen recently at this place. Notability feeds:
  - "run until notable";
  - auto-pause;
  - recaps;
  - the legends front page ("Notable stories").
- **Drama check per phase:** for N seeds, report:
  - notable events per in-game year at each tier;
  - the distribution across the four drama sources;
  - the longest cause chains.
  
  The target is that something notable happens about every 1–3 in-game months at the site and every few years per civ, varying by seed.
- **Tune with content weights,** never with scripts that guarantee outcomes (R-20).

---

## 10. Feasibility risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Scope creep per system | A "thin" version is at most one PR. Deepening needs a phase listing. Breadth first. |
| Cross-browser float drift breaks determinism | Safe-math rule (section 5.2); the determinism test runs in Node and in the Playwright browser. |
| History generation too slow | Yearly cadence, aggregate populations, notables capped (for example 3,000 living), worker plus progress bar, profile in Phase 2. |
| Site simulation too slow (pathfinding, social pairs) | A* budget and cache; social interactions sampled per day rather than all pairs; profile at M3.3. |
| Save size grows without limit | Roll trivial events up into aggregates; keep notable events forever; compress saves (built-in `CompressionStream`). |
| LOD inconsistency (people appear or vanish) | Promote/demote round-trip unit test; notables never fold away; the invariant checker counts people. |
| Too little drama, or monotonous drama | Drama-check tool, novelty bonus, content weight tuning at every phase check-in. |
| Old app breaks during the transition | `?next` flag until Milestone A; legacy deleted only in M3.10. |
| Agents re-introducing heavy process | Anti-goals (section 4) and the doc budget; the reviewer rejects evidence docs and proof batteries. |

---

## 11. Deferred decisions (ask when the phase arrives)

- Culture sketches (Phase 2), power path names and flavour (Phase 5), and the cultivation design brief (Phase 7).
- Local map size and glyph style (Phase 3).
- Switching watched sites mid-run (Phase 4 or 6).
- Order of Phase 7 and Phase 8 (Phase 6 check-in).
- Z-levels, the LLM narrator and its backend, additional species, slider exposure, and a beta save-compatibility lock (Phase 9+).
