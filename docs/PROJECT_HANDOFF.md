# Project handoff — recovered 2026-10-09

**Current baseline:** winter/recovery [PR #16](https://github.com/DdraigFawr13/Story-Generator/pull/16), separate legacy sensitivity [PR #15](https://github.com/DdraigFawr13/Story-Generator/pull/15), population display [PR #17](https://github.com/DdraigFawr13/Story-Generator/pull/17), idempotent pause [PR #18](https://github.com/DdraigFawr13/Story-Generator/pull/18) and eight-week autosave [PR #19](https://github.com/DdraigFawr13/Story-Generator/pull/19) are merged; their head branches are deleted. D-022 continues to authorize verified milestone merges. D-023 confirms “Keep most starts viable, make winter reserves matter, and allow recovery from small populations.” V2 makes winter fields dormant, protects low-reserve foraging and permits bounded work at small populations. V1 saves continue unchanged. D-024 selects eight-week autosaves, implemented with the two-active-minute 1x trigger shown in the viewer.

The functional viewer includes bounded, illustrative population dots; [PHASE1_POPULATION.md](PHASE1_POPULATION.md) records their read-only contract and verification. [PHASE1_PLAYBACK.md](PHASE1_PLAYBACK.md) records pause and cadence follow-ups. [PHASE1_BALANCE.md](PHASE1_BALANCE.md) records current rules/evidence; [PHASE1_VIEWER.md](PHASE1_VIEWER.md) retains v1 storage/crash measurements. [PHASE1_MEMORY.md](PHASE1_MEMORY.md) adds fresh production Chromium renderer peak RSS for one v1/v2 world at a time through Resume and the eight-week autosave. It does not establish phone memory budgets, peak JavaScript heap or maximum-payload suitability. Broader storage-policy/human experience acceptance, selected-art references and physical-device support remain open. No deployment or individual-agent phase has begun.

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

The active documents are [SETTLEMENT_RULES.md](SETTLEMENT_RULES.md), [TERRAIN_CONTRACT.md](TERRAIN_CONTRACT.md) and [LOCAL_PERSISTENCE_CONTRACT.md](LOCAL_PERSISTENCE_CONTRACT.md). Keep their units and formulas together. Terrain/founding, weekly rules and persistence are implemented versioned baselines. The table below preserves conflicts at the earlier recovery checkpoint; D-022 implements scheduling/persistence and D-023 resolves winter/recovery emphasis. It is not a second set of current numeric requirements.

| Topic | Latest merged candidate | Older branch candidate | Review consequence |
| --- | --- | --- | --- |
| Calendar/pacing | 48 weekly ticks/year; exact scheduling initially absent | 120 daily ticks/year; six-second tick | Preserve the 10–15-minute/year requirement. ADR-002 now proposes 15 seconds per weekly tick (12 minutes/year); exact default still needs acceptance |
| Winter economy | Crop multiplier 400/1000; renewable abstract foraging produces one food/worker-week | Dormant crops; finite winter forage reserve | Both are proposals. Confirm whether reduced winter production conveys intended preparation or whether dormancy/depletion is needed; no arithmetic or terrain result establishes balance |
| Labor after decline | Fields reserve workers first; workforce floor(P/2) | A nonfarm recovery reservation | Review small-population fixtures before adopting rules; do not import a reservation silently |
| Timber | Finite forest, no regrowth | Seasonally regrowing sources | Main's candidate is finite; assess maintenance decline from multi-seed evidence once implementation is authorized |
| Seed/determinism | 1–64 ASCII characters, FNV-1a/xorshift32 named streams | Unicode-normalized seed and alternate stream proposal | Follow the merged contract and terrain golden vector; do not combine encodings/PRNGs |
| Save representation | Single atomic complete envelope, one world slot | Snapshot generations and separate shared archive records | Use the merged persistence candidate with accepted ADR ownership; older layout is not an additional P1 requirement |

The historical v1 low-population fixture gives P=4, W=2 and no remaining workers after field allocation; P=1 has W=0. V2 addresses this explicitly: W=min(P,max(2,floor(P/2))), with one forager protected below six weeks of opening food. Controlled depleted P=1/2/4 inputs now have measured recovery capacity. This does not guarantee survival or revive an extinct world.

D-024 resolves the autosave interval choice: eight committed weeks replace the earlier 20-week baseline. At the implemented 15-second weekly tick, that means two active minutes between triggers at 1x, 30 seconds at 4x and 7.5 seconds at 16x, before write delay/failure. The five-second throttle does not provide five-second recovery. Broader budget/device acceptance remains separate from this cadence selection.

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

At the recovery checkpoint this was Python generation evidence only. The foundation slice adds exact TypeScript fixture comparison, Node/browser parity and preview interaction checks; see its [verification record](PHASE1_FOUNDATIONS.md). Later settlement, playback, viewer and balance records contain actual runtime/save/browser evidence. Physical-device support remains unverified; historical recovery arithmetic above must not be substituted for those measured tests.

The [phone text-reflow follow-up](PHASE1_VIEWER.md#phone-text-reflow--2026-10-10) fixes inaccessible history/evidence at 200% text on short phone viewports. The sheet keeps its close control visible while its content scrolls, and opening aligns the canvas above it. The [world-session follow-up](PHASE1_VIEWER.md#inspection-across-world-replacement--2026-10-10) resets inspection after accepted replacements, including same-seed/same-week Resume, while preserving it after rejected loads. Browser regressions preserve the saved history digest; these checks do not replace physical-device or human acceptance.

## Next work in order

1. Review the v2 balance findings and consequential chains with a human viewer. D-023's tuning emphasis and D-024's eight-week autosave interval are implemented; broader storage/device acceptance remains open. Continue only with explicit versioned rule changes and preserved old-save behavior.
2. Recover exact selected desktop/phone references before faithful production art or source-density comparison. Do not invent approval or claim replacement symbols are the selected art.
3. Obtain physical Android/installed Safari interaction/performance and a viewer usability review. Desktop browser emulation and controlled Chromium crash recovery are useful evidence with different scope.
4. Close the remaining first-playable acceptance checklist before advancing to individual people/families/Spotlights. Functional 1.17 rendering is complete, and the identified Firefox teardown notification issue has regression coverage. Preserve the complete P1 save/version baseline when proposing P2 extensions.

Continue through scoped pull requests. Ask only for outstanding experience tradeoffs or missing evidence; do not ask the user to reselect recorded architecture, art or phone hierarchy. Do not mark future implementation or browser tests complete from planning documents.
