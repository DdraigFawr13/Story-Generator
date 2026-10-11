# AGENTS.md section template

Paste this into the repository's `AGENTS.md` (create one if missing; `CLAUDE.md` can just contain `@AGENTS.md`). Replace each `<...>` with the repository's real commands and workflows. Keep it short.

```markdown
## GitHub Actions budget rules

GitHub Actions minutes are a limited, account-wide budget shared by every repository. CI confirms reviewable work; it is not the debugger.

1. **Verify locally first.** Run the local checks below before every push. Debug failing tests locally, not by pushing to see what CI says.
2. **Push at reviewable checkpoints.** Commit as often as useful, but batch related commits into one push. Branch pushes run no CI. Each push to a branch with an open PR runs CI; newer pushes cancel older runs, and cancelled runs still bill the minutes they used.
3. **Open the PR when the work is reviewable,** not for an unfinished sketch.
4. **Don't trigger full or manual runs for trivial changes.** Do run them when the rules below require it, before merging.
5. **Never bypass checks to save minutes.** Don't skip, disable or weaken tests or gates.
6. **Don't retry blocked runs.** If a run fails to start, or fails with a billing, quota, spending-limit or runner-provisioning message, stop. Don't re-run, push empty commits, or close and reopen the PR. Report the exact message to the user; the account owner has to fix it.
7. **No unnecessary deployments.** <how production deploys happen, e.g. "Vercel deploys main only" or "Actions > Deploy > Run workflow on main">. Merge when a change is done, not to preview it.

## Local checks (run before pushing)

- Every push: `<format/lint/typecheck/unit/build command>`
- <area> changes: also `<targeted integration command>`
- Before a milestone merge: `<full local suite>` if time allows; the CI full regression is the binding gate.

## What GitHub runs automatically

<one line per workflow: trigger -> what it runs>

## When to run more

Add the PR label `full-regression` (or run Actions > Full regression) before merging:
- <rule or simulation changes, save-format changes, dependency/toolchain updates (automatic), milestone merges>
```
