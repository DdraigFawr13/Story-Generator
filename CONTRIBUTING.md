# Repository workflow

## Branches and commits

- `main` is the only permanent development branch at this stage.
- Use scoped branch names like `feat/seeded-simulation`, `fix/event-causality`, `docs/chronicle-spec`.
- One logical change per pull request, ideally small enough to test and review.
- Squash merges are preferred when PRs have exploratory commits.
- Never overwrite unrelated changes or delete an active branch without explicit authorization.
- Merged same-repository PR branches should be deleted by the branch-cleanup GitHub Action, subject to repository Actions/token permissions.

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
