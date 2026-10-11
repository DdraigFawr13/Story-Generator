# Changelog

Newest first. One short entry per merged milestone.

## Phase 0 — Reset and skeleton

- **M0.1–M0.2 Docs reset and slim CI.** Old docs, ADRs, probes, evidence, seed batteries, long-run tests, legacy browser specs and study scripts moved to `docs/archive/`. New short docs: vision, architecture, roadmap, decisions, content guide, deployment and the Phase 0 spec. CI is now one `core` job (format, types, boundaries, unit tests, build) and one Chromium smoke (`browser`). The boundary check rejects non-safe `Math` functions in `engine` and `content`.

## Before the reboot

- Reboot plan and new engine scaffold (#43). Everything earlier (#1–#42) built the legacy single-settlement app, which still serves `/` until Milestone A.
