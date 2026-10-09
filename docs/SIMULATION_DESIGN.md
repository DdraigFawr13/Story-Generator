# Simulation and chronicle architecture (proposal v0.1)

## Principle: authoritative world state

Narrative entries must be projections of actual state-changing events. The text-generation layer cannot decide that a king died, a town burned, or a treaty was signed without the corresponding simulation transition.

### Proposed vertical-slice modules

- `seeded-rng`: deterministic PRNG, named independent streams for terrain/population/incidents.
- `world-gen`: seeded terrain, water, forests, fertility and starting resources.
- `clock`: discrete ticks; day/season/year; deterministic ordered phase updates.
- `entities`: settlements, buildings, residents (small sample first), food stores, families, factions later.
- `systems`: resource production/consumption, demographic changes, settlement growth, weather, simple disease and conflict triggers.
- `event-core`: evaluate preconditions from state and RNG, apply effects, emit structured events and causal links.
- `chronicle`: compact and detailed text templates from events; severity tiers; filtering and search.
- `renderer`: separate top-down pixel canvas; interpolation allowed, but display randomness never changes simulation state.
- `save-replay`: seed, version, config, snapshots, append-only canonical events.

## Representative record

```json
{
  "id": "evt-000271",
  "tick": 271,
  "type": "food_shortage",
  "importance": "major",
  "actors": ["settlement-riverside"],
  "place": "settlement-riverside",
  "causes": ["evt-000214", "evt-000260"],
  "facts": {
    "foodBefore": 3,
    "population": 42,
    "shortfall": 9
  },
  "effects": [
    { "entity": "settlement-riverside", "path": "food", "delta": -3 },
    { "entity": "settlement-riverside", "path": "unrest", "delta": 2 }
  ]
}
```

This is a schema example. Exact fields and rules must be reviewed before implementation. Text such as "Harvest failures leave Riverside short of grain" is a view over the facts, not the authoritative event.

## The event process

1. Systems read state and calculate predictable needs, production, mobility, health, and constraints.
2. A small RNG contribution supplies uncertainty (rainfall variance, personal risk tolerance, disease exposure) within state-based rules.
3. Eligible incidents compete using weighted hazards; all require preconditions, actors, and eligible effects.
4. Effects atomically update state; the structured event records what changed, where, when, and why.
5. Downstream systems encounter changed state in future ticks (e.g., shortages raise unrest, weaken health, reduce migration costs).
6. Chronicle renderer emits headline, short narrative and optionally historical interpretation.
7. UI renders new buildings/ruins/borders/people from state; event clicks focus relevant coordinates.

## Where complexity emerges

Build **interacting mechanics** rather than hundreds of isolated event snippets:

| System | Feeds into | Emergent stories |
| --- | --- | --- |
| Terrain, fertility, weather | Food, wealth, location | Drought → trade dependence → abandoned villages |
| Births, deaths, families | Workforce, inheritance, loyalty | Succession disputes, family feuds |
| Resources, labor, trade | Growth, inequality, politics | Merchant dynasties, guild uprisings |
| Beliefs, institutions, laws | Cohesion, legitimacy, conflict | Schisms, persecution, reform |
| Migration, territory, diplomacy | Cultures, settlements, wars | Exile-founded cities, refugee-led states |
| Knowledge and technology | Production, defense, culture | Disruptive discoveries, lost techniques |
| Disease, fire and disasters | Health, infrastructure, morale | Depopulation, rebuilding, memorial cults |

**Example interacting chain, not a hardcoded quest:** dry season → poor harvest → storehouse drawdown → rationing → public discontent → disputed leadership → families emigrate → successor settlement begins trading with parent → two evolving cultures.

## Dwarf Fortress-like memory

- Characters retain relationships, affiliations and a bounded set of memories.
- Settlements remember founders, past catastrophes, laws, ruling lineages and old territorial claims.
- Objects/places acquire provenance: a mill rebuilt after a fire, a battle site, an heirloom sword.
- Important actors may die, but their actions remain in state and history.
- Intergenerational consequences should be inspectable without storing every mundane action forever.

## Optional future extension seam (planning only)

The eventual event pipeline should be responsible for validating and applying any state-changing command, whatever its source. This leaves open the future possibility of constrained **observer nudges** as explicitly tagged, rule-valid external interventions. **There is no nudge API, action, UI, feature flag or implementation requirement in the current milestones.** Observational interactions such as selecting a resident or following a town must have no side effects on the simulation or RNG. Do not optimize for hypothetical future interventions at the expense of Phase 1 simplicity.

## Performance and determinism

- Simulation at fixed ticks independent of frame rendering.
- No `Math.random()` or wall-clock time in the simulation core.
- Deterministic iteration order; dedicated RNG streams prevent UI animation from perturbing history.
- In the future use worker-based simulation and coarse-grained world entities; only nearby/selected areas get fine detail.
- Snapshot/restore to support saves and timeline seeking; explicit simulation schema versions for old seed compatibility.
- Caps and backpressure for long-running simulations (headlines + compressed detail over centuries).

## Story quality without predetermined plots

Event selection should be influenced by actual state, relationships and unresolved consequences. A narrative-priority layer can choose **which true events to surface**, not fabricate outcomes. The log should label concrete consequences and avoid non-events.

## Quality gates

1. Same seed/config/version → same state digest and canonical event stream after N ticks.
2. Different seeds show meaningfully different outcomes in long-run sampled batches.
3. Every logged event corresponds to state change or fact recorded in the simulation.
4. No negative population, resources, or broken references after thousands of steps.
5. Population decline, recovery and extinction are possible, not forced on a timer.
6. Pausing/speed changes do not change outcomes for the same number of ticks.
7. Save/load then resume matches an uninterrupted run (when implemented).

## Recommended technical direction (not yet locked)

Browser-first TypeScript engine independent of UI; Vite for development; canvas/PixiJS for pixel visuals when entity counts warrant it; responsive interface; no mandatory backend for single-player local simulation. This integrates well with GitHub + later Vercel preview workflows. Engine can be tested headlessly in Node without rendering.
