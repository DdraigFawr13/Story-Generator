# Implementation plan — milestone contracts (v1.1)

**Current status:** Phase 1 engineering authorized under D-020 on 2026-10-09, after the user requested merging PR #10 and continuing to the next phase. The earlier documentation-only scaffolding restriction is superseded. The first core/terrain/founding slice is implemented; remaining balance, selected-art and storage reviews are carried into first-playable acceptance rather than marked complete. See [PHASE1_FOUNDATIONS.md](PHASE1_FOUNDATIONS.md).

## Approved core constraints

- **Destination:** an observable, open-ended pixel world with personal-to-civilizational histories; **first playable** is one detailed settlement.
- **World tone:** middle fantasy: grounded causal societies plus bounded, consequential magic; support other intensity profiles *later*, without implementing profile toggles now.
- **Viewer:** observational world with an explicit **Story Spotlight** opportunity-expansion direction beginning gradually in Phase 2; deliberate spotlight may widen context-valid possibilities but must never force a choice or outcome. Mere selection, camera movement and passive bookmarks must not alter the world. Distinct manual observer "nudges" remain **parked**. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md).
- **Narrative:** state transitions make history. Chronicle prose reports facts; events are never arbitrarily invented by the UI or a language model.
- **Runs:** deterministic within version + seed + settings (plus ordered authoritative commands from Phase 2 onward), saveable and explainable; societies may thrive, transform, or fail organically, never on a forced countdown.
- **Delivery:** browser-first, responsive desktop/mobile experience. Simulation engine does not depend on rendering or any hosted service. Stack choices are accepted in ADR-001–003 (D-013); exact compatible versions will be pinned at approved scaffolding.
- **Viewing pace and continuity:** normal speed targets roughly 10–15 minutes/year; seasons and winter preparation materially affect the economy. Pause while closed/backgrounded, discard scheduling debt and return paused without catch-up. Desktop-led review retains full phone usability and the approved map-above-chronicle arrangement. See [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) and D-015–019.

## Cross-phase engineering rules

1. Every mechanics change specifies state inputs, update order, preconditions, RNG use, effects, and emitted event(s).
2. Maintain persistent IDs and versioned save/event schemas. No unexplained retroactive changes in prior chronology.
3. All authoritative simulations use an injected seeded PRNG and fixed ticks; UI animations and time controls cannot alter outcomes.
4. Events record entity IDs, location, cause references or causal facts, state deltas, and visibility/importance. UI must never invent events.
5. Simulated behavior has an inspectable reason chain; rare event rates can be tuned but should not secretly force desired plots.
6. Log/highlight accessibility, mobile readability, simulation speed, memory, and determinism are release criteria, not post-launch extras.
7. Each milestone closes with tests, a qualitative story review across multiple seeds, doc updates, a scoped PR, and branch cleanup.
8. Work in small independently mergeable PRs. Do not create speculative multi-phase branches or merge failing changes.
9. **No scheduled, automatic or manual Vercel deployments at every commit:** preview at demonstrable visual milestones only.
10. Integration test evidence should link to actual commands/results when engineering begins; documentation alone is not a tested application.

## Dependency map

`P0 design gate -> P1 living settlement -> P2 agents/memory -> P3 institutions/fantasy mechanism -> P4 regional multi-settlement -> P5 historian tools -> P6 depth/scaling`.

Cross-cutting tests and documentation advance with each phase. Basic local save/resume ships in P1; P5 adds archive management and timeline seeking. Both depend on the versioned state, RNG and event contracts established in P1. P4 needs aggregation that does not make the history dependent on which area the viewer has selected.

---

## Phase 0 — Pre-build specification and foundations (review evidence carried forward)

**Outcome:** A decision-ready brief, implementation slices, art target, and architecture rules, without adding a runnable game.

### Ordered work

- [x] 0.1 Confirm product vision: living world / village-first, simulation-driven chronicle, open-ended histories.
- [x] 0.2 Decide setting baseline: **middle fantasy**; varying intensity profiles are future work.
- [x] 0.3 Set viewer baseline: passive observer; possible small nudges are **deferred**.
- [x] 0.4 Map core subsystems, seeded-world contract, canonical event model, story-quality principles.
- [x] 0.5 Break P1–P6 into ordered engineering increments with deliverables, tests and exit gates (this document).
- [ ] 0.6 Direction C layout, Illustrated Minimal treatment and phone information hierarchy are selected. Recover the selected visual references, then verify source density, actual-size scale/contrast and desktop/phone interaction (see [ART_STYLE_REFERENCE.md](ART_STYLE_REFERENCE.md), [ART_UI_SPEC.md](ART_UI_SPEC.md) and [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)). Art comparison is complete; visual validation remains open.
- [x] 0.7 **Architecture accepted on 2026-10-09 (D-013)** in [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md) (TypeScript core, Vite/React, Canvas 2D, testing and persistence seams). Accepted [ADR-001–003](adr/README.md) specify build/core, rendering/controller and persistence/verification choices. Exact compatible dependency versions will be pinned at approved scaffolding.
- [ ] 0.8 Review the concrete [settlement rules](SETTLEMENT_RULES.md) and [local persistence contract](LOCAL_PERSISTENCE_CONTRACT.md) against [PLAN_REVIEW.md](PLAN_REVIEW.md): adjustable numeric constants, aggregate population/households, workforce and material sourcing, construction priorities, demographic order, extinction behavior, RNG/rounding rules, event retention and storage limits. Each rule must specify inputs, units, preconditions, update order, RNG use, costs/effects, events and invariants; constants alone do not close this gate.
- [x] 0.9 Scope-ordered engineering backlog is recorded in [CONTINUATION_REVIEW.md](CONTINUATION_REVIEW.md); D-020 authorizes starting its foundation slices.

**Authorization and evidence:** D-020 permits Phase 1 to start. Direction C and architecture are approved; 0.6 visual evidence and 0.8 balance/storage review remain open. Authorization does not turn missing evidence into a passed gate. Use explicit versioned implementation baselines and retain these reviews before accepting the first playable.

**Risk:** expanding planned content before the small deterministic test-bed works. **Mitigation:** limit P1 to one settlement and a few meaningful resource chains.

---

## Phase 1 — First playable: the living settlement (CURRENT)

**Outcome:** seeded pixel terrain, one evolving settlement, seasonal resource cycle, authentic real-time chronicle. This must already be engaging to *watch*.

### 1A — Project and deterministic engine
- [x] 1.1 Initialize browser project, formatting, strict typecheck and boundary/static checks, unit test runner, CI (typecheck/tests/build), private/unlicensed source and asset provenance policy.
- [x] 1.2 Separate pure simulation state from UI/controller/adapters; define foundation version, seed, versioned constants, clock/ticks and stable founding entity IDs.
- [x] 1.3 Implement reproducible named RNG streams with explicit serialized integer states, independent golden vectors and rejection-sampling checks. Founding draw order is fixed; future weekly phase order follows the settlement contract and still needs implementation.
- [ ] 1.4 Provide headless `advanceTicks(seed, config, N)` and canonical state/event digest for regression tests. Define stable entity ordering, tie-breaking, integer/fixed-point units and rounding, stream derivation, and canonical serialization excluding view state. Test Node/browser digest equivalence.

1.4 is partial: canonical encoding and a generic reducer-injected `advanceTicks(initial, N, reducer)` implement immutable complete-tick admission. Founding and 100 terrain fixtures are compared across Node/browser. A running settlement reducer, seed/config convenience runner and long-run state/event digests remain 1C work; fixture-reducer continuity is not a village simulation.

### 1B — Geography and starting society
- [x] 1.5 Generate a seeded 64x40 logical tile map with elevation, connected river, terrain, forest, fertility and valid settlement start area; match the independent Python fixtures and preserve water during forced fallback.
- [x] 1.6 Spawn aggregate founders (24 residents, six households), food/timber stocks, six huts, two fields and one store, stable occupancy/IDs and a deterministic coordinate-based settlement name. Clearing is recorded and discarded, not free stored timber. Individual identities/life histories remain P2.
- [ ] 1.7 Define inspectable settlement state: population, household count, capacity, food, production, structures, current season.

1.7 is partial: the founding map, resource/capacity/building facts and keyboard tile inspector are runnable. Production rates and live season changes await 1C. Temporary programmatic drawings are not selected-art completion.

### 1C — State-changing simulation loops
- [ ] 1.8 Advance fixed seasons; weather/fertility adjust harvest production. Every consumed or produced unit is balanced and bounded.
- [ ] 1.9 Consume food per population; shortages reduce health/growth and may generate aggregate departure/death conditions rather than automatic demise. If departures are included, define their resource/population accounting; destinations, travel and new settlements remain P4.
- [ ] 1.10 Add population birth/death aggregate rules initially; growth bounded by food and housing; handle zero-population worlds.
- [ ] 1.11 Add deterministic construction/removal of huts, fields, stores and visual decay based on actual labor/material constraints.
- [ ] 1.12 Allow improvement, stagnation, recovery, or natural collapse, with no guaranteed dramatic timeline.

### 1D — Canonical events and chronicle
- [ ] 1.13 Introduce events with tick, type, actor/place IDs, causes, facts, state effects and importance.
- [ ] 1.14 Publish founding, harvest/surplus/shortage, construction/decay and demographic changes only when the corresponding state/fact actually occurs.
- [ ] 1.15 Text renderer chooses headline/details from immutable canonical facts. Show causal context (e.g. drought and low stores).
- [ ] 1.16 Separate a bounded live-headline window from the canonical archive persisted with local saves. Set explicit archive/storage limits in 0.8; never silently evict causal evidence or imply unlimited history. At a supported limit, pause advancing and explain the limit while preserving the last valid save. A storage failure must not corrupt that save or claim new progress was saved.

### 1E — Pixel viewer and milestone QA
- [ ] 1.17 Draw top-down tiles, water/forest, structures, crop fields and lightweight resident markers from simulation state.
- [ ] 1.18 Support seed input/random seed, New World, pause/play, single step, 1x/4x/16x, year/season, stats and map-pan/zoom. Meet the roughly 10–15-minute/year 1x target; review the weekly-calendar scheduling proposal in ADR-002. On hidden/closed return and saved-world Resume, remain paused without elapsed-time catch-up.
- [ ] 1.19 Implement live chronicle panel; select event to focus its place and show actual changed values/causes. Provide responsive phone layout and keyboard/touch basics.
- [ ] 1.19a Add basic browser-local manual save/resume and autosave using IndexedDB, with one recoverable world slot. Save the versioned authoritative state, seed/config, tick, all RNG streams, ID allocator state and canonical archive consistently. Validate before replacing the current world; reject unsupported/corrupt saves clearly and preserve the last good transaction. Explain local-device storage and unsaved progress. No accounts/cloud sync or timeline seeking.
- [ ] 1.19b Test save/restore/resume against uninterrupted N+M ticks, including RNG/ID continuity, archive/cause integrity, reload, interrupted writes, quota/unavailable storage and unsupported versions. Verify hidden-tab pause, return-paused and no catch-up across repeated visibility changes. Define autosave cadence and archive limits in 0.8, including their wall-clock implications at normal speed; autosave must not advance ticks or consume simulation RNG.
- [ ] 1.20 Run unit/property tests of RNG, terrain and resource invariants; same-seed snapshot at 1,000 ticks; speed equivalence; 100-seed non-crash batch; manual mobile/desktop UI smoke tests.
- [ ] 1.21 Review ten seeds for visible, qualitatively different trajectories; tune rates without special-casing seed stories; demonstrate a meaningful vertical slice and merge.

**Acceptance:** same seed/settings/version yields identical state/event digest; two seeds can differ meaningfully; all visible buildings/stats/headlines agree with state; a real settlement grows or declines; zero-population and exhausted-resource edge cases do not crash. 1,000-tick deterministic execution and save/resume continuity verified; browser reload restores the saved tick and archive. **Fantasy boundary:** underlying environment may include reserved semantic types, but no decorative magical "events" without mechanics.

**Avoid:** pathfinding tens of thousands of people, multiple nations, AI-written lore, paid runtime services or branching quest logic.

---

## Phase 2 — Individuals, families, memory and consequences

**Outcome:** the first genuine personal stories, causally connected to settlement conditions.

### Ordered increments
- [ ] 2.1 Replace/augment population totals with a bounded agent population; define age, life stage, health, needs, profession, location, household and relationships; aggregate where practical.
- [ ] 2.2 Deterministically generate names, traits/temperaments and kinship; ensure uniqueness of IDs, stable relation references and coherent lifespans.
- [ ] 2.3 Simulate activities with costs/opportunity constraints: farming, construction, repairs, caretaking, gathering, travel.
- [ ] 2.4 Model household food allocation, scarcity, injuries, sickness and death; explain *which* state drove the result.
- [ ] 2.5 Add births, marriage/partnership, inheritance/guardianship where appropriate, and family succession over generations.
- [ ] 2.6 Create limited social memory: favors, grudges, loyalty, attachments, prior disputes; define decay/retention rules and political/migration influence.
- [ ] 2.7 Implement state-grounded decisions to stay, leave, cooperate, retaliate or reconcile; no arbitrary scripted character arcs.
- [ ] 2.8 Capture biography-worthy events with structured actor/cause/effect links; per-person/family timelines, relationship views, passive bookmarks and separately identified **Story Spotlight** activation/deactivation with tick-stamped history.
- [ ] 2.8a Implement a **bounded variety of additional context-eligible opportunity families for deliberately spotlighted people/families**, evaluated by autonomous decisions. Opportunities can be accepted, rejected, missed, or fail; they never guarantee an event, triumph, tragedy or fame. Persist active Spotlights, ordered commands and replay cursor in local saves. Define command ordering at tick boundaries, including multiple commands on the same tick. Same seed/config/version **plus spotlight command log** replays identically. See [SPOTLIGHT_OPPORTUNITIES.md](SPOTLIGHT_OPPORTUNITIES.md).
- [ ] 2.9 Add chronicle filters by person, family, category, importance; include "what led to this?" trace where records exist.
- [ ] 2.10 Long-run tests: generations, orphan handling, relation integrity, name/ID stability, death effects, bounded per-agent memory and 100-seed story samples. Verify save/resume equivalence across Spotlight activation/deactivation, including multiple commands at one tick.

**Acceptance:** observable relationships change future decisions; a resident can be followed birth-to-death with verifiable log; families persist across generations. Deliberate spotlight broadens **eligible opportunities** without guaranteeing acceptance/outcomes, and deterministic replay uses the full timestamped spotlight-command history. Mere inspection does not affect the sim. No unbounded memory growth.

**Scope stop:** no complex full psychological model or deep tactical combat.

---

## Phase 3 — Institutions, politics, culture and the first bounded fantasy mechanics

**Outcome:** recognizable institutions and social conflicts; one supernatural rule affects material society without dominating every run.

### Ordered increments
- [ ] 3.1 Introduce economy basics: divisible resources, roles, storage, exchange/trade rules, scarcity, production and wealth allocation.
- [ ] 3.2 Implement governance prototypes with explicit laws, offices, legitimacy, succession and council decisions; agents react to outcomes.
- [ ] 3.3 Add interest groups, reputations, disagreements, social mobility and grievances with measurable thresholds and causal event logs.
- [ ] 3.4 Model shared customs/beliefs as persistent state (not random decorative religion text); cultural changes respond to actual experience.
- [ ] 3.5 Add institutional choices: taxation, public works, resource restrictions, disputes, reform, secession pressures; outcomes alter next decisions.
- [ ] 3.6 Add knowledge/discovery progression through practical prerequisites and diffusion; inventions modify real production or safety parameters.
- [ ] 3.7 Define **one** optional middle-fantasy resource/phenomenon (e.g., a rare arcane spring): measurable location, discovery conditions, access, depletion/regrowth, benefits, hazards, and political competition.
- [ ] 3.8 Ensure supernatural effects update ordinary systems (land value, migration, health, crop output or power structures). Record consequences and costs; allow worlds with no observed phenomenon.
- [ ] 3.9 Surface political timelines and institutional history; inspect leadership changes, law history, cultural memory, supernatural discovery and its causal footprint.
- [ ] 3.9a Add **settlement-level Story Spotlight** opportunity families tied to actual economic, institutional and social conditions, with autonomous refusal/inaction/failure and bounded per-era candidate budgets.
- [ ] 3.10 Comparative tests: identical seeds with different governance setups or arcane settings yield coherent results; default middle-fantasy remains rare but real; no forced rebellions; verify rate and bounds across seeds.

**Acceptance:** institutions change incentives and subsequent choices; rulers can be succeeded, challenged or replaced; cultural memory survives individuals; a magical mechanism causally matters when it occurs; no scripted political/fantasy plots.

**Scope stop:** no spellcasting armies, dozens of species, pantheons or controllable gods yet.

---

## Phase 4 — Multiple settlements, regional simulation and historical states

**Outcome:** village-scale human stories become regional history; independent cities and civilizations interact.

### Ordered increments
- [ ] 4.1 Generate a regional/continent-scale geography with climate/resource regions and settlement-capable routes; persist seeds and map provenance.
- [ ] 4.2 Enable migration and founding of new towns when people/resources/route conditions permit; maintain ancestry and place names.
- [ ] 4.3 Introduce distance, travel time, roads, caravans, market access and trade networks; movement costs matter.
- [ ] 4.4 Add polity identity and territory, membership, treaties, borders, access disputes, tribute and alliance persistence.
- [ ] 4.5 Implement conflicts with defined motive, participants, resource costs and peace outcomes; high-level resolution first, never hidden army tactics.
- [ ] 4.6 Support splinter factions, annexation, assimilation, conquest, collapse, rebuilding and state succession, retaining ruins and historical claims.
- [ ] 4.7 Separate regional coarse updates from active settlement detail without making **historical outcomes depend on camera position**.
- [ ] 4.8 Add level-of-detail region/village map transition, map filters/overlays, route/border visualization and linked chronology by location.
- [ ] 4.8a Extend Story Spotlight opportunity families to kingdoms/factions and cross-scale relationships; retain cause/effect provenance and explicit activation/replay records.
- [ ] 4.9 Run headless 100–1000 seed samples across long histories: invariants, normalized resources, civilization diversity, border coherence, no orphaned entities, stable speed/performance.
- [ ] 4.10 Test detail equivalence: changing viewpoint, viewport resolution or selected settlement changes neither canonical state nor events.

**Acceptance:** multiple towns can emerge, exchange goods, split, fight, ally, disappear, or recover; world history is persistent, inspectable, seeded and insensitive to zoom/selection.

**Scope stop:** avoid fully detailed individual agents in every world tile.

---

## Phase 5 — Historian experience, saves and replay

**Outcome:** the world is as interesting to study as it is to watch.

### Ordered increments
- [ ] 5.1 Extend P1 save schemas and add the cross-version migration policy. From P2 onward, saves include ordered tick-stamped Spotlight commands, active Spotlight state and replay cursor as well as world state, seed/config, tick, all RNG and ID allocator state, and retained event history.
- [ ] 5.2 Extend P1 save/resume with multiple named worlds, rename/delete, archive management and richer recovery; preserve the original until migration succeeds.
- [ ] 5.3 Add deterministic checkpoints and timeline seeking by restoring a complete checkpoint and executing fixed ticks with recorded authoritative commands. Chronicle events are selected historical evidence, not a complete mutation log, and cannot reconstruct state alone. Define supported seek range and measure checkpoint storage/performance.
- [ ] 5.4 Build multi-scale timeline with periods, region filters, important events and expandable evidence.
- [ ] 5.5 Build historical dossiers for person, family, settlement, dynasty, law, artifact and conflict; stable historical hyperlinks even after death/destruction.
- [ ] 5.6 Implement causal navigation: each headline can expose directly recorded causes, precursors and changes; clearly mark when an exact causal explanation is unavailable.
- [ ] 5.7 Implement **passive bookmarks and filters** that do not mutate world state; enrich followed-subject feeds and notable-event notifications. Replays must distinguish passive inspection from recorded explicit Story Spotlight activations that broaden future eligibility; user annotations stay non-mutating.
- [ ] 5.8 Build local exports of seed+settings+version, selected biographies and historical summaries grounded in records. Reproducing an observed history also requires its ordered authoritative command log and target tick (or a compatible full snapshot); label seed-only exports as initial-world recipes. Remote sharing and illustrated documentary formats remain parked.
- [ ] 5.9 Stress test centuries of history, snapshot equivalence, backwards compatibility, event storage size, UI accessibility, cross-device responsive performance.
- [ ] 5.10 Conduct spectator UX sessions: a viewer should be able to identify a consequential arc, follow its people, and explain its causes from UI evidence.

**Acceptance:** loading and seeking preserve history; the same saved simulation resumed matches uninterrupted execution; no fabricated biographies or inaccessible events; archives remain navigable.

**Scope stop:** direct manual intervention/**nudges** are **not part of P5**. Annotation, passive following and inspection do not alter the simulation. The separately activated Story Spotlight opportunity-expansion mechanic, if approved in Phase 2's rule contracts, may alter future state and is recorded for replay.

---

## Phase 6 — Depth, balance, optimization and content expansion

**Outcome:** sustained emergent diversity without sacrificing determinism or observability.

### Ordered increments
- [ ] 6.1 Measure diversity on many seeds: migration, lifespan, polity births/deaths, cultural divergence, event coverage, persistence and recurrence.
- [ ] 6.2 Diagnose story anti-patterns: death spirals, immortal stagnation, automatic war cycles, overfiring crisis events, lore spam, causal dead ends, **spotlight always wins/dies** patterns, and lack of ordinary or dark/hopeful diversity across many seeds.
- [ ] 6.3 Add a **small prioritized content batch per PR**: biome/resource combinations, livelihoods, disease and disasters, technology, diplomacy, settlement specialization.
- [ ] 6.4 Expand middle-fantasy mechanisms cautiously: uncommon creatures/lineages, arcane resources, discoveries and institutions each with costs and societal effects.
- [ ] 6.5 Keep fantasy intensity as data configuration/profiles for future variants; **do not treat grounded/high-fantasy support as required for the initial middle-fantasy release**.
- [ ] 6.6 Optimize simulation worker/off-thread processing, spatial indexing, coarse aggregation, snapshot frequency and renderer culling based on profiling.
- [ ] 6.7 Expand pixel art and animation only for systems already implemented; modular asset naming, provenance/licensing and accessible tile contrasts.
- [ ] 6.8 Add localization-ready text keys, accessibility fixes, tooltips, input remapping and platform/browser compatibility as appropriate.
- [ ] 6.9 Establish long-duration battery with configurable seeds, property invariants, balance distribution dashboards and regression baseline snapshots.
- [ ] 6.10 Release readiness: save stability, mobile usability, benchmark budgets, error reporting/privacy review, user feedback and changelog.

**Acceptance:** a broader range of plausible histories, no critical soft locks, predictable performance/memory growth, consistent causal records and repeatable replay. Expansion is evidence-driven rather than content-volume driven.

---

## Backlog explicitly OUTSIDE the committed roadmap

### Optional spectator nudges — exploratory design only

Potential future **direct nudge** mechanic: a viewer may choose from externally proposed changes ("a wandering scholar approaches", "a storm changes course") or make small voluntary interventions. **Do not implement, prototype, add controls, assign a milestone, or create engineering dependencies for direct nudges now.** This is **different** from the approved direction for explicit Story Spotlights, which merely increases eligibility of possible agent-driven opportunities, never selects an outcome.

If reconsidered after observing unassisted histories:
1. Determine whether passive observation actually needs more engagement; define a concrete player benefit.
2. Compare *prompted* choices, *on-demand* limited nudges, and hybrid models.
3. Preserve causal honesty: effects become explicit externally sourced changes in canonical records and must still obey world rules.
4. Keep separate modes/seeds or replay flags so intervention does not contaminate unmodified-world comparability.
5. Define costs/limits/visibility and rules that avoid creating prescribed storylines or replacing genuine emergent outcomes.
6. Add no production scope until expressly approved in a future planning round.

Other future candidates: grounded/high fantasy world-profile packages, varied intelligent species, mod support, publishable historical chronicles, alternate visualization styles, open-ended scenario templates, remote seed sharing. None is promised for P1.

---

## Branch and phase-merge protocol

- Maintain `main` as sole standing branch and **only one scoped work branch per task**.
- Each PR: objective, changed state contracts, screenshots where UI changes, tests and results, docs updated, known limitations.
- Require passing CI where available; squash merge; delete merged branch. GitHub branch-cleanup workflow is backup; GitHub settings may also delete branches automatically. Verify result after each PR.
- Do not delete unmerged/foreign active branches. Never force-update main to "clean it up."
- Design approvals and implementation approvals are separate; this documentation PR only covers the plan.

## Narrative and art scope amendments

- [Narrative divergence and moral range](NARRATIVE_SPOTLIGHTS.md)
- [Story Spotlight opportunity eligibility](SPOTLIGHT_OPPORTUNITIES.md): explicit activation; may alter future outcomes, but no chosen result, mandatory plot or guaranteed event.
- [Simplified original art direction](ART_STYLE_REFERENCE.md): inspired by RimWorld's readability with slightly more artistic detail; earlier 16px/isometric-heavy art is not locked.

## First engineering PR (NOT to start yet)

After Phase 0 design/architecture approval: `feat/phase1-engine-seed-clock`: project skeleton, deterministic PRNG/tick engine, seed/config schema, state/event digest, initial tests and CI; no pixel game yet. Close it before proceeding to terrain, resources or UI.
