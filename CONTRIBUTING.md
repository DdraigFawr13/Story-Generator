# Repository workflow

## Branches and commits

- `main` is the only permanent development branch at this stage.
- Use scoped branch names like `feat/seeded-simulation`, `fix/event-causality`, `docs/chronicle-spec`.
- One logical change per pull request, ideally small enough to test and review.
- Squash merges are preferred when PRs have exploratory commits.
- Never overwrite unrelated changes or delete an active branch without explicit authorization.
- Merged same-repository PR branches should be deleted by the branch-cleanup GitHub Action, subject to repository Actions/token permissions.

## Roadmap and requirements

- Consult [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for ordered tasks, phase dependencies, tests and exit gates before starting code.
- Design/visual approval and implementation approval are separate. Do not introduce code or speculative systems before the Phase 0 gate.
- New ideas belong in the decision register and must distinguish **approved**, **proposed** and **parked** scope. Deferred spectator nudges must not acquire an implementation milestone by implication.

## Engineering requirements

- Simulation code stays independent from UI.
- Deterministic seeds, explicit simulation version, persistent IDs, and reproducible event streams.
- Model-driven histories: chronicle prose must not invent new facts.
- Add regression tests for every simulation rule change; run stress tests for long histories.
- Confirm deployed previews only at meaningful milestones, not every internal commit.

## Source code vs assets

- Preserve source licenses and provenance for third-party assets.
- Avoid committing generated or temporary build artifacts.
- Keep art style and simulation mechanics documented separately.
- Do not add service API keys or paid AI generation as runtime prerequisites.


## Tool awareness

- Consult [docs/TOOLING_CAPABILITIES.md](docs/TOOLING_CAPABILITIES.md) when selecting tools; it records exposed connectors, skills and possible uses, including those not currently needed.
- Recheck current availability, applicable skill instructions and project authorization before using an integration. A listed tool is not a runtime dependency or proof of connected-account access.
- Prefer direct existing tools and focused independent reviews; do not install integrations or add hosted services without a concrete project need.
