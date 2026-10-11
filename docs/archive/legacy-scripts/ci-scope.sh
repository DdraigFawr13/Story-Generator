#!/usr/bin/env bash
# Decides which verification tiers a CI run needs (see docs/CI_VERIFICATION.md).
# Inputs (env): CI_EVENT, CI_FULL (true when dispatched as full or the PR has label full-regression).
# Compares HEAD with HEAD^1: for pull_request runs HEAD is GitHub's merge commit, so
# HEAD^1 is the base and the diff is exactly the PR's change.
# Writes key=value lines to $GITHUB_OUTPUT (or stdout when unset).
set -euo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
full=false
if [ "${CI_FULL:-false}" = true ]; then full=true; fi

if git rev-parse -q --verify HEAD^1 >/dev/null; then
  changed="$(git diff --name-only HEAD^1 HEAD)"
else
  changed="$(git ls-files)"
fi

# grep reads all input (no -q) so the producer is never SIGPIPEd under pipefail.
matches() { printf '%s\n' "$changed" | grep -E "$1" >/dev/null; }

docs_only=true
if printf '%s\n' "$changed" | grep -Ev '\.md$' >/dev/null; then docs_only=false; fi

# Toolchain, dependency, workflow and rule-version changes are high risk: full regression.
if matches '^(package(-lock)?\.json|\.nvmrc|\.npmrc|playwright\.config\.ts|vite\.config\.ts|vitest\.config\.ts|tsconfig\.json|\.github/workflows/|scripts/ci-scope\.sh$|scripts/verify-browser-reports\.mjs$|src/sim/[a-z-]*config\.ts$)'; then
  full=true
fi

sim=false
browser=false
if [ "${CI_EVENT:-}" = pull_request ] || [ "$full" = true ]; then
  matches '^(src/(sim|adapters|controller)/|tests/fixtures/seed-battery\.ts$|tests/unit/[a-z-]*seed-battery\.test\.ts$|scripts/verify-seed-battery\.mjs$)' && sim=true
  matches '^(src/|tests/browser/|tests/fixtures/[a-z-]*browser\.ts$|index\.html$)' && browser=true
fi
if [ "$full" = true ]; then
  docs_only=false
  sim=true
  browser=true
  battery='[{"id":"settlement","parts":"settlement:1 settlement:2 settlement:3 settlement:4"},{"id":"living-a","parts":"living:1 living:2"},{"id":"living-b","parts":"living:3 living:4"}]'
  # Same 3 engines x 2 partitions as scripts/verify-browser-reports.mjs expects.
  browsers='[{"project":"chromium","shard":1,"shards":2},{"project":"chromium","shard":2,"shards":2},{"project":"firefox","shard":1,"shards":2},{"project":"firefox","shard":2,"shards":2},{"project":"webkit","shard":1,"shards":2},{"project":"webkit","shard":2,"shards":2}]'
else
  # Representative integration: all 100 settlement seeds plus one quarter of the living
  # battery, and every browser case in Chromium in one unsharded run.
  battery='[{"id":"sample","parts":"settlement:all living:1"}]'
  browsers='[{"project":"chromium","shard":1,"shards":1}]'
fi

{
  echo "docs_only=$docs_only"
  echo "full=$full"
  echo "sim=$sim"
  echo "browser=$browser"
  echo "battery=$battery"
  echo "browsers=$browsers"
} >>"$out"
printf 'Changed files:\n%s\n' "$changed" | head -50
