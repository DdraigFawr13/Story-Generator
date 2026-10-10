# Isolated production renderer memory — 2026-10-10

This study supplements the earlier storage measurements, whose Chromium heap observations retained multiple comparison snapshots. It measures the production viewer with one RIVERSIDE save in each fresh Chromium process/profile. Simulation rules, save versions and the D-024 eight-week cadence are unchanged.

## Method and reproducibility

Run on Linux after installing Chromium and its dependencies:

```sh
npm run benchmark:memory
```

The diagnostic builds the production app in a separate Vite process with explicit production mode and `NODE_ENV`, asserts that the pinned React development-warning sentinel is absent, and serves it locally on port 4178. This isolates the build from the fixture loader's development environment. It generates valid v1/v2 fixtures with the Node reducer, prepares their checksummed envelopes, writes each fixture in an earlier browser and closes that browser completely. Each measured browser then loads the production app, validates the saved slot, resumes paused, manually advances eight weeks and completes the ordinary automatic save. The resulting stored tick/version/digest must match eight weeks of Node continuation. Three repetitions cover each of four fixtures and an empty landing baseline: **15 measured processes**, with distinct renderer PIDs.

A page-specific performance mark identifies the renderer PID through Chromium tracing and `SystemInfo.getProcessInfo`. Linux `/proc/PID/status` supplies current RSS and `VmHWM`, the kernel-reported peak resident set since that renderer's birth through the checkpoint. Process start ticks must remain the same through landing, Resume and completed autosave, and peak values must be nondecreasing. The peak includes startup and PID-identification tracing overhead; it does not depend on JavaScript polling catching a short allocation spike. An additional full-envelope read for digest inspection occurs **after** the final memory checkpoint.

RSS includes shared mappings, renderer libraries, DOM/canvas/fonts and the controller/save pipeline's normal copies of the same world. It excludes the Node/Vite processes, Chromium browser/GPU/utility processes and the closed preparation browser. Do not sum these renderer figures into total browser memory or subtract the empty baseline to claim an exact payload cost. `usedJsHeapBytes` is an uncollected JavaScript heap observation at a checkpoint, **not peak or retained-after-GC heap**. The raw `resumeMs` field includes navigation, landing readiness, PID identification and Resume; it is not isolated Resume latency.

The [raw report](evidence/phase1-renderer-memory.json) records the clean source revision `38a8e45`, production bundle mode/size/hash, exact versions, all checkpoints and checked digests. The source revision adds the diagnostic to the merged PR #19 application baseline; it changes no runtime source. Measurements used Chromium **156.0.8078.4**, Node **24.19.0**, Linux **6.18.44 x64** and a 1280×900 viewport in the managed environment. No garbage collection was forced. An initial development-runtime run was discarded; the report/table below contain only the corrected production run.

## Observed results

Each range spans three independent browser/process/profile repetitions; MiB means 1,048,576 bytes. Payload/event/population values describe the starting save; memory spans startup through the completed save eight weeks later.

| Starting world | Payload bytes | Events | Residents | Peak renderer RSS (MiB) | Used JS heap at final checkpoint (MiB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty landing | — | — | — | 112.50–113.01 | 2.93–3.03 |
| V1 week 1,000 | 374,096 | 480 | 39 | 220.77–226.73 | 22.03–29.99 |
| V1 week 10,000 | 1,211,545 | 2,438 | 0 | 315.86–318.52 | 52.31–62.89 |
| V2 week 1,000 | 370,128 | 478 | 40 | 224.18–224.97 | 28.54–29.80 |
| V2 week 10,000 | 1,230,160 | 2,493 | 0 | 312.16–313.73 | 62.45–79.11 |

All twelve saved-world cases remained paused, completed the eight-week automatic save at week **1,008 or 10,008**, matched the corresponding Node digest and had no page/console errors. The two long-run fixtures retain natural extinction and its archive; no refounding or history truncation was added. Heap observations vary with ordinary allocation/collection timing, which is why the study separately reports the kernel's resident-memory high-water mark.

These results establish a bounded, reproducible **single-world desktop Chromium renderer** observation. They are three samples per fixture, not percentiles, isolated snapshot heap, total browser memory, a phone budget, other-engine evidence or proof that the maximum 16 MiB payload/50,000-event policy is suitable. Physical Android/installed Safari and human experience/selected-art acceptance remain open, together with broader storage budgets. See [LOCAL_PERSISTENCE_CONTRACT.md](LOCAL_PERSISTENCE_CONTRACT.md) and [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).

The default report path is `/tmp/story-generator-renderer-memory.json`; `STORY_GENERATOR_MEMORY_REPORT` selects another path. The script closes its owned browsers/server and deletes only the temporary profiles it creates. It is a diagnostic outside normal CI, not an application runtime requirement.
