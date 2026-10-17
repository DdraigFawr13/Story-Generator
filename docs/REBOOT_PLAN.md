# Story Generator — Reboot Plan: a breadth-first world simulator


**Status:** approved direction from the user Q&A rounds on 2026-10-11. This is the hand-off for implementation agents working **in plan mode**. It supersedes `docs/ROADMAP.md`, `docs/IMPLEMENTATION_PLAN.md` and the phase docs. Phase 0 archives those docs.

**What changes:** the project moves from one deeply verified settlement to a Dwarf-Fortress-style world. A whole world is generated with a history first, then the viewer zooms into one living site. Scope expands phase by phase to multiple kingdoms. It stays a **grounded medieval fantasy**:
- ordinary life is the backbone;
- magic is rare and gated by innate attributes;
- even the rarest living legend is at most a match for one low-end field army (about 1,000 soldiers), and everyone else is far weaker.

---

## 1. How to use this document (for the executing agent)

1. Read sections 2–7 once. They are the fixed decisions, principles, life model and architecture. Do not reopen them without asking the user.
2. Work one phase at a time (section 9), **in plan mode**:
   - explore the code;
   - write a **phase spec of at most two pages** in `docs/phases/PHASE_N.md`, covering the milestone/PR breakdown, the data shapes added, and the design forks that need the user;
   - get the user's approval through the plan-approval step;
   - only then implement.
3. Ask the user only about genuine design forks. Each phase lists the known ones. Choose sensible defaults for everything else and record them in the phase spec.
4. Implement in PR-sized milestones of roughly 300–1,500 changed lines. When CI is green, squash-merge at your discretion. The user approved "merge at milestones, ask on design forks".
5. End each phase with a **playtest check-in**: a short summary to the user, the live link and the drama-check output (section 10). Then wait for the go-ahead.
6. Keep docs short. Update `docs/ROADMAP.md` status and append to `CHANGELOG.md`. **No** per-feature evidence documents.

### 1A. Intent primer: read this before anything else

These are the user's own words and what they mean for your work.

| The user said | What it means for you |
| --- | --- |
| "I fear it is getting too far down the rabbit hole of detail… it needs to have more breadth, similar to Dwarf Fortress." | The old repo spent its effort on proofs, documents and edge cases for one tiny settlement. Your job is the opposite. Get **many connected systems working simply**, then deepen them. When unsure, choose the simpler version that connects to more systems. |
| "I really do like the depth." | Breadth does not mean shallow forever. Every system must be built so it can deepen later (data-driven, with clear seams), and later phases do deepen them. |
| "Start with something like a Dwarf Fortress simulator that I can further customize and add events." | Content (events, creatures, races, jobs, spells) must be **data entries** that the user, or an agent asked by the user, can add without touching engine code. |
| "Expand… up to a multi-kingdom level with interesting topography and resource distribution to make a compelling story possible." | Geography and resources are **story engines**. Uneven resources create trade, envy, migration and war. Harsh climates create hardship. Do not generate bland, uniform worlds. |
| "Make sure there is drama to see on any level." | Something worth noticing should happen to people, households, sites and kingdoms, at every scale and at a pace a viewer enjoys. Do **not** force it with scripts. Make systems interact so drama arises. |
| "I don't want to force too much." | No guaranteed plots, no event quotas, no "director" that injects crises. Tuning happens only through content weights. |
| "Basic relationships, environmental stresses and factors and all the normal life stuff." | **Everyday life is the foundation** (section 6). If people do not visibly eat, sleep, love, quarrel, sicken, grieve, age and die in believable ways, the game has failed, however good the kingdoms are. |
| "Nobody will ever be so powerful that an army couldn't kill them." | Grounded scale (R-24). The user later set the absolute peak: **the most powerful individuals, 0–3 alive in a world at once (usually none to two), can at most match one low-end field army of about 1,000 soldiers.** Everyone below that peak stays grounded on a steep curve. Magic and skill make people *valuable*. Only legends approach *army-level*, and nobody exceeds it. |
| "Magical and physical attributes determine if they will be good at certain things or able to learn certain skills or abilities or spells… the majority should either not have any or have very weak ones." | Section 5. Aptitude is innate and uneven. Most people are mundane. Talent matters because it is rare. |
| "Never like all of one race are crazy powerful… it must come with downsides that keep their race in balance." | Every advantage a race has costs something (R-29). |
| "Efficient." | Fast to develop (small PRs, little ceremony), fast to run (worker threads, budgets), and fast to get to interesting moments ("run until notable"). |

**Explicitly rejected ideas. Never build these:**
- cultivation or LitRPG advancement stages;
- power levels that multiply strength exponentially;
- "system" notifications;
- anyone stronger than one low-end field army, or more than 3 such legends alive at once;
- a drama director that schedules catastrophes;
- protected main characters;
- per-feature evidence documents and proof batteries;
- frozen rule versions for old saves.

### 1B. Decision heuristics when the plan is silent
1. Prefer the version that **connects more systems** over the version that perfects one.
2. Prefer **data** (a content entry) over **code** (a special case in the engine).
3. Prefer **visible** consequences: a chronicle line or an inspector field. An invisible state change counts for little.
4. Prefer **plausible medieval life** over clever abstraction. Ask: "would a peasant in this world experience this?"
5. Prefer **simple numbers you can tune** over elaborate formulas. Put them in content or config with a comment.
6. If two options are equal, pick the cheaper one and note the alternative in the phase spec.
7. If an option would change what the user sees or experiences in a major way, it is a **design fork**: ask.
8. **Fame comes from deeds, not from power** (added 2026-10-13). Rising to a tier is a start, not a biography. A figure with power should be the first pick when the engine needs someone to lead a hunt, a battle, a founding or a raid, and the event names them. A legend whose deeds are birth, marriage and death is a bug in the plan.

### 1C. Glossary
- **World tier / site tier:** the coarse whole-world simulation versus the detailed simulation of the watched place (section 7.4).
- **Notable (figure):** a person tracked individually at world tier, such as a leader, hero, mage or founder.
- **Site:** any settlement or place on the world map (hamlet, town, fortress, mine, temple, ruin, lair).
- **Content / raws:** typed data definitions in `src/content/`.
- **Thin:** the simplest version of a system that is connected to others, visible in the chronicle and the inspector, and fits in one PR. **Deep:** multiple interacting mechanics, edge cases, varied outcomes. Example:
  - thin trade means a caravan arrives each season and swaps surplus for shortage;
  - deep trade means goods flow along routes, prices respond to scarcity, merchants get rich and roads appear.
- **Drama check:** the headless stats tool from section 10.
- **Steward AI:** the autonomous decision-maker for a settlement's building, jobs and defence. A player can later override it in steward mode.
- **Cause link:** an event's `causes[]` pointing to earlier events, which the UI shows as "why?".

### 1D. Phase spec template (`docs/phases/PHASE_N.md`, at most two pages)

```
# Phase N — <name>
Goal (1–2 sentences, user-facing).
Milestones: M N.1 … each with: scope bullets, files/modules, content added, tests, est. size.
Data shapes added/changed (short TS sketches).
Cross-domain links this phase creates (at least 3).
Defaults chosen (with one-line rationale each).
Design forks for the user (question + 2–4 options + recommendation).
Done-when checklist (copied from REBOOT_PLAN and made concrete).
Out of scope (explicit).
```

### 1E. Check-in template (end of each phase, message to the user)

```
Phase N complete — <live link>
What you can now see/do (3–6 bullets, plain language).
Try this: <seed> → <steps> to see <notable story>.
Drama check: <short table: events/yr by domain, top 3 stories with one-line summaries>.
Known rough edges (honest, short).
Next phase proposal + any design forks.
```

### 1F. Scaffolding already in place (start here)

A thin, working through line already exists. It runs content → engine loop → events → narrator → UI. Extend these files; don't replace them.

| File | What it gives you | Next phase that grows it |
| --- | --- | --- |
| `src/engine/core/types.ts` | `WorldState`, `Person` (attributes, potential, magic, family, site-only `detail`), `SimEvent` with `causes`, `Command` | Every phase adds fields (Phase 1 `cells`, Phase 2 `civs`/`sites`, Phase 3 `activeSite`) |
| `src/engine/core/rng.ts` | Named deterministic streams, `streamFor(world, 'name')`, plus `int`/`between`/`chance`/`pick`/`weighted` | Use one new stream name per system |
| `src/engine/core/clock.ts` | Day-based calendar (28-day months, 336-day year, seasons), `isDue(cadence, day)` | Cultures may rename months |
| `src/engine/core/scheduler.ts` | `step`/`advance`, fixed-order `System`s, command queue with handler registry (hybrid seam), `rulesSystem` running content event rules | Phase 3 inserts life systems; Phase 8 registers command handlers |
| `src/engine/core/context.ts` | `SimContext`: `emit` (refuses event types without content templates), `rng`, `nextId`, `lastEvent` | Add helpers as systems need them |
| `src/engine/core/content-types.ts` | Shapes for races, schools, unified abilities/spells, weather, event types and event rules | Phase 1 biomes/resources; Phase 2 cultures/creatures; Phase 3 needs/jobs/illnesses/traits |
| `src/engine/core/validate-content.ts` | Duplicate/reference checks, **per-tier effect caps (R-24)**, **no self-taught magic (R-28)**, **race balance (R-29)** | Add checks with each new content type |
| `src/engine/people/tiers.ts` | Tier table with soldier equivalence and caps, `LEGEND_CAP = 3`, `MAX_SOLDIER_EQUIVALENT = 1000` | Read-only design constants; change only with the user |
| `src/engine/people/aptitude.ts` | `rollAptitude` (race + inheritance + aura), `meetsRequirements` | Phase 2 history and Phase 3 promotion call it; Phase 3 adds age scaling |
| `src/engine/people/combat-scale.ts` | `soldierEquivalent(person)`: the R-24 yardstick | Phase 2 world battles, Phase 3 combat consistency, drama check |
| `src/engine/narrative/render.ts` | `Narrator` interface and a deterministic template narrator | Recaps (Phase 3) and an optional LLM narrator later |
| `src/engine/systems/` | `DEFAULT_SYSTEMS` order plus a demo seasonal weather system | Phase 1 replaces weather with per-cell climate |
| `src/content/` | Humans, two **placeholder** races (awaiting Phase 2 sketches), schools, sample skills/spells, weather, event types with historian templates, one example rule with a cause link | All content work |
| `src/app/NextApp.tsx` (`/?next`) | Seed, New world, step day/month/year, chronicle, a per-race magic aptitude preview | Phase 1 world map replaces the body |
| `tests/unit/engine-*.test.ts` | Determinism, save→load→continue, content validity, aptitude distribution, bloodlines, ability gating, scale ceiling, race balance | Extend for each system |

---

## 2. Vision

Generate a world with mountains, rivers, biomes, climates and unevenly spread resources. Several human cultures and a few other races live there. Simulate a few centuries of coarse history in seconds: settlements, families and dynasties, famines and plagues, beasts, wars, ruins and legends. Then pick a place and watch it live, day by day.

Its people are born, grow up, fall in love, marry, quarrel, grieve, work, get sick, get hurt, grow old and die. They feel hunger, cold, fear, loneliness and pride. Seasons, weather, harvests, disease, fire, wild animals, raiders and their own feuds and ambitions push them around. A few people have real magical talent. Many can manage a small common spell. Most have none. Talent only grows if someone teaches it or a book survives to pass it on.

The rest of the world keeps moving and reaches the site through migrants, caravans, raids and news. Over later phases the world grows to competing kingdoms and institutions. The player starts as an observer. Later they can either **steward a settlement or institution**, or **follow and guide one character**. The chronicle tells true stories of what the simulation did, with a historian's flair.

### 2A. What good looks like: target emergent stories

These are **examples of the kind of stories the systems should be able to produce**. They are *not* scripts to implement. If the systems cannot plausibly produce stories of this shape, something is missing.

1. **Winter of want (site, Phase 3):**
   - An early frost ruins the late harvest, and stores run low by midwinter.
   - The steward AI rations food. Two elders and an infant die of cold and hunger.
   - The infant's mother falls into despair and stops working.
   - Her husband blames the leader, who kept the hunters on wall-building. His opinion of the leader drops and he starts a brawl.
   - In spring, three families leave for a richer town.
   - The chronicle links every step.
2. **The healer's line (site and world, Phases 3–5):**
   - The only woman in the village with real life affinity heals a fever outbreak and earns fame.
   - She teaches her niece, who has weak talent, a few cantrips.
   - She dies in a raid before teaching anything more.
   - Her book of remedies survives, but a later fire burns it. That knowledge is gone from the region.
3. **Rival families (site, Phases 3–4):**
   - Two households compete over the best fields.
   - A marriage between them is refused. A theft follows, then a beating, then a death.
   - A revenge killing leads to exile, and the exile joins raiders who return years later.
4. **The drought migration (world, Phase 2):**
   - Decades of poor rain in a river valley drive people to migrate.
   - They found a new town near a mountain mine, which grows rich on iron.
   - The old town declines, and its lord marries into the new town's family to keep influence.
5. **The beast and the hero (world, Phase 2):**
   - A great beast takes a lair near a trade road, and caravans stop.
   - Two hunting parties die.
   - A strong but ordinary warrior, with no magic and helped by a crowd of hunters, finally kills it.
   - She becomes a notable, founds a hall and her grandson becomes lord.
6. **The proud race (world, Phases 2–5):**
   - A magic-leaning race with few births holds a high-aura forest.
   - Its few mages make it dangerous, but each war costs lives it cannot replace.
   - Over centuries it shrinks under steady human pressure, unless its land stays untouched.

7. **The legend's last war (world, Phases 5–6):**
   - The only living legend, an old battle-mage, serves a small kingdom. One day of his power breaks a 1,000-strong invading army.
   - The neighbouring kings form a coalition and march with three times that number. He spends his strength on the first day and dies on the second.
   - His apprentice, only Exceptional, carries his notebooks into exile. Decades pass with no legend alive anywhere in the world.
8. **The peasant's sword (world and site, Phases 4–5):**
   - A farmhand joins a bounty party against the wyvern of the pass. The hero leading it dies in the lair.
   - The farmhand drags a scaled hide and a strange ring out. The ring awakens a faint gift for fire in her, once, and she is noticed.
   - The hedge-witch teaches her two cantrips. Her grandson is a court mage.
   - Her neighbours envy the ring. One night it is stolen, and the thief's family carries the grudge.
9. **The champion of Coedwenallt (world, Phases 4–7; added 2026-10-13):**
   - A council mage rises to legend. The next war names her in every battle; one day of her power breaks a raiding host, and she is spent for a season.
   - She leads the hunt that kills the afanc of the mere and takes its hoard, then raises a tower on the shore.
   - She dies old. Her apprentice carries her books into an order that keeps them for a century, until a fire.

**Bad outcomes to avoid:**
- Everyone dies in year one on most seeds.
- Nothing notable happens for an in-game year.
- Every seed tells the same story.
- Legends are common, or a legend beats a larger host or a whole kingdom.
- A Strong-tier mage wins battles alone.
- A race wipes out the others in every seed.
- Chronicle lines describe things the inspector cannot confirm.
- People never visibly sleep, eat or socialise.
- Relationships exist as numbers but never cause anything.

### 2B. Chronicle style guide
- **Voice:** a measured historian with mild flair. Past tense. Concrete names, places and numbers. No modern slang, and no invented facts.
- **Good examples:**
  - "In the deep of the Frostmonth, the stores of Ashford ran dry. Old Bera and the infant Tomas did not see the thaw."
  - "Hald Ironhand struck the last blow against the Gorewyrm on the Dunmere road, though eleven hunters had fallen before him."
- **Bad examples:**
  - "Something terrible happened in the village." This is vague.
  - "Bera died, as was her destiny." This invents fate.
  - "The village was sad." Name who grieved and why.
- **Event size:**
  - Minor events get one line.
  - Notable events get two or three sentences, including the cause: "…because the hunters had been set to the walls".
  - Recaps run one or two paragraphs per season or year, ordered by importance, and mention unresolved threads.
- **Template variety:** at least three variants per common event type. Choose the variant with the event's own RNG stream so prose stays deterministic.

---

## 3. Locked decisions

| ID | Decision |
| --- | --- |
| R-01 | **Observer first.** The architecture keeps a hybrid mode open for later, with both styles chosen per run: steward a settlement or institution, or follow one character. |
| R-02 | **Keep the tech stack and rebuild the sim core.** Keep TypeScript, React, Vite, Canvas 2D, Vitest, Playwright, the Vercel main-only deploys and the useful plumbing. Write a new, data-driven simulation core. Old saves, rule versions and compatibility are dropped. The new core inherits **none** of the old gates or contracts. |
| R-03 | **Determinism is a cheap convention, not a gate.** Use seeded RNG and a fixed update order everywhere, and keep one same-seed test within the current version. No cross-version replay. |
| R-04 | **World first, then zoom in, DF-style.** World-gen comes first, with coarse history, then one detailed live site. Detail spreads outward over phases. |
| R-05 | **Customization through content data files plus agent-added content.** World-gen sliders come later; keep a params object ready now. No in-game editor. |
| R-06 | **"Efficient" means three things:** faster development, fast runtime (centuries of history in seconds; phone usable), and drama visible at every scale. "Skip to the good stuff" tools come gradually and never force events. |
| R-07 | **2D with elevation now; z-levels/underground stay a later option.** |
| R-08 | **Several human cultures plus 2–3 original races from Phase 2 (Legends).** Races are content-defined. More races can be added later without engine changes. |
| R-09 | **Drama: three systems deep early, one thin.** Nature & environment, social & personal, and outside threats get real depth early. Politics & trade starts thin and deepens later. |
| R-10 | **Medium world, bigger later.** Start at about 256×256 cells, 3–8 civs, dozens of sites and a few thousand notable figures, with everyone else as counts. Scale to 512×512+ through level-of-detail and Workers. |
| R-11 | **World-gen history plus live play.** History is fast-simulated for about 250 years by default, then the present plays live. |
| R-12 | **Magic is present early, lightly, and important long-term.** Monsters, legendary places and rare mages appear in legends; common cantrips appear at the live site; magic deepens in Phase 5. |
| R-13 | **Magic rarity is set per race.** The human baseline is about 60% none, 35% weak (small common spells), and 5% real talent. A strong mage is 1 in several hundred or rarer. |
| R-14 | **Numbers are optional in the inspector.** Attributes, skills and known spells sit in an optional panel. The chronicle stays narrative. |
| R-15 | **First playable is world map + legends + one live site.** |
| R-16 | **Narration is local data-driven templates with historian flair.** Leave a seam for an optional LLM narrator later. No API key and no backend. |
| R-17 | **Simple coloured tiles and glyphs/icons first.** The Illustrated Minimal art pass comes later. |
| R-18 | **Archive the old docs** to `docs/archive/` and keep a short new doc set. |
| R-19 | **Desktop first, phone usable.** |
| R-20 | **Retained principles:** story text describes only real events; no scripted plots or protected heroes, and collapse or extinction can happen; the full moral range is possible, grounded in conditions. |
| R-21 | **Time:** the live site ticks **daily**. The world ticks **monthly** during play and **yearly** during world-gen history. Speeds run up to "run until notable", with auto-pause on chosen categories. |
| R-22 | **Agents work in plan mode, merge at milestones, and ask on design forks.** Each phase ends with a playtest check-in. |
| R-23 | **The old "Story Spotlight" folds into the hybrid modes** as one tool: widening a person's options. It is not a separate system. |
| R-24 | **Scale ceiling (hard rule).** The power curve is steep:<br>• Gifted ≈ 1–2 soldiers.<br>• Strong ≈ a squad (5–15).<br>• Exceptional ≈ a company (30–80).<br>• **Legendary ≈ one low-end field army (about 1,000 soldiers).** That is the absolute maximum. **0–3 legends exist in the world at once:** typically none, sometimes one or two, rarely three.<br>Legends stay mortal. A larger host, a second legend, exhaustion of their daily power, ambush, poison, assassination, disease, starvation or age can kill them. Content validation enforces per-tier effect caps, and the world tier enforces the legend count. |
| R-25 | **One unified aptitude system.** Every skill, ability and spell has hard attribute requirements and learning-speed modifiers. Magic is one family inside it, alongside smithing, healing, leadership, fighting and the rest. |
| R-26 | **Where aptitude comes from:** race baseline + inheritance (bloodlines) + environment and events (birth near or exposure to high-magic places). There is no spontaneous talent beyond normal inheritance variance. |
| R-27 | **Potential is fixed, skill grows.** Innate attributes set the ceilings and learning speed. Practice raises skill toward those ceilings. Physical attributes decline with age and injury. |
| R-28 | **Magic is learned only from teachers/apprenticeship, books/written lore (items) and institutions.** There is no self-discovery, so knowledge can be lost. |
| R-29 | **Race balance.** A race stronger in magic (or anything else) carries downsides: low numbers (few births, slow maturity) and/or needs/dependencies (rare environments or resources). "Magic has a price" (casting cost) is an optional per-school flag and a fork for Phase 5; the default is mild fatigue. |

**Not retained as a principle:** pause-when-tab-hidden. Default to pausing for performance, but it is not a requirement.

---

## 4. Principles and anti-goals

### Principles
- **Simulation first.** Every chronicle line renders a real event record. Templates add flair, never facts.
- **Ordinary life is the backbone.** Section 6 covers families, relationships, needs, health and environment. Everything else (threats, politics, magic) works *through* everyday life. Its effects show up as hunger, grief, injury, migration, marriage and feuds.
- **Breadth before depth.** Each phase leaves every system playable and connected. Depth comes in later passes.
- **Data over code.** Races, cultures, biomes, resources, creatures, jobs, needs, traits, illnesses, buildings, skills, spells, event rules, names and templates live in content files.
- **Grounded scale.** Section 3 R-24 applies to all content and every system.
- **Level of detail.** Spend detail where the viewer looks. Keep coarse and detailed simulation consistent.
- **Drama emerges** from interacting systems, never a director. Tune through content weights, measured with the drama check.
- **Future seams are cheap interfaces now:** the command queue, world-gen params, the race registry, the narrator interface.

### Anti-goals (what made the old repo slow)
- No per-feature evidence docs, independent oracles, 100-seed proof batteries, browser coverage gates or cross-version save replay.
- No frozen rule versions. Rules change freely until a later beta decision.
- No exhaustive up-front numeric specifications. Pick reasonable numbers, put them in content, and tune by playing.
- No full ECS framework and no new heavy dependencies without reason.
- No depth beyond what the current phase needs.

---

## 5. Peoples, attributes, aptitude and magic

### 5.1 Attributes (every person and every creature)
- **Physical:** Strength, Agility, Endurance.
- **Mental:** Intellect, Willpower, Perception, Charisma.
- **Magical:** **Power**, the raw capacity, which is 0 for most people. **Affinities** are values per magic school (fire, water, earth, air, life, mind…), with the list kept in content.
- **Scale and record:** values on about a 1–20 scale. Each person stores `attributes` (current), `potential` (innate ceiling) and `traits` (personality: brave, greedy, kind, ambitious…).
- **Ageing:** physical attributes rise through youth, peak, then decline with age by race-specific curves. Injuries can lower them permanently.

### 5.2 Skills, abilities and spells (one system)
- **Content definition:** `{ id, family: 'craft'|'labour'|'combat'|'social'|'knowledge'|'magic', requirements: {attr: min…}, learnRate(attrs), effects, cost? }`.
- **Examples:**
  - Master smithing needs Strength and Perception.
  - Generalship needs Charisma and Intellect.
  - A fire cantrip needs Power 1 and Fire affinity 1.
  - A healing spell needs Power 6, Life 8 and Willpower 6.
- **Gating:** a person can learn something only if they meet the requirements *and* have a source: someone teaching them, a book, or an institution (R-28). Mundane basics such as farming, foraging and basic fighting can also be learned by doing.
- **Skill level and effectiveness:** skill grows with practice at a speed set by the relevant attributes, capped by potential. Effectiveness = attributes × skill × tool/equipment × effect.
- **Effect caps (R-24):** content validation caps spell and ability damage, area, duration and uses per day. Combat math is tested against the tier-equivalence table in section 5.4A.

### 5.3 Where aptitude comes from
- `rollAttributes(race, parents | null, birthplace, rng)` is a pure function used both in world history and at the live site. It combines:
  - the race baseline distribution, which gives the per-race magic rarity of R-13;
  - the parents' average with variance (inheritance), from which magical and physical bloodlines emerge;
  - birthplace effects, where high world `aura` slightly raises Power and Affinity odds.
- Exposure events can **awaken or shift** aptitude, rarely and within caps. Examples are surviving a magical disaster or long residence at a legendary site. Awakenings are a content list (`content/awakenings.ts`, M3.9): finding or long holding an item, surviving a magical event, years at a high-aura place, a teacher's rite. Each happens at most once per person, lifts at most one tier, and is a chronicled event with a cause. Items obey the same ceiling: an item lifts its holder at most one tier and never past Legendary (decided 2026-10-12).

### 5.4 Races
- Each race is content data:
  - attribute ranges and magic distribution;
  - lifespan, maturity age and fertility;
  - preferred biomes;
  - needs/dependencies, such as needing high-aura land, cold climates or a rare food;
  - cultural tendencies.
- 2–3 original races enter in Phase 2: humans, one magic-leaning race and one physically strong race. The sketches are a user fork.
- **Race-balance check in content validation:** a race whose magic or physical baseline exceeds the human baseline must declare at least one downside (low fertility, slow maturity, or a dependency).
- The drama check reports each race's population and power share across seeds, so no race should dominate.

### 5.4A Starting numbers (defaults; tune freely in content)
- **Attribute roll:** the race mean plus the sum of three uniform(−2..2) draws, which gives a bell shape without `pow`/`exp`, clamped to the race range.
  - With parents, use `round((race mean + parent average × 2) / 3)` as the centre, so children regress partly toward the race mean.
  - Potential = rolled value + uniform(0..3), capped at 20.
  - A child's attributes start at about 40% of potential and grow to the full value by maturity.
- **Human magic tiers (per person, at birth):**

| Tier | Power | Share | What they can do | Combat equivalence (R-24) |
| --- | --- | --- | --- | --- |
| None | 0 | ~60% | Nothing magical | One person |
| Faint | 1–2 | ~35% | 1–3 common cantrips: kindle a flame, a small light, mend cloth, calm an animal, ease a headache | One person |
| Gifted | 3–6 | ~4.5% | A real specialist: a village healer, weather-reader or hedge-witch | About 1–2 soldiers |
| Strong | 7–12 | ~0.5% | A regional figure: a court mage or battle-mage | About a squad (5–15) |
| Exceptional | 13–16 | about 1 in 2,000 or rarer; a handful per world | A famous figure of the age | About a company (30–80) |
| Legendary | 17–20 | **0–3 alive in the world at once**, typically 0–2 | Remembered for centuries; shapes the fate of kingdoms | **At most one low-end field army (about 1,000 soldiers)** |

  - Mundane people follow the same curve through attributes and skill. The greatest swordsman of an age is roughly Exceptional-equivalent at most, unless magic or a legendary artifact is involved.
  - Affinities: a person with Power above 0 gets one primary affinity (race-weighted) at a value near Power, and possibly a weaker secondary one.
  - Inheritance: if a parent is Gifted or better, the child's odds of Gifted and every higher tier roughly double. Faint odds are unchanged, so bloodlines pass on *real* talent.
  - Environment: birth in a cell with aura in the top 10% shifts the odds of each tier above None by +25% relative.
  - **Becoming Legendary:** nobody is born Legendary. An Exceptional-potential person reaches it only through decades of training, a great teacher or lost lore, and usually a high-aura place or event.
  - **Legend cap:** the world tier checks the count. While 3 Legendary individuals live, no one else can cross into Legendary until one dies. Their potential stays capped at Exceptional in the meantime.
- **Effect caps per tier (R-24, enforced in `validateContent`):**
  - Each spell declares a minimum tier, and its damage, area, duration and uses per day must fall within that tier's caps.
  - Faint and Gifted: no area damage. Damage is at most a soldier's weapon hit.
  - Strong: area up to a 3×3-tile radius, a few uses per day.
  - Exceptional: area up to about a 10-tile radius, a dozen or so uses per day.
  - Legendary: battlefield-scale effects (a firestorm over a host, an earthquake across a field) but **few uses per day**, with lasting exhaustion afterwards. One day of a legend's power can break about 1,000 soldiers. It cannot do the same every day, or alone stop a bigger host.
  - A mage's uses per day are bounded by Power and Willpower (for example `Power/2 + Willpower/5`).
  - Healing at most doubles natural recovery speed or stabilises one critical wound per use. Legendary healers can save many in one day, but cannot raise the dead.
  - Weather magic: Strong tier affects a site's local weather for one day; Legendary affects a region for days.
- **Combat sanity checks (unit tests):** each check uses 100 simulated fights at the world-tier battle resolution.
  - Gifted vs 2 soldiers: about even.
  - Strong vs 10 soldiers: about even.
  - Exceptional vs 50 soldiers: about even. Against 150, she loses most fights.
  - Legendary vs 1,000 soldiers: about even. Against 3,000, or against 1,000 soldiers plus an Exceptional, he loses most fights.
  - A top mundane warrior beats 2–3 average soldiers, not 10.
- **Race example shapes** (the user approves the real sketches in Phase 2):
  - *Humans:* average everything, adaptable to many biomes, fast to reproduce, baseline magic.
  - *Magic-leaning race:* Power and affinity odds ×4 versus humans, lower Strength and Endurance, fertility ×0.3, maturity ×2, lifespan ×3. Depends on high-aura land: their mood and health decline away from it.
  - *Physically strong race:* Strength and Endurance +3, magic odds ×0.3, prefers mountains or cold, needs more food (×1.5), fertility ×0.7.

### 5.5 Magic in the world
- **Early (Phases 2–3):** rare notable mages and bloodlines in legends; legendary places and monsters; common cantrips at the live site (light, kindle, mend, soothe), taught by parents or a village hedge-witch; books and effect items as items; awakenings.
- **Phase 4:** perilous places (ruins, barrows, lairs, old mines, aura places), hoards and expeditions, so items and lore move through the world and commoners can find them (M4.7).
- **Phase 5:** full schools and affinities (the flat list of six stays until the Phase 5 fork extends it, decided 2026-10-12), apprenticeship lineages, spellbooks as valuable lore, magic in work, healing and war, enchanting from beast parts and rare ore, magical beasts with abilities and aura-bound lairs, environmental awakening, race dependencies with real effects, dragons and great beasts as individuals, and the optional casting-cost fork.
- **Phase 7:** institutions (guilds, temples, orders, academies) and society's attitudes to magic.

---

## 6. Life simulation (the backbone)

Life runs at two levels of detail. The **site tier** runs daily, and every resident is an individual. The **world tier** runs monthly or yearly, with notables as individuals and everyone else as population counts by race, culture and age band.

| Domain | Site tier | World tier |
| --- | --- | --- |
| **Life cycle** | Birth, infancy, childhood, coming of age, adulthood, old age, death. Ageing changes attributes. Lifespan and maturity come from the race. | Births and deaths by age band; notables age individually. |
| **Family and household** | Courtship, marriage/partnership (rules from culture), pregnancy and childbirth risk, children, households and homes, inheritance of property and roles, widowhood, remarriage, orphans and guardianship, adoption. | Family trees and dynasties for notables; household counts per site. |
| **Relationships** | Opinion from interactions: working together, conversation, help, gifts, insults, fights, shared hardship, betrayal. Friends, rivals, lovers, enemies. Grudges, revenge, forgiveness. Loyalty to family, leader and community. | Kin, spouse, rival and sworn-enemy links between notables; feuds between families, sites and civs. |
| **Needs** | Food, water, rest, warmth/shelter, safety, companionship, purpose/leisure, faith (if the culture has it). | Aggregate food security, housing and safety per site. |
| **Mood and mind** | Mood from needs, memories, traits and surroundings. Stress builds into breakdowns: tantrum, despair, drinking, leaving, violence. Grief, joy and pride from events. Memories fade over time. | Site morale and unrest. |
| **Health** | Hunger, thirst, exposure (cold/heat), exhaustion, injuries with healing time and possible lasting harm, contagious disease (per-person infection), chronic illness, old-age frailty. Healers, herbs, medicine and healing magic. | Plague and famine years; life expectancy shaped by conditions. |
| **Environment and stressors** | Seasons and day length, temperature, weather events (storms, snow, drought, flood, heat wave), crop growth and failure, spoilage, fire, wild animals, local depletion of timber, game and soil, terrain hazards. | Climate per world cell, regional droughts and harsh winters, disasters, pressure to migrate. |
| **Work and daily rhythm** | Schedule of sleep, meals, work, leisure, worship and socialising. Jobs are gated by attributes and skills. Hauling, building and crafting. A steward AI sets priorities. | Site production, surplus and trade by aggregate labour. |
| **Society and custom** | Status and wealth, crime (theft, brawls, murder) and punishment by culture values, festivals, funerals, customs, religion. | Prosperity, inequality and cultural drift between sites. |
| **Movement** | Newcomers, refugees, people leaving when unhappy or exiled. | Migration flows between sites, driven by conditions. |

**Build rules:**
- The **whole table enters thinly in Phase 3.** Every domain is present, simple and connected. Domains deepen in Phases 4–6.
- Every domain must produce chronicle events and inspector data. Nothing that happens to a person may be invisible.
- **Interactions are the point.** Examples:
  - a harsh winter means food shortage, then sickness among the old, then grief, then a breakdown, then a feud;
  - a death leads to an inheritance dispute.
- Each domain's phase spec names at least three cross-domain links it creates.

### 6A. Starting mechanics per domain (defaults; tune freely)

All of these values live in content or config, with a one-line comment. They are starting points, not contracts.

- **Daily schedule:**
  - The day has 4 blocks: night (sleep), morning (work), afternoon (work or leisure), evening (meals, socialising, worship).
  - A person's job fills the work blocks. Children play or learn, and elders do light tasks.
  - Each block lets a person satisfy needs: eating at meals, sleeping at night, talking in the evening.
- **Needs (0–100, 100 = satisfied):**
  - Daily decay: food −35, water −50 (springs and wells make water easy unless there is drought or siege), rest −40, warmth −0 to −60 depending on temperature, clothing and shelter, companionship −10, purpose −8, faith −5.
  - Below 30 a need gives a mood penalty. Below 10 it does health damage, for food, water, rest and warmth.
- **Mood (−100 to +100):**
  - Mood is the sum of need modifiers plus active memories plus trait modifiers plus surroundings (crowding, ugliness, comfort).
  - Stress builds while mood is below −30 and falls while mood is above 0.
  - When stress passes a trait-adjusted threshold, a breakdown happens. Its type depends on traits:
    - hot-tempered: tantrum or brawl;
    - melancholic: despair (stops working);
    - restless: wanders off or leaves;
    - greedy: theft.
  - A breakdown creates memories for witnesses.
- **Memories:**
  - A memory is `{type, about?, moodDelta, opinionDelta?, decayDays}`.
  - Examples:
    - death of a spouse: −40 mood, decays over about 120 days;
    - wedding: +20, about 30 days;
    - saved by X: +15 mood and +40 opinion of X, opinion decays slowly.
  - Cap at about 20 memories per person, keeping the strongest.
- **Relationships:**
  - Opinion runs from −100 to +100 per pair, but only pairs that have interacted are stored.
  - Each evening a person has 1–3 sampled interactions with nearby people, chosen from household, co-workers and friends. The interaction type is weighted by traits and opinion: chat, joke, help, argue, insult, flirt.
  - Labels by opinion and history: friend at +40 or more, rival at −40 or less, enemy at −70 or less with a grudge memory, lover after romance.
- **Courtship and family:**
  - Eligible adults with mutual opinion of at least +50 and compatible culture rules can begin courtship. Marriage follows after a culture-set time.
  - Childbirth probability depends on race fertility, age, health and food security. Childbirth carries a risk of death that falls with a skilled midwife or healer.
  - Children inherit culture, faith and surname customs.
  - On death, property and role pass by the culture's inheritance rule: eldest, all children, spouse or elected.
  - Orphans are taken in by kin, else by the household with the highest opinion, else by the community.
- **Health:**
  - Health runs 0–100, plus a list of conditions.
  - Wounds have severity (minor, serious, critical) and a healing time. Serious and critical wounds may cause lasting attribute loss.
  - Disease is content: `{infectivity, incubation, duration, severity, ageRisk, season?}`. Spread is daily, among household and co-workers of infected people, with probability = infectivity × contact × (1 − resistance).
  - Old-age frailty rises past race maturity × 3.
  - Death happens when health reaches 0, or through critical conditions.
- **Environment:**
  - The cell's seasonal temperature range gives a daily temperature with noise.
  - Weather events are drawn daily from the cell's climate: storm, snow, heat, drought spell, flood near rivers. Each affects work, warmth, crops or buildings.
  - Crops grow by season, soil, water and labour. Frost or drought can damage or ruin them.
  - Food spoils unless it is in storage, and preserved food spoils slower.
  - Fire starts from hearths, lightning or arson and spreads across adjacent flammable tiles unless people put it out.
  - Timber, game and soil fertility deplete locally and recover slowly.
- **Work:**
  - Jobs are content: `{id, requirements, skill, outputs, tools?, workplace?}`.
  - The steward AI ranks needs daily: food days remaining, shelter shortfall, defence threat, repairs, crafting shortages. It assigns people by suitability (attributes × skill), traits and preference.
  - People with low mood work slower. Children and elders do light work.
- **Society:**
  - A person's status comes from role, wealth, fame and family. Status affects interactions and marriage prospects.
  - Crime arises from breakdowns, desperation (hunger leads to theft), grudges (assault, murder) and greed traits. The leader punishes by culture values: fine, labour, exile, execution. Punishment creates memories and grudges.
  - Festivals happen on culture-set seasonal dates if food allows, and give a mood boost. Funerals happen on death and give a grief memory to kin and friends.

---

## 7. Architecture

### 7.1 Source layout

```
src/
  engine/      pure simulation (no DOM, no Date, no Math.random, no timers)
    core/      ids, rng streams, clock, scheduler, event log, command queue, save schema
    worldgen/  heightmap, climate, rivers, biomes, resources, aura, naming
    history/   world-tier systems (demographics, civs, sites, figures, wars, beasts)
    site/      site-tier systems (life domains of section 6, work, combat, threats)
    people/    attributes, rollAttributes, skills/abilities/spells, learning
    lod/       promote/demote between world tier and site tier
    narrative/ notability scoring, template rendering, recap assembly
  content/     races, cultures, biomes, resources, creatures, jobs, needs, traits,
               illnesses, buildings, items, skills, spells/schools, event rules, templates, names
  app/         React UI (world map, legends, site view, inspector, chronicle)
  platform/    IndexedDB saves, Web Worker host, preferences
```

`scripts/check-boundaries.mjs` gets the new layer table:
- `engine` may import only `engine` and `content`;
- `content` may import only `engine` types;
- `app` and `platform` may import the layers below them.

The forbidden-globals list stays for `engine`.

### 7.2 Core concepts
- **IDs:** integers per entity kind, allocated in state.
- **RNG:** named streams `hash(seed, streamName)`, so a new system does not reshuffle the others. Reuse `src/sim/rng.ts`. Upgrading to `sfc32` is optional; decide in Phase 0.
- **Safe math for determinism:** use only `+ - * /`, `sqrt`, `floor`/`round`/`min`/`max`/`abs`. No `sin`/`cos`/`exp`/`pow`/`log` in `engine`; use lookup tables instead. Iterate in ID order.
- **Clock:** the base unit is the day. There are 4 seasons. Choose the year length in Phase 0, for example 12 × 28 days. Systems declare cadences, and the scheduler runs them in a fixed declared order.
- **State:** one serializable `WorldState` made of plain objects and `Map`s by ID. Snapshots are structured clones.
- **Systems:** `(state, ctx) => void`. They emit events through `ctx.emit` and read `ctx.content`.
- **Events:** `{ id, day, type, importance, actors[], place, causes[], data }`.
  - `causes` links earlier events and powers "why did this happen?".
  - Notable events are kept forever. Trivial events roll up into yearly aggregates after N years.
- **Command queue (hybrid seam):** processed at the start of each tick and recorded. It stays empty in observer mode. The steward AI and personal AI sit behind interfaces that a player controller can later replace per category.
- **Narrator interface:** `renderEvent` and `renderRecap`. Local templates now; an optional LLM later.

### 7.3 Person record (both tiers; blocks marked † exist only at site tier)
`identity` (name, race, culture, sex, birth day, birthplace), `family` (parents, spouse(s), children, household), `attributes`, `potential`, `magic {power, affinities}`, `traits`, `skills`, `knownAbilities`, `deeds`, `fame`, `health` (summary at world tier, detailed†), `needs`†, `mood`†, `relationships` (notables only at world tier; everyone at site tier), `memories`†, `schedule/job`†, `position`†.

### 7.3A Shape sketches (illustrative TypeScript; refine in Phase 0)

```ts
type Id = number;
interface WorldState {
  seed: string; day: number; params: WorldParams;
  rng: Record<string, number>;            // named stream states
  nextId: Record<EntityKind, Id>;
  cells: WorldCells;                       // typed arrays: elevation, temp, rain, biome, aura, resources…
  civs: Map<Id, Civ>; sites: Map<Id, Site>; people: Map<Id, Person>;
  creatures: Map<Id, Creature>; items: Map<Id, Item>;
  activeSite: SiteDetail | null;           // site-tier detail for the watched site
  events: EventLog; commands: Command[];
}
interface Person {
  id: Id; name: string; raceId: string; cultureId: string; sex: 'f'|'m';
  born: number; birthplaceCell: number; died?: number; deathCause?: Id /*event*/;
  family: { parents: Id[]; spouses: Id[]; children: Id[]; householdId?: Id };
  attributes: Attributes; potential: Attributes;
  magic: { power: number; affinities: Record<string, number> };
  traits: string[]; skills: Record<string, number>; knownAbilities: string[];
  fame: number; deeds: Id[] /*events*/; health: Health;
  detail?: { needs: Needs; mood: number; stress: number; memories: Memory[];
             relationships: Map<Id, Relationship>; jobId?: string; pos?: [number, number] };
}
interface SimEvent { id: Id; day: number; type: string; importance: number;
  actors: Id[]; place: Id | number; causes: Id[]; data: Record<string, unknown>; }
interface EventRule { id: string; tier: 'world'|'site'; cadence: Cadence;
  when(ctx: RuleCtx): boolean; weight(ctx: RuleCtx): number; apply(ctx: RuleCtx): void;
  templates: string[]; }
```

**Example content entries:**

```ts
export const spells = [
  { id: 'kindle', school: 'fire', family: 'magic', requirements: { power: 1, 'affinity.fire': 1 },
    learnFrom: ['teacher', 'book'], effect: { kind: 'utility', tag: 'light-fire' }, cost: { fatigue: 5 } },
];
export const rules: EventRule[] = [{
  id: 'theft-from-hunger', tier: 'site', cadence: 'daily',
  when: c => c.person.detail!.needs.food < 15 && c.site.stores.food > 0,
  weight: c => 0.02 * (c.hasTrait('greedy') ? 3 : 1) * (c.hasTrait('honest') ? 0.2 : 1),
  apply: c => { c.moveFood(c.person, 2); c.emit('theft', { actors: [c.person.id], causes: c.recentCauses('hunger') }); },
  templates: ['Driven by hunger, {actor} stole bread from the stores of {site}.', /* +2 variants */],
}];
```

### 7.4 Two tiers of detail (LOD)

| | World tier | Site tier |
| --- | --- | --- |
| Where | Whole map, every civ and site | The watched site (more later) |
| Cadence | Yearly in world-gen, monthly in play | Daily |
| People | Counts by race/culture/age band, plus notables as full records | Every resident is a full record |
| Space | World cells (about 256×256) | Local map (about 96×96) generated from the cell |
| Combat | Strength comparison plus randomness | Individual exchanges using attributes, skill, equipment and spells |

- **Promotion (world → site):** notables keep their records. Other residents are generated through `rollAttributes`, consistent with the site's race/culture/age mix and with known family links.
- **Demotion (site → world):** people fold back into counts. People who became notable stay as figures, and the log is kept.

### 7.5 Content ("raws")
- Typed TS data modules in `src/content/*` with string IDs.
- `validateContent()` runs at startup and in tests. It checks references, ranges, the **effect caps (R-24)** and the **race balance (R-29)**.
- JSON loading of the same shapes stays a later option for mods and sliders.
- **Event rules** are content entries with `{ id, tier, cadence, when(ctx), weight(ctx), apply(ctx), templates }`.
- `docs/CONTENT_GUIDE.md` gives one worked example per type.

### 7.6 Performance plan
- World-gen and history run in a Web Worker with a progress bar. The live sim runs in a worker from Phase 3. The UI receives snapshots or diffs at most about 10 times per second.
- **Budgets** (desktop):
  - 256×256 world-gen in under 2 s;
  - 250 years of history in under 10 s;
  - a site of about 150 residents at 10 or more days per second at max speed.
- Movement uses grid A* with a per-tick budget and caching. If profiling demands it, fall back to straight-line movement.
- Social interactions are sampled per day, never computed for all pairs.
- Rendering is Canvas 2D, viewport-culled, with static layers cached offscreen.

### 7.7 Reuse map

| Keep / adapt | Notes |
| --- | --- |
| Tooling: package scripts, Vite, TS config, Prettier, Vitest, Playwright, `vercel.json`, `.nvmrc` | As is |
| `src/sim/rng.ts`, `src/sim/seed.ts` | Move to `engine/core`; add named streams |
| `scripts/check-boundaries.mjs` + test | New layer table |
| `src/adapters/local-save.ts`, `save-envelope.ts`, `crypto.ts`, `src/controller/save-queue.ts` | Adapt to `platform/`; drop history-limit admission and per-version codecs |
| `src/controller/map-camera.ts`, `src/ui/MapCanvas.tsx` | Basis for the world-map and site-map canvases |
| `src/ui/Chronicle.tsx`, `RecapReader.tsx`, `Bookmarks.tsx`, `FamilyHistory.tsx`, `controller/recaps.ts`, `chronicle-filters.ts`, `controller/family.ts` | Reuse UI patterns, historian-prose style and family-tree reading; rewrite the data bindings |
| `.github/workflows/ci.yml`, `cleanup-merged-branches.yml` | Slim the CI; keep cleanup |

- Everything else in the old `src/` tree, the old tests and fixtures, the study scripts, the probes and the seed batteries is archived in Phase 0 and deleted at Milestone A.
- The old app stays the default page until then. The new app is at `?next`.

---

## 8. UI overview

1. **New World:** seed, world size, Generate. The params object is ready for sliders.
2. **World map:**
   - pan/zoom;
   - layers: elevation, biome, temperature, rainfall, resources, aura, civ borders, sites, races;
   - click for an inspector;
   - a year timeline slider from Phase 2.
3. **Legends browser:** searchable civs, sites, races, figures, families, beasts, artifacts, books and events. Everything is linked, with cause chains and timelines.
4. **Site view:**
   - tile map with residents and creatures as glyphs/icons;
   - inspector and chronicle panels;
   - pause, 1×, 4×, 16× and "run until notable", with auto-pause preferences by category.
5. **Person inspector:**
   - biography timeline;
   - family tree;
   - relationship list (friends, rivals, lovers, enemies, with reasons);
   - memories, needs and mood, health and injuries;
   - job and schedule;
   - an optional **attributes/skills/known spells** panel (R-14).
6. **Household and site panels:** members, homes, food stores, health overview, morale, current hardships.
7. **Recaps:** seasonal and yearly historian-style summaries.

On phone the map is on top and the chronicle/inspector is a bottom sheet.

---

## 9. Phases

Each phase lists its goal, milestones (PR-sized), done-when criteria and known forks. Sizes are rough and assume one agent.

### Build order after Phase 3 (Morgan's ranked list, 2026-10-14)

After the Phase 3 playtest Morgan asked for additions ranked by value and coding effort ([ranked list](https://claude.ai/code/artifact/f0a2128a-8c01-45d0-b3ed-802706df83d1)), liked all fifteen and chose legends first. Work now follows this order; the phases below still group the work by topic, and each item is spelled out in its phase. Value is 1–5; effort is S (one short thread), M (one thread) or L (two or three). The order may change at any playtest check-in.

1. **Legends as champions** (M5.5; value 5, M): built 2026-10-14 (#101), pulled ahead of Phases 4 and 5.
2. **Site life fixes** (M4.0; value 3, S): the Phase 3 playtest's known rough edges; built 2026-10-14 (#103). Can run beside any other item.
3. **Named battles on the map** (M4.8; value 3, S): built 2026-10-14 (#105).
4. **Annals of each people** (M4.9; value 3, S): built 2026-10-14 (#105).
5. **Dwarven mountain holds** (M4.10; value 3, S): built 2026-10-14 (#107).
6. **Succession wars and dynasties** (Phase 6, pulled forward; value 5, M): built 2026-10-14 (#104: civil wars, splits, ruling houses ended); the family tree of each house is on its People room page (#124, 2026-10-17).
7. **Dragons and great beasts as individuals** (M5.6; value 4, M): dragons built 2026-10-14 (#106), up to three at once; other great beasts and the restless dead built 2026-10-17 (build order 20).
8. **Religion: gods, priests, holy wars** (Phase 7, pulled forward; value 4, M): built 2026-10-14 in history (#109: faiths, high priests, prophets, schisms, conversion, holy wars); the People room lists priests and prophets, and a page per faith is still to come.
9. **Spellbooks and lineages** (M5.2; value 4, M): built 2026-10-16 (#118: apprenticeships, spells, spellbooks, lost and found lore, the People room's Magic tab).
10. **Court intrigue** (Phase 6 "Legends in politics", pulled forward; value 4, M): built 2026-10-16 (#120: plots and assassinations, honours, seats seized by legends, betrayal, bribes, bounties and hunts); the dragon at court followed as build order 17.
11. **Story threads view** (M4.6; value 2, S): not started.
12. **Expeditions and perilous places** (M4.7; value 5, L): history part built 2026-10-14 (#108: places, barrows, hoards, expeditions, beast parts, the restless dead); the map layer and a page per place built 2026-10-17 (P2).
13. **Diplomacy: alliances, vassalage, betrayal** (Phase 6; value 5, L): built 2026-10-17 in history (#121: alliances, calls to arms, betrayal, vassals and revolts, peace by marriage); showing vassals on the map and in the People room is still to come.
14. **Trade between peoples in history** (M4.4; value 3, M): not started.
15. **The world keeps moving while you watch** (M4.1–M4.3; value 4, L): not started.
16. **Armies and settlers move on the map** (M4.11; value 3, S; added 2026-10-14 from Morgan's playback notes): one host per side marches through a war and meets the enemy's host, and settlers walk to the land they found. Built 2026-10-17 (#122).

17. **The dragon at court** (Phase 6 "Legends in politics" leftover, P1 of the proposed next set; value 4, M; picked by Morgan 2026-10-17): built 2026-10-17. Realms near a dragon court it (and it falls on their enemies), fear it and pay a standing tribute, or set a bounty on it; a figure who takes the bounty hunts it with a host the realm lends, and a legend dies about 1 in 10 such hunts. Rules in `content/dragons.ts` (`court`), engine in `engine/history/dragon-court.ts`.
18. **Great works and enchanting** (M5.3, P3 of the proposed next set; value 4, M; picked by Morgan 2026-10-17): built 2026-10-17. A legend or a rich realm raises one wall, bridge, tower or warded grove in a lifetime, each with an effect on war, wealth, lore or harvest and plague, and it falls with its town; a legend whose town fits none makes a great item. Strong mages who still know a strong spell enchant items from slain beasts' remains or rare ore. Rules in `content/great-works.ts`, engine in `engine/history/great-works.ts`. The map glyph for standing works is still to come.
19. **Generation feuds and exile** (M4.5, P4 of the proposed next set; value 4, M; picked by Morgan 2026-10-17): built 2026-10-17. A killing between two houses can begin a blood feud that passes to children and grandchildren and flares in killings back and forth until a wedding, a blood price, forgetting or the end of a line; a killer of their own people, a loser of a disputed seat or a beaten claimant goes into exile at a foreign court and may come home pardoned or to claim the seat; an inheritance quarrel can split a house into a branch. Rules in `content/feuds.ts`, engine in `engine/history/feuds.ts`. A house page section for its feuds is still to come.
20. **Great beasts and the restless dead** (M5.6 leftover, P7 of the proposed next set; value 3, M; picked by Morgan 2026-10-17): built 2026-10-17. Great boars, afancs, wyverns, giants and water horses have a given name, a temper (savage, unforgiving, toll-taker) and a named lair; an unforgiving one comes back for a town that fought it, a toll-taker is paid in stores. A robbed barrow wakes its buried ruler, who walks on the robbers' realm until it falls or priests lay it to rest. Rules in `content/great-beasts.ts`, engine in `engine/history/great-beasts.ts`.

Items not in the list (M4.5, M5.1, M5.3, M5.4, the rest of Phases 6–9) keep their place and come after it unless a check-in moves them.

#### Where the list stands (2026-10-17)

Twelve threads have merged since the list was written (#101 to #122, `CHANGELOG.md`), beside the Four rooms UI redesign (#110 to #113, #115, #117) and the faster tests (#119). Thirteen of the sixteen items are built in full or in their history part. Left, in list order:

- Built since: the family tree (item 6), on each house's page in the People room (#124).
- UI halves of built items: a page per faith (8); vassals on the map and "vassal of" in the People room (13).
- History leftovers: none; other great beasts and the restless dead as individuals (7) are build order 20. The dragon courted, feared or put under bounty (10) is built as build order 17.
- Not started: the story threads view (11), trade between peoples (14), the world moving while you watch (15).
- Rough edges carried from earlier threads: child deaths below history's share and orcs at 7% (M4.0 leftovers); only 4 of 111 dwarven holds sit at a pass; the after-play map pauses about 0.4 s when the sharper map swaps in and draws stepped borders at full zoom; `?year=` starts at a different year from where Tales plays.

#### Proposed next set (2026-10-17; a proposal, not approved)

For when the picks Morgan has already seen (vassals shown in the UI, the world moving while you watch) are placed. Ranked by fit with Morgan's recorded taste: personal and story-first screens, famous figures who did things, betrayals, a calm on-theme map with a touch of fantasy, records of how things came to be. Value 1–5; effort S, M or L as above. None starts without Morgan's pick.

| Order | Addition | Where | What you would see | Value | Effort |
| --- | --- | --- | --- | --- | --- |
| P1 | The dragon at court | Phase 6 leftover | Picked 2026-10-17; now build order 17 above | 4 | M |
| P2 | Perilous places on the map and a Places page | M4.7 leftover | Picked 2026-10-17; built 2026-10-17 | 4 | S |
| P3 | Great works and enchanting | M5.3 | Picked 2026-10-17; now build order 18 above | 4 | M |
| P4 | Feuds across generations and exile | M4.5 | Picked 2026-10-17; now build order 19 above | 4 | M |
| P5 | A page per faith | Phase 7 leftover | Gods, holy city, high priests in order, schisms and holy wars, in the People and Book rooms | 3 | S |
| P6 | Orders and academies | Phase 7 | A legend founds an order or academy that keeps or loses their lore after them; each culture reveres, regulates or persecutes magic | 3 | M |
| P7 | Other great beasts and the restless dead | M5.6 leftover | Picked 2026-10-17; now build order 20 above | 3 | M |
| P8 | Rough-edges bundle | the list above | The carried rough edges fixed in one short thread; runs beside any other | 3 | S |

### Phase 0 — Reset and skeleton (2–3 PRs)
- **M0.1 Docs reset:**
  - `git mv` the old docs, ADRs, probes and evidence into `docs/archive/`.
  - Create `VISION.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md` (the R-table), a `CONTENT_GUIDE.md` stub and `CHANGELOG.md`.
  - Keep this plan as `docs/REBOOT_PLAN.md`.
  - Rewrite `README.md` and `CONTRIBUTING.md` briefly.
- **M0.2 CI and boundaries:** slim the CI (section 11), keep the legacy fast unit tests until deletion, and add the new boundary layers.
- **M0.3 Engine skeleton:** **already scaffolded** (see section 1F). What remains:
  - review the scaffold;
  - add a `platform/` IndexedDB save adapter, adapted from `src/adapters/local-save.ts`;
  - move world stepping into a Web Worker host when Phase 1 needs it.
- **Done when:** the old app works at `/`, `/?next` loads, CI is under 5 minutes, and the new docs total about 10 pages or less.
- **Forks:** none. Decide the year length and RNG yourself and record them.

### Phase 1 — World generation and world map (6–7 PRs)

Extras approved on 2026-10-11 (erosion, volcanoes, fertility, wildness, strategic features and a new M1.6 for travel and routes) live in [`docs/phases/PHASE_1.md`](phases/PHASE_1.md), which wins where the two differ.

- **M1.1 Terrain:** safe-math fractal noise, a few continents from seeded plate centres plus noise, sea level, and mountain ridges along plate edges.
- **M1.2 Climate and water:**
  - temperature from latitude, elevation and noise, **with seasonal ranges per cell**;
  - rainfall from a prevailing-wind sweep with rain shadows;
  - per-cell weather variability (drought risk, storm frequency, snow);
  - rivers by downhill flow accumulation, and lakes in basins.
- **M1.3 Biomes, resources, aura:**
  - a biome table (content);
  - clustered deposits (metals, stone, fertile soil, timber, game, fish, gems, salt, clay), so some regions are rich and others poor;
  - an `aura` layer plus legendary-place candidates.
- **M1.4 World map UI:** renderer, layer toggles, inspector, legend and minimap. Generation runs in a worker with progress.
- **M1.5 Naming:** ranges, rivers, forests and seas.
- **Done when:**
  - 5 seeds give visibly different worlds;
  - rivers reach the sea or a lake;
  - climates vary meaningfully across each map;
  - resources are uneven;
  - generation meets the budget.
- **Forks:** the default continent count. The default is a few landmasses plus a params field.

### Phase 2 — Peoples and Legends (6–8 PRs)
- **M2.1 Races and cultures (content):**
  - 2–3 races (section 5.4), including the balance check.
  - 3–4 human cultures, each with:
    - values/ethics weights;
    - marriage and inheritance customs;
    - government default;
    - attitude to magic;
    - religion tag, naming and building style.
  - **Fork:** propose race and culture sketches to the user first.
- **M2.2 Attributes and inheritance:** a real `rollAttributes` (section 5.3) and skills content for the basics.
- **M2.3 Civ placement and sites:** hamlet, town, city, fortress, mine and temple, with population by race/culture/age band, resources and wealth.
- **M2.4 Yearly history loop:**
  - demographics: births, deaths, ageing by age band;
  - famine and plague years driven by climate and resources;
  - migration between sites;
  - expansion and new sites;
  - beasts raiding and being slain;
  - **thin** trade and **thin** wars (grievance plus opportunity), with conquest, razing and ruins.
- **M2.5 Notables and families:**
  - leaders, founders, heroes, crafters, villains and rare mages, with family trees and dynasties, marriages, children, deeds, deaths and killers;
  - relationships between notables;
  - succession by culture;
  - artifacts and books created, inherited, lost and stolen;
  - magical bloodlines through inheritance.
- **M2.6 Notability and templates:** importance scoring, historian templates and biography assembly.
- **M2.7 Legends browser and timeline.**
- **Done when:**
  - 3 seeds each reveal several interlinked stories in 10 minutes of browsing, for example a famine leading to migration and a new town, or a feud between dynasties leading to war;
  - race shares stay balanced;
  - 250 years meets the budget.

### Phase 3 — Live site: Milestone A, the first playable (10–14 PRs)
- **M3.1 Embark and site generation:** choose an existing site or found an outpost. Generate the local map from the cell: terrain, river, trees, stone, ore, soil, and the existing layout. Promote residents through LOD.
- **M3.2 Daily life core:** the daily schedule (sleep, meals, work, leisure, socialising); needs (food, water, rest, warmth/shelter, safety, companionship, purpose); mood and memories; stress and breakdowns.
- **M3.3 Work, skills and steward AI:**
  - jobs gated by attributes and skills, with learning by doing and teaching;
  - a steward AI, run by the leader's priorities, decides building and staffing;
  - buildings, stockpiles and homes;
  - A* movement.
- **M3.4 Environment and stressors:** seasons and day length, temperature and exposure, weather events from the cell's climate, crops and harvest failure, spoilage, fire, local depletion, wild animals.
- **M3.5 Health:** hunger, thirst, exhaustion, injuries and healing, contagious disease, chronic illness, old age, healers and herbs.
- **M3.6 Family and relationships:**
  - opinions from interactions; friends, rivals, lovers, enemies; grudges, revenge, forgiveness;
  - courtship, marriage by culture, childbirth, children growing up, households;
  - death leading to grief, inheritance, widowhood and orphans/guardianship.
- **M3.7 Society:** status and wealth, thin crime and punishment by culture, festivals and funerals, thin religion.
- **M3.8 Threats:**
  - wildlife, beasts and monsters from legends, and raiders from real hostile civs;
  - combat in which attributes, skill, equipment, numbers and fatigue matter, under R-24;
  - militia, walls and looting.
- **M3.9 Light magic and lore:** common cantrips taught by parents or a hedge-witch, gifted residents visible in the inspector, books as items.
- **M3.10 Thin politics and trade:** a leader and succession by culture rule; a periodic caravan.
- **M3.11 Chronicle, recaps and inspector:** the full person/household inspector of section 8, filters and "why?" links.
- **M3.12 Time and saves:** speeds, "run until notable", auto-pause preferences, IndexedDB save/load and autosave.
- **M3.13 Switch over:** `?next` becomes the default page; delete the legacy code and tests.
- **Done when (Milestone A check-in):**
  - 3 random seeds, about 20 minutes each, each show:
    - a family or relationship story (marriage, birth, feud or revenge);
    - an environmental hardship (harsh winter, drought, fire or crop failure);
    - a health crisis (illness or injury);
    - an outside threat;
    - a personal breakdown or grief reaction;
  - each has cause links;
  - performance meets the budget;
  - the phone can view and read.
- **Forks:** local map size, glyph style, default auto-pause categories.

### Phase 4 — The world keeps moving (8–11 PRs)
- **M4.0 Site life fixes** (added 2026-10-14, build order 2): fishers join the staggered starts; jobless adults get staggered household chores outside sowing and harvest; the chronicle's spoilage line and the Site tab agree (729 against 214 meals at S1 Ashabum); child deaths match history's share; a cause for test towns hungry at day 60 (5 of 9 after #98, 3 of 9 before) and for the orc share falling 8.6% to 6.6% after roaming beasts; same-block work starts at the 60% target (66% now); "Next notable" no longer stops on the year recap; back lanes that bend with the ground if time allows.
- **M4.1:** the world tier runs **monthly** during play (M4.1–M4.3 are build order 15).
- **M4.2 World → site:** refugees and migrants from real troubled sites, caravans with real goods, raids from civs with real grievances, visiting notables and travellers, and "news from afar".
- **M4.3 Site → world:** population, wealth, deeds and new notables update the site's world record and appear in legends.
- **M4.4 Politics and trade (medium):** allegiance, tribute and taxes, conscription in war, civ decisions affecting the site, routes and scarcity-driven prices. **Trade between peoples in history** (added 2026-10-14, build order 14): cross-border trade is almost absent today, so caravans travel the routes between realms, a port city on a busy route grows rich and famous, an embargo is a cause of war, and a plundered caravan is a grievance.
- **M4.5 Life deepening:** multi-generation feuds, inheritance disputes, customs and cultural drift, marriages between families from different sites, exile.
- **M4.6 Story threads** (build order 11): a derived view of unresolved situations, mentioned in recaps.
- **M4.7 Perilous places, hoards and expeditions** (about 1,200 lines; added 2026-10-12; build order 12; history part built 2026-10-14, leaders also include a noble of the ruling kin and bands of commoners; the map layer and a page per place built 2026-10-17; the site hook is still to come):
  - `content/places.ts` defines ruin, barrow, lair, old mine and aura place, each with danger, hoard and lore odds; the ruins and lairs that already exist become places with no new data.
  - Hoards: great beasts and dragons gather items lost near their lair and what their raids carry off; slaying one releases the hoard to the slayers. Rulers are buried with one item by culture custom, which seeds barrows.
  - A yearly expedition step: bounties from sites with a grievance against a beast or a ruin nearby; the strongest willing figure of the civ leads a party drawn from the site's counts (legend, then exceptional mage, then hero, then captain; added 2026-10-13), so a legend can face a great beast or the dragon and claim its hoard, or die in the lair; outcomes roll against danger and party strength under R-24: death, loot, lore (a book) or fame, each a chronicled event with cause links. A commoner who returns with something becomes a notable.
  - Beast parts (scales, hide, bone, horn) from a slain creature become luxury goods or a crafted item.
  - A map layer and a Places page in the legends browser with each place's history.
  - Site hooks: a passing expedition recruits a resident (M4.2 visiting notables), who returns changed or not at all.
- **M4.8 Named battles on the map** (added 2026-10-14, build order 3): each battle takes the name of its place ("the Battle of Carrow Ford"), a crossed-swords marker on the world map and in playback, the count of the fallen and the champions who died there; Legends links battle, place and people, and the existing play-by-play sits on the battle's page.
- **M4.9 Annals of each people** (added 2026-10-14, build order 4): a page per people in the legends browser with its eras named from what happened ("the Long Peace", "the Years of the Wolf"), its rulers in order, its wars won and lost and a ten-line rise-and-fall summary, built only from recorded events.
- **M4.10 Dwarven mountain holds** (added 2026-10-14, build order 5): a hold is a settlement kind carved under the ranges that mines ore and trades it down the passes, so dwarves (3% of people after #95) reach about a tenth and become the people everyone meets at the pass.
- **M4.11 Armies and settlers move on the map** (added 2026-10-14, build order 16; Morgan, watching the Tales playback: "why does it keep spawning new armies and why is there never an opposing army visible?", and settlers should be seen moving to settle land). Why it looks like that today: the Tales room draws one flag per `battle` event (`src/app/tales/model.ts`), and a war fights one battle a year (`fightWars` in `src/engine/history/war.ts`), so each year of a war a fresh flag starts at the attacker's capital and walks to the target again; the engine keeps no army, only a strength number per campaign. The defender is never a host but the besieged town itself (its adults behind its walls), and the battle event names the enemy realm without a place its host set out from, so the map has nothing to draw for the other side. `site_founded` knows the town the settlers left (`settleParty`) but does not record it, so settlers cannot be drawn either. The fix, in one thread:
  - Engine: each war keeps a host per side with the seat it mustered at; every battle event carries both hosts' starting places (`from`, `enemyFrom`) and the war's id, and `peace_made` sends them home. `site_founded` carries the source town (`from`); migration foundings already link to it through the `migration` event.
  - Tales room: marches are keyed on the war, not the battle. One flag per side walks the roads from its seat to the first battle, on to each later battle, and home when the war ends; the two flags meet at the battle site, with the crossed swords of M4.8 and a few words. A small band of settlers walks the road from the source town in the year before a founding, "Settlers from X" beside it, and the new town appears when they arrive.
  - Calm rules hold (Four rooms, 2026-10-14): only these story events animate, at most 3 effects at once, nothing pops or jumps, and flags fade at their seat rather than vanish.
  - Built 2026-10-17: the loser of a battle falls back to its seat, and at most two wars and one settler band show at once. The engine data is named `hostFrom`/`enemyHostFrom` (cells) on battles and `from` (source town name) on `site_founded`, and settlers have their own event kind ("settlers"), which never pauses.
- **Done when:** in some seeds an event elsewhere clearly changes life at the site, and the chronicle shows the link; in some seeds a commoner finds an item in a perilous place and becomes a notable, with cause links.
- **Forks:** whether to switch the watched site in this phase (default: wait for Phase 6).

### Phase 5 — Magic depth (4–6 PRs)
- **M5.1 Schools and affinities:** full spell content per school, with stronger spells gated by Power and Affinity, all inside the R-24 caps. The school fork also decides whether to grow the flat list of six (for example shadow and making) and whether a primary affinity can shift with training.
- **M5.2 Learning lineages** (build order 9; the colleges of magic from #92 give lineages a home): apprenticeship relationships, teacher lineages, spellbooks as valuable or stealable lore, knowledge lost when teachers die or books burn. A legend takes an apprentice from the civ's Strong-or-better mages; lineages start from legends, and the apprentice carries the books when the legend dies (target story 7; added 2026-10-13).
- **M5.3 Magic in life:** healing, crops/weather-reading, crafting, defence and war. Ordinary mages are valuable specialists, not decisive alone. Only the rare legend can swing a battle, and only within the field-army ceiling. Enchanting: Strong-tier mages and master smiths make effect items from beast parts and rare ore, so knowledge loss (R-28) applies to items as well as spells. A legend makes or awakens one great item in their lifetime, or raises a **great work** (content: a tower, a wall, a bridge, a warded grove) that becomes a site feature with a map glyph and a chronicle line (added 2026-10-13).
- **M5.4 Environment:** awakening near high-aura places, legendary-place effects, race dependencies with real consequences. Magical beasts proper: great and legendary lairs prefer high aura, each such creature carries one ability from the `AbilityDef` shape inside its tier caps (a wyvern's fire, an afanc's flood, a water horse's lure), and a blighted variant appears at extreme aura.
- **M5.5 World tier: legends act** (in progress from 2026-10-14 in the "Legends as champions" thread, build order 1; expanded 2026-10-13 from "notable mages and bloodlines influence history within the caps"). A legend is their civ's **champion**: battles name them, one day of their power breaks about 1,000 soldiers and leaves them spent for a season, victory raises their fame, and a bigger host or a second legend can kill them (R-24). A non-ruler legend may lead a founding (a hall or a town, target story 5) with the `founder` title. Vengeance made visible: a notable with a sworn oath leads one raid on the killer's site. Two living legends in neighbouring civs may feud or duel (`legend_duel`). Fame by deeds: `legend_risen` gives a start, and victories, slayings and foundings add the rest. Done when every legend in most seeds has a deed beyond birth, marriage and death.
- **M5.6 Dragons and great beasts as individuals** (about 600 lines; added 2026-10-12; build order 7): a name, age, temper and hoard; settlement suppressed for some cells around the lair; a death event ranked with a legend's; the restless dead as a creature entry that a robbed barrow may wake. Dragons stay at danger 700 (R-24); up to three live at once in a 256 world, one in a 128 world (Morgan, 2026-10-14). Built 2026-10-14 (names, tempers, named lairs, tribute, burned towns, hoards and hoard-seekers); the other great beasts and the restless dead as individuals built 2026-10-17 (build order 20).
- **Forks:**
  - school names and flavour, and whether to extend the flat list of six;
  - whether casting has a price (default mild fatigue).
- **Done when:**
  - in some seeds a rare mage or a lost book changes events;
  - every legend in most seeds has a deed beyond birth, marriage and death (M5.5);
  - most people stay non-magical;
  - no race dominates;
  - the scale-ceiling check passes.

### Phase 6 — Kingdoms (6–8 PRs)
- Governments (chiefdom, monarchy, council, theocracy), nobles and titles, legitimacy, factions and succession disputes.
- **Succession wars and dynasties** (pulled forward 2026-10-14, build order 6): a disputed succession can become a civil war; a pretender raises part of the realm, the realm may split in two or a far town break away as a free city, and a dynasty can end with a new house taking the seat. Dynasties get names and a family tree in the legends browser. Built 2026-10-14; the family tree of each house is on its People room page (#124, 2026-10-17). Rules in `content/realms.ts` (`CIVIL_WARS`), engine in `engine/history/civil-war.ts`.
- Diplomacy, alliances, vassalage, marriages between houses, betrayals (build order 13, added 2026-10-14: a sworn alliance binds a people to join a war, a lost war can make a people a vassal, a marriage between houses can end a feud, and a betrayal comes when the allies' values drift apart). Built 2026-10-17: rules in `content/diplomacy.ts`, engine in `engine/history/diplomacy.ts`.
- Armies, battles and sieges; occupations and rebellions.
- **Legends in politics** (court intrigue, pulled forward 2026-10-14, build order 10; assassination is a notable's deed with cause links back to the grudge): kingdoms court, fear, bribe or try to assassinate the 0–3 living legends. A legend can be a ruler, an ally or a deterrent, but a coalition or a larger host can still bring one down. A legend may seize a seat (a succession dispute won by power, not fame), betray their ruler, or draw a bounty and a coalition against the civ that shelters them (target story 7; added 2026-10-13). Their deaths are world-shaking events. The same applies to the dragon (M5.6): kingdoms court it, fear it or put a bounty on it. Built 2026-10-16: rules in `content/intrigue.ts`, engine in `engine/history/intrigue.ts`; the dragon part built 2026-10-17 (build order 17).
- Deep trade, roads and inequality.
- Switching the watched site, plus 2–3 detailed sites at once if performance allows.
- A 512×512 world option.
- **Done when:** over a long run, borders shift, kingdoms rise, split or fall, and the site's fate is tied to them.

### Phase 7 — Institutions and magical society (5–8 PRs)
- Guilds, temples, orders and academies as content. A legend may found an order or academy that outlives them and keeps or loses their lore (added 2026-10-13).
- Recruiting the gifted, training, hoarding or sharing lore, institutional politics.
- Society's attitude to magic (revered, regulated or persecuted) from culture values.
- Religion deepening. **Gods, priests and holy wars** (pulled forward 2026-10-14, build order 8): each culture gets a god or pantheon drawn from its values, temples at its sites and a prophet or high priest as a notable; schisms, conversion after conquest, and holy wars between peoples whose gods disagree, beside the culture-values rules from #93.
- **Fork:** propose an institutions brief first (religion's pulled-forward thread needs only its own short spec).

### Phase 8 — Hybrid modes (5–8 PRs)
- Commands go through the existing queue and are recorded.
- **Steward mode:** override steward-AI categories for a settlement or institution.
- **Follow-a-character mode:**
  - choose a protagonist;
  - pick among the options their AI would consider for life decisions (marriage, work, learning, moving, feuds);
  - occasionally the option set widens (the folded-in Spotlight).
  - No protection (R-20).
- The order of Phases 7 and 8 can be swapped at the Phase 6 check-in.

### Phase 9+ — Expansion and polish
- Illustrated Minimal art pass, world-gen sliders, more races and cultures.
- Z-levels as a decision gate, starting with a caves prototype.
- Optional LLM narrator (needs a backend decision).
- Save slots, legends export, accessibility and phone polish.
- Possibly a beta save-compatibility lock.

### Phase summary (copy into `docs/ROADMAP.md`)

| Phase | Name | Size | Key output |
| --- | --- | --- | --- |
| 0 | Reset and skeleton | 2–3 PRs | New docs, slim CI, engine core, person record, `?next` |
| 1 | World generation | 6–7 PRs | Topography, seasonal climate, rivers, biomes, resources, aura, fertility and wildness, world map, names, passes and harbours, routes |
| 2 | Legends | 6–8 PRs | Races, cultures, inheritance, sites, demographics, families/dynasties, history, legends browser |
| 3 | Live site (**Milestone A**) | 10–14 PRs | Full everyday life thinly: needs, mood, health, environment, family, relationships, work, threats, light magic; saves |
| 4 | Living world | 8–11 PRs | Site life fixes, monthly world during play, world↔site links, medium politics/trade, trade between peoples, deeper life, perilous places and expeditions, named battles, annals of each people, dwarven holds |
| 5 | Magic depth | 5–7 PRs | Schools, lineages, books, magic in life and war, enchanting, magical beasts, race dependencies, dragons as individuals |
| 6 | Kingdoms | 6–8 PRs | Governments, succession wars and dynasties, diplomacy, court intrigue, armies, deep trade, multiple sites, bigger worlds |
| 7 | Institutions | 5–8 PRs | Guilds, temples, orders, gods and holy wars, attitudes to magic |
| 8 | Hybrid modes | 5–8 PRs | Steward mode, follow-a-character mode |
| 9+ | Expansion | ongoing | Art, sliders, races, z-levels, narrator |

### 9A. Extra guidance and pitfalls per phase

- **Phase 0:**
  - Do not port old sim modules into the new core "to save time". Their versioned contracts are exactly what is being removed.
  - Do not delete the old app before M3.13. (Revised 2026-10-12: it goes at Phase 2 close instead; see `docs/phases/PHASE_2.md`.)
  - Keep the new docs short. If a doc runs over two pages, cut it.
- **Phase 1:**
  - Interesting geography beats realistic geography. Aim for:
    - visible mountain chains;
    - rivers that branch;
    - at least one desert or tundra and one lush region on medium maps;
    - deposits that cluster, for example iron in some hills but not all.
  - Make a few rare resources (gems, magical reagents) genuinely rare, so they cause competition later.
  - The worker must not block the UI.
  - **Pitfalls:** noise that gives blobby uniform terrain; rivers that run uphill or end in the middle of land; float math that differs between browsers.
- **Phase 2:**
  - **History defaults:**
    - a yearly step;
    - each site's population grows toward carrying capacity (food from biome and resources) at about 1–3% per year when conditions are good;
    - famine when climate draws a bad year and stores are low;
    - plague with roughly 1–3% chance per decade per region, spreading along trade links;
    - expansion when a site exceeds about 80% of capacity and good land is near;
    - war when grievance (from raids, border disputes and insults between notables) plus opportunity (strength ratio) passes a threshold;
    - beasts spawn in wild high-danger cells and raid nearby sites.
  - Notables are created when someone does something notable (founding, leading, slaying, winning a war, being a strong mage), plus the leaders and heirs of every civ.
  - **Pitfalls:**
    - every civ grows identically;
    - wars every year;
    - no ruins;
    - notables without families;
    - legends lists that are long but unlinked.
  - Check that the drama check shows variety.
- **Phase 3:** this is the most important phase. Build it as **vertical slices**: each milestone must leave the site watchable and must add chronicle lines.
  - Order matters. The daily life core and work come first, then environment and health, then family and relationships, then threats. Life must work before danger is layered on.
  - **Pitfalls:**
    - people who never visibly sleep, eat or socialise;
    - pathfinding that eats the frame budget;
    - relationships that never cause actions;
    - every winter killing half the population, or no winter ever mattering;
    - a chronicle flooded with trivial lines (use importance thresholds and filters);
    - an inspector that shows numbers without reasons. Show "why", for example "Hungry (no meal for 2 days), Grieving (wife Mira died 12 days ago)".
- **Phase 4:**
  - **Pitfalls:**
    - world events that never reach the site;
    - migrants with no history;
    - news that is not tied to real world events;
    - the world tier slowing live play (it runs monthly, in the worker).
- **Phase 5:**
  - Magic must change *life*: healing saves a child, weather-reading saves a harvest, a lost book means a later epidemic is deadlier.
  - **Pitfalls:**
    - magic everywhere;
    - magic as pure combat damage;
    - mages beating armies, other than a legend matching at most one low-end field army;
    - more than 3 legends alive at once;
    - races with no real downside in play.
- **Phase 6:**
  - **Pitfalls:**
    - borders that never move;
    - wars with no causes;
    - succession that never gets disputed;
    - the watched site disconnected from kingdom politics.
- **Phases 7–8:** propose design briefs first. Never let player control bypass the simulation. Commands are requests that people may fail or refuse.

---

## 10. Drama at every scale (without forcing it)

- A system is done only when its outcomes have templates and importance scores.
- **Notability:** `importance = base(type) + fame(actors) + scale(deaths, wealth, territory) + novelty`. It feeds "run until notable", auto-pause, recaps and the legends front page.
- **Drama check** (`npm run drama -- --seeds 5 --years 3`, a tool, not a gate) reports, per seed and tier:
  - notable events per year;
  - distribution across life domains and drama sources;
  - the longest cause chains;
  - race population and power share;
  - the aptitude distribution actually produced;
  - the count of Legendary and Exceptional individuals alive over time;
  - the strongest individual's combat value against the tier-equivalence table.
- **Target:** something notable roughly every 1–3 in-game months at the site and every few years per civ, varying by seed.
- **Tune with content weights,** never with scripts that guarantee outcomes.

## 11. Testing (lightweight)

- **Unit tests** with tiny fixtures for river flow, biome table, `rollAttributes` distributions, skill gating, need decay, disease spread, combat math under the R-24 caps, succession and inheritance, and the LOD round-trip.
- **One determinism test**, including save → load → continue.
- **Invariant checker** in tests and dev builds: no negative stocks, references resolve, the dead stay dead, counts match records, family links are symmetric.
- **Seed smoke in CI:** 5 seeds through world-gen, history and 1 live year, in under 60 s.
- **One Playwright smoke** on Chromium: generate → legends → embark → play → save → reload → continue.
- **CI:** format, typecheck, boundaries, unit, seed smoke, build and Playwright smoke, in under 5 minutes. Remove the batteries, partitions and Python probes.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Scope creep per system | A thin version is at most one PR; deepening needs a phase listing |
| Life domains built in isolation | Each phase spec names cross-domain links; the drama check shows cause chains |
| Float drift breaks determinism | Safe-math rule; determinism test in Node and the browser |
| History too slow | Yearly cadence, age-band counts, notables capped (about 3,000 living), worker |
| Site too slow | A* budget and cache, sampled social interactions, profile at M3.3 |
| Save growth | Trivial-event rollups, `CompressionStream` |
| LOD inconsistency | Round-trip test; notables never fold away; invariant checker |
| A magic-strong race dominates | Race-balance validation; drama-check race shares |
| An individual exceeds the scale ceiling, or legends become common | Per-tier effect caps in validation; tier-equivalence combat tests; world-tier legend cap (at most 3); drama-check legend counts |
| Too little or monotonous drama | Novelty bonus, weight tuning at each check-in |
| Old app breaks mid-transition | `?next` until M3.13 |
| Heavy process creeps back | Anti-goals and doc budget |

## 13. Deferred decisions (ask when the phase arrives)

- Race and culture sketches (Phase 2).
- Local map size, glyph style, auto-pause defaults (Phase 3).
- Switching the watched site (Phase 4 or 6).
- Magic school flavour, whether to extend the flat list of six schools, and the casting-cost fork (Phase 5).
- The institutions brief (Phase 7).
- The order of Phases 7 and 8 (Phase 6 check-in).
- Z-levels, the LLM narrator, more races, sliders, a beta save lock (Phase 9+).
