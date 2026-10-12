# Agent instructions

Read [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) (one page) and the current spec in `docs/phases/` before code work. [docs/REBOOT_PLAN.md](docs/REBOOT_PLAN.md) is the full plan; open the section you need rather than the whole file. These rules bind Claude Code, Codex and any other coding agent.

## Working style

- Plan per phase: spec in `docs/phases/PHASE_N.md` (at most two pages), user approval, then implement.
- Merge at milestones when CI is green; ask the user on design forks. End each phase with the playtest check-in from REBOOT_PLAN §1E.
- When the plan is silent, follow REBOOT_PLAN §1B: connect more systems, prefer data over code, make consequences visible.

## Model routing (cost)

The user asked agents to save money by orchestrating cheaper models. The main session (the most capable model) plans, writes specs, reviews diffs, commits and merges. It delegates:

- **Bulk coding** to the `implementer` agent (Sonnet; `.claude/agents/implementer.md`): one bounded milestone task at a time, with a written spec (files, data shapes, behaviour, tests, acceptance criteria). Run it in a git worktree when the main tree is busy.
- **Routine check runs** to the `test-runner` agent (Haiku; `.claude/agents/test-runner.md`): `npm run check`, browser smoke, reruns after fixes.
- If a session started before these agents existed, use the `general-purpose` agent with `model: sonnet` or `model: haiku` and tell it to follow the agent file.

Don't delegate when it costs more than it saves. Every subagent starts cold and re-reads the repo (about 20–60k tokens), so keep small edits, one-line fixes and quick filtered checks in the main session. Delegate when a task needs many file reads or writes, or produces long logs. The orchestrator always reviews delegated diffs before committing; cheaper models make plausible mistakes.

## Cloud sessions

`.claude/hooks/session-start.sh` installs the pinned Node and npm, runs `npm install` and points Playwright at the container's Chromium when its pinned build is missing (`PLAYWRIGHT_CHROMIUM_PATH`, read by `playwright.config.ts`). Don't download Node by hand or keep a local Playwright config.

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
