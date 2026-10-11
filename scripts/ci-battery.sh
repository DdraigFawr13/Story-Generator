#!/usr/bin/env bash
# Runs seed-battery partitions sequentially in one job: ci-battery.sh settlement:1 living:all ...
# A numbered part runs that quarter (of 4) and writes its report for the core verifier;
# "all" runs every seed with no report, as `npm run check` does locally.
set -euo pipefail
mkdir -p test-results
for part in "$@"; do
  suite="${part%%:*}"
  shard="${part#*:}"
  echo "::group::$suite seed battery, partition $shard"
  if [ "$shard" = all ]; then
    npm test -- "tests/unit/$suite-seed-battery.test.ts"
  else
    STORY_GENERATOR_BATTERY_SHARD="$shard/4" \
      STORY_GENERATOR_REPORT="test-results/seed-battery-settlement-$shard.json" \
      STORY_GENERATOR_LIVING_REPORT="test-results/seed-battery-living-$shard.json" \
      npm test -- "tests/unit/$suite-seed-battery.test.ts"
  fi
  echo "::endgroup::"
done
