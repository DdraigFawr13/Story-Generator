# Contributing

Read [docs/REBOOT_PLAN.md](docs/REBOOT_PLAN.md) sections 1–7 once, then [docs/ROADMAP.md](docs/ROADMAP.md) for the current phase. Agents also follow [AGENTS.md](AGENTS.md).

## Workflow

- Work one phase at a time. Before implementing, write a spec of at most two pages in `docs/phases/PHASE_N.md` and get the user's approval. Ask only about genuine design forks; record other defaults in the spec.
- PRs of roughly 300–1,500 changed lines, one milestone each. Squash-merge when CI is green.
- Keep docs short. Update the roadmap status and append to `CHANGELOG.md`. No per-feature evidence documents.
- `main` is the only long-lived branch. Merged branches are deleted automatically. Never delete someone else's unmerged branch.
- Production deploys from `main` only (D-026); see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Engineering rules

- `src/engine` is pure: no DOM, `Date`, `Math.random`, timers, I/O or non-safe `Math` functions. `npm run boundaries` enforces the layer table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Use a named RNG stream per system and iterate in id order.
- Every state change a person would notice emits an event with a content template and cause links. Chronicle text never invents facts.
- Prefer content entries over engine special cases, and simple tunable numbers in content over elaborate formulas.
- Tests are light: unit tests with tiny fixtures, one determinism test, invariant checks and one Chromium smoke. No seed batteries or proof suites.

## Licensing and assets

The package is private and `UNLICENSED`. Record provenance for any third-party asset before adding it. No paid AI services or API keys as runtime requirements.
