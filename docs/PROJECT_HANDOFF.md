# Project handoff — recovered 2026-10-09

**Current checkpoint:** PR #12 is merged at [2c1e4de](https://github.com/DdraigFawr13/Story-Generator/commit/2c1e4de0c566148ab0adc52b4f980e5886d5774c). D-022 records authorization to continue and merge verified milestones without repeated permission requests. Playback, one-slot atomic IndexedDB persistence, writer ownership and a functional state-derived chronicle are implemented. [PHASE1_PLAYBACK.md](PHASE1_PLAYBACK.md) records behavior and evidence. Map navigation, long-history storage measurement, balance acceptance, selected art and physical-device support remain open; there is no deployment.

The recovery below describes the earlier PR #9 checkpoint and preserved provenance. D-020 supersedes its no-scaffolding restriction; it does not retroactively establish visual/balance acceptance.

## Sources and precedence

| Source | Checkpoint | How to use it |
| --- | --- | --- |
| Recovery baseline | [00f1141](https://github.com/DdraigFawr13/Story-Generator/commit/00f114185bf070af82d6910e676da9a9a66d6f37), PR #9, 13:57 UTC | Architecture, selected art, reviewed weekly settlement/storage proposals and connected terrain probe at the recovery checkpoint |
| Older product branch | [0dbcead](https://github.com/DdraigFawr13/Story-Generator/commit/0dbcead1371cd46dc6b26c3e35fef65af275a7aa), 06:22 UTC | Recover compatible user-confirmed pacing, review priority, seasons, background pausing and phone hierarchy |
| Older art-validation branch | `design/phase0-art-validation`, at main's earlier `1e33bfe` checkpoint | No unique commits when inspected; it supplies no newer approval or asset recovery |

The product branch was 30 commits ahead and four behind main when recovered. Its raw diff is not a safe set of current requirements. It uses decision IDs that collide with main and contains alternate numeric/technical proposals. Preserve the branch; this scoped recovery does not merge, reset or delete it.

## Decisions to preserve

- D-013 already accepts ADR-001–003. Do not repeat framework/runtime/package-manager selection.
- D-014 already selects Illustrated Minimal. Do not repeat art-treatment comparison or replace it with the older original-first-concept preference.
- D-015–019 now record compatible earlier decisions with source provenance in [DECISIONS.md](DECISIONS.md): roughly 10–15 minutes/year at normal speed, desktop-led review with complete phone usability, meaningful seasonal/winter preparation, pause while away, and the map-above-expandable-chronicle arrangement.
- P1 remains one passive aggregate settlement with local saves. Named people, deliberate Spotlight opportunities, regional systems and magic follow their later phase boundaries. Direct observer nudges remain parked.

Use [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) for the first-session experience and quality bar. Earlier branch proposals do not establish new acceptance or supersede newer merged documents.

## Active proposal set and conflicts to resolve

The active documents are [SETTLEMENT_RULES.md](SETTLEMENT_RULES.md), [TERRAIN_CONTRACT.md](TERRAIN_CONTRACT.md) and [LOCAL_PERSISTENCE_CONTRACT.md](LOCAL_PERSISTENCE_CONTRACT.md). Keep their units and formulas together. Terrain/founding are now the versioned foundation baseline; weekly balance and persistence choices remain provisional until their scoped implementation and review.

| Topic | Latest merged candidate | Older branch candidate | Review consequence |
| --- | --- | --- | --- |
| Calendar/pacing | 48 weekly ticks/year; exact scheduling initially absent | 120 daily ticks/year; six-second tick | Preserve the 10–15-minute/year requirement. ADR-002 now proposes 15 seconds per weekly tick (12 minutes/year); exact default still needs acceptance |
| Winter economy | Crop multiplier 400/1000; renewable abstract foraging produces one food/worker-week | Dormant crops; finite winter forage reserve | Both are proposals. Confirm whether reduced winter production conveys intended preparation or whether dormancy/depletion is needed; no arithmetic or terrain result establishes balance |
| Labor after decline | Fields reserve workers first; workforce floor(P/2) | A nonfarm recovery reservation | Review small-population fixtures before adopting rules; do not import a reservation silently |
| Timber | Finite forest, no regrowth | Seasonally regrowing sources | Main's candidate is finite; assess maintenance decline from multi-seed evidence once implementation is authorized |
| Seed/determinism | 1–64 ASCII characters, FNV-1a/xorshift32 named streams | Unicode-normalized seed and alternate stream proposal | Follow the merged contract and terrain golden vector; do not combine encodings/PRNGs |
| Save representation | Single atomic complete envelope, one world slot | Snapshot generations and separate shared archive records | Use the merged persistence candidate with accepted ADR ownership; older layout is not an additional P1 requirement |

Concrete low-population fixture to review: opening P=4 gives W=2. With three completed fields, both workers are reserved for fields and there are no workers for foraging, repairs, construction or timber gathering that week. At P=1, W=0. These follow directly from the proposal; they are review questions about recovery, not measured autonomous trajectories or a new rule change.

The 20-tick autosave proposal also needs a viewing-pace review. At the proposed 15-second weekly tick it means five active minutes between triggers at 1x, 75 seconds at 4x and 18.75 seconds at 16x, before write delay/failure. The five-second throttle does not provide five-second recovery. Keep the existing cadence proposed until that loss window is accepted or revised.

## Visual references and evidence

The selected desktop reference is `exec-1b13e682-a379-4327-9b7a-988178c814f4.png`. Phone references are `exec-46c308c6-50ff-4b1a-86b6-94b06b77d511.png` (collapsed) and `exec-761edce1-fb4a-4fa4-a47d-3a56984720b6.png` (expanded). See [CONTINUATION_REVIEW.md](CONTINUATION_REVIEW.md).

These images were in the originating conversation/workspace and are not repository assets. The resumed workspace has none of them. Recover/export the exact selected images before faithful visual implementation or comparison; filenames alone cannot reconstruct them. Do not claim to have inspected unavailable images or treat a replacement as the approved reference.

The phone information hierarchy is approved. Source density, actual-size readability and live interaction remain unverified. Apply the existing nonmodal-sheet, focus-return, map-context, independent-scroll, zoom and 44-pixel-target requirements from the continuation review. Desktop study named-person details preview P2; P1 uses settlement/building/event facts.

## Verification completed in this recovery

The existing standard-library probe was rerun:

```sh
python3 docs/probes/terrain_probe.py
```

It reproduced 100 distinct maps, 72 founding centers, zero natural fallbacks, forest range 481–1,429, passing river-preserving forced fallback and rejected all-water input. RIVERSIDE again produced center 1327, terrain RNG 2847659418 and digest `07a68eb6bb14a59ac536def9ac133478774970d059b49e1da5406d48be7268eb`.

At the recovery checkpoint this was Python generation evidence only. The foundation slice now adds exact TypeScript fixture comparison, Node/browser parity and preview interaction checks; see its [verification record](PHASE1_FOUNDATIONS.md). Running settlement balance, persistence and physical-device support remain untested. Pacing and low-population observations above are arithmetic consequences, not application tests.

## Next work in order

1. Complete functional viewer navigation/readability: usable phone crop/zoom/pan, event-location focus, chronicle/archive navigation, preserved reading position and 44px controls. Keep selected-art fidelity open until exact references are recovered.
2. Measure real IndexedDB write/load and continued simulation at 1,000 and 10,000 weeks in desktop browser engines. Record actual timing/payload evidence; do not claim physical phone or installed Safari coverage from emulation.
3. Review the ten-seed baseline trajectories and first-session winter experience. Keep changes versioned and explicit; the current batch stays fed through week 1,000 and exposes low-population field-first starvation in forced cases.
4. Recover the selected references, complete selected-art comparison and physical-device evidence, then close the first-playable acceptance checklist. The functional viewer alone does not close those gates.

Continue through scoped pull requests. Ask only for outstanding experience tradeoffs or missing evidence; do not ask the user to reselect recorded architecture, art or phone hierarchy. Do not mark future implementation or browser tests complete from planning documents.
