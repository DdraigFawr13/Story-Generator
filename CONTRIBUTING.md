# Repository workflow

## Branches and commits

- `main` is the only permanent development branch at this stage.
- Use scoped branch names like `feat/seeded-simulation`, `fix/event-causality`, `docs/chronicle-spec`.
- One logical change per pull request, ideally small enough to test and review.
- Squash merges are preferred when PRs have exploratory commits.
- Never overwrite unrelated changes or delete an active branch without explicit authorization.
- Merged same-repository PR branches are deleted by GitHub's "Automatically delete head branches" setting once enabled; until then the branch-cleanup Action does it (it skips itself when the setting is on).
- CI is tiered and minutes are budgeted: follow [AGENTS.md](AGENTS.md) for local checks, push cadence and when to run full regression ([details](docs/CI_VERIFICATION.md)).

## Roadmap and requirements

- Consult [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for ordered tasks, phase dependencies, tests and exit gates before starting code.
- Design/visual approval and implementation approval are separate. D-020 explicitly authorizes Phase 1 engineering and supersedes the earlier pre-build scaffolding restriction. Retain unfinished visual/balance/storage evidence as milestone requirements; do not infer approval for parked or later-phase systems.
- New ideas belong in the decision register and must distinguish **approved**, **proposed** and **parked** scope. Deferred spectator nudges must not acquire an implementation milestone by implication.

## Engineering requirements

- Simulation code stays independent from UI.
- Deterministic seeds, explicit simulation version, persistent IDs, and reproducible event streams.
- Model-driven histories: chronicle prose must not invent new facts.
- Add regression tests for every simulation rule change; run stress tests for long histories.
- Vercel updates only from commits on `main` by default (D-026). Keep production linked to `main`, branch previews disabled, and `vercel.json`'s main-only Git rule intact. Verify the exact main revision and live flow after deployment; see [deployment setup](docs/DEPLOYMENT.md).

## Source code vs assets

- Preserve source licenses and provenance for third-party assets.
- Avoid committing generated or temporary build artifacts.
- Keep art style and simulation mechanics documented separately.
- Do not add service API keys or paid AI generation as runtime prerequisites.
- The package is private and marked `UNLICENSED`; no open-source license grant has been selected. Temporary map shapes/colors are original programmatic drawings, not imported sprites or substitutes for the selected visual references. Record provenance before adding production assets.
