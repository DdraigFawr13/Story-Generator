# I.6 — Complete named-world seed and save-continuation battery

Task 2.10 previously had 100 named first years and specific longer histories, while the complete 100-seed × 1,000-week battery covered aggregate P1 rules. This milestone gives the actual `p2-settlement-v1` individual engine the same fixed 100 terrain seeds and full 1,000-week coverage, followed by 12 additional weeks after a complete saved restore.

## What runs

Each seed must admit all 1,000 weeks without a limit halt and pass direct evolving-state validation. The complete save envelope is prepared, decoded and compared byte-for-byte with the original world. Both original and decoded worlds then advance 12 complete weeks; full canonical state, archive, RNG, IDs and individual accounting must agree, without a halt.

Independent assertions inspect every retained resident's entity registration, retirement/death consistency, founding/birth event participation and entry chronology. Born residents have exactly their one known retained parent; parent IDs precede children, the parent entered by the birth, and any recorded parental death cannot precede it. Household retirement agrees with actual living membership; the settlement census agrees with actual living residents. These checks never infer unrecorded spouses, siblings or guardians.

The report retains final/continued digests, actual population and identity counts, births/deaths, deepest known descendant generation, retired households, shortages, extinction week, event count, canonical byte size and one factual resident prose sample per seed. Prose source IDs must resolve in the retained archive, and formatting must leave the complete world unchanged. Metrics and text are observations, not desired outcomes or tuned acceptance targets.

## Coverage and CI gates

Four seed runners each execute 25 original aggregate worlds; four independent runners each execute 25 individual worlds. Keeping the two versions parallel avoids serializing the new validation work. No earlier test or seed is removed. Ordinary core cases, all three browser engines, formatting/types/boundaries/build and independent Python probes still run.

The `core` aggregate requires eight current-run reports: four under the original P1 version and four under the explicit P2 version. Each version must cover its own complete original 100 seeds with 100 distinct final digests. Individual reports must also prove the 12-week saved continuation and provide complete continued digests. Missing/mismatched reports, unexpected versions and missing continuation evidence fail the gate. A real Node CLI regression exercises successful eight-report verification and missing report/continuation rejection.

The original local `npm run check` now includes both full 100-seed batteries. To produce an individual report alone:

```sh
STORY_GENERATOR_LIVING_REPORT=/tmp/individual-seed-report.json \
  npm test -- tests/unit/living-seed-battery.test.ts
```

Use `STORY_GENERATOR_BATTERY_SHARD=1/4` through 4/4 to reproduce partitions. Download all eight CI reports to one directory and run `node scripts/verify-seed-battery.mjs <directory> --living`. The earlier original-version-only four-report invocation remains supported without `--living`. The batteries add actual coverage and runner work; their effect on elapsed CI time belongs in the milestone PR, alongside the measured initial 60.3% reduction in [CI_VERIFICATION.md](CI_VERIFICATION.md).

## Scope of evidence

1,000 weeks are about 20.8 simulated years. The 12-week continuation reaches 1,012; this does not establish all-seed century-scale behavior, multi-parent families, orphan guardianship, social memory, bounded memory systems or Spotlight command replay. Known generations derive solely from actual recorded parent links. A prose sample is deterministic factual reporting, not a human engagement/understandability review.

Application source, simulation rules and saved-world schemas are unchanged. All P1 versions, the founding-only codec and P2 local-slot behavior remain covered. Physical-device, selected-art and human experience acceptance remain open. Final-head results, seed observations and exact-main production confirmation are recorded in the milestone PR before declaring this checkpoint complete.
