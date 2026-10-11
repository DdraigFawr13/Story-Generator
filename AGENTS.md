# Agent instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md), then [docs/REBOOT_PLAN.md](docs/REBOOT_PLAN.md) sections 1–7 and [docs/ROADMAP.md](docs/ROADMAP.md) before code work. These rules bind Claude Code, Codex and any other coding agent.

## Working style

- Plan per phase: spec in `docs/phases/PHASE_N.md` (at most two pages), user approval, then implement.
- Merge at milestones when CI is green; ask the user on design forks. End each phase with the playtest check-in from REBOOT_PLAN §1E.
- When the plan is silent, follow REBOOT_PLAN §1B: connect more systems, prefer data over code, make consequences visible.

## Local checks (run before pushing)

- Every push: `npm run check` (format, typecheck, boundaries, unit tests, build).
- UI or browser-test changes: also `npm run test:browser`.

## GitHub Actions budget rules

Actions minutes and the account's concurrent-job limit are shared across repositories. This repository is public, so its minutes are free today, but fast feedback still matters. CI confirms reviewable work; it is not the debugger.

1. **Verify locally first.** Debug failures locally; don't push just to see what CI says.
2. **Push at reviewable checkpoints.** Batch related commits into one push. Each push to a PR branch starts a run.
3. **Open the PR when the work is reviewable.** Branch pushes without a PR run no CI.
4. **Never bypass checks.** Don't skip, disable or weaken tests to get green.
5. **Don't retry blocked runs.** If a run fails to start, or fails with a billing, quota, spending-limit or runner-provisioning message, stop and report the exact message to the user. Don't re-run, push empty commits, or close and reopen the PR.
6. **No unnecessary deployments.** Production deploys from `main` only (D-026). Merge when a change is done, not to preview it.

CI runs two jobs on every PR and `main` push: `core` (format, typecheck, boundaries, unit tests, build) and `browser` (Chromium smoke). Target: under 5 minutes.

## Deployment

Vercel deploys production from `main` only; branch previews are off. After a milestone merge, verify the exact main revision and the live flow as [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) describes. Don't change `vercel.json`'s Git rule.

## Branches

Merged PR branches are deleted automatically. Never delete an unmerged branch without explicit authorization.

## Changing GitHub Actions workflows

Use the `efficient-github-actions` skill in [`.claude/skills/efficient-github-actions/`](.claude/skills/efficient-github-actions/SKILL.md) for any change under `.github/workflows/`.
