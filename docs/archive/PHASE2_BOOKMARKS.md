# I.5 — Passive resident and household bookmarks

Task 2.8's passive reading shortcuts are separate from deliberately activated Story Spotlight. A resident or household profile now offers Bookmark/Remove bookmark; Your bookmarks opens that actual retained history without changing the world or playback. Evidence and causes use the existing exact source-focus and scroll return.

## Identity and history contract

Bookmarks belong to the current simulation version and seed. Each shortcut retains its kind, persistent ID and original identity anchor: founding/birth record, entry tick/age and original resident names, or household creation record and original name. Displayed names and facts always come from the current world. A missing or mismatched identity is disabled, labelled “Not recorded in this history” and removable. It never resolves an ID to a different person or fabricates an earlier biography.

Naturally deceased residents and retired households remain inspectable because their identities and histories are retained. An earlier save may not yet contain a bookmarked child; the unavailable shortcut stays retained for a later compatible history. Existing P1 v1/v2 worlds have no individual bookmarks or retroactive people. A supported new-world/save replacement resets the profile and loads its own version/seed shortcuts; a rejected replacement preserves the reader.

## Browser-local preference contract

- The schema-1 bookmark preference is separate from the complete canonical IndexedDB world envelope. It contains no simulation RNG, commands, event modifications or Spotlight activation. World IDs, rules, all codecs, local-save ownership and autosave remain unchanged.
- Keep up to 32 shortcuts per seed and the 16 most recently updated nonempty version/seed sets. Updating a set moves it to the end; adding another beyond 16 removes only the oldest bookmark preference. The UI states these retention limits. Removing a seed's final shortcut removes that preference set.
- Bound reads to 262,144 string characters, 16 unique world keys, 32 unique subjects per world, positive safe IDs and 256-character keys/identity anchors. Malformed/unsupported/oversized preferences yield no shortcuts; a later valid annotation can replace damaged preference data. These limits do not evict or modify canonical history.
- Read/write denial leaves reading and world saving available. Failed preference writes preserve in-session shortcuts and explicitly say changes last for the open session. They do not claim persistence or change the existing world slot. Reload restores only successfully written preferences.
- Storage events refresh other open readers; the listener is removed on unmount. Ordinary simulation weeks never read/write preference storage. Concurrent updates use browser-local last-write behavior; they are annotations, not authoritative world commands and need no world-writer takeover.

## Interaction contract

Shortcut selection focuses and reveals the current profile heading. Opening its evidence and returning restores the exact source link and reader scroll. Removing a shortcut focuses the next remove control, the previous final control, or the Your bookmarks heading if empty. The profile's toggle stays in place and uses `aria-pressed`; at 32 shortcuts adding is disabled while removal remains available.

Phone reading keeps the existing map-above-reader context, visible Close residents control, independently scrollable content, 44-pixel controls, text wrapping, Escape return and 200% text support at 320×568 and 390×650. The actual screenshot record and final-head full validation belong to the milestone PR; emulation does not establish physical-device or selected-art acceptance.

## Verification

Five focused unit cases cover complete-world/continuation immutability, version/seed isolation, origin mismatch/missing identities, malformed preference recovery, bounded/unique shortcut sets, old-set retention and denied reads/failed writes preserving prior preferences.

Eight browser scenarios run in all three engines: resident/household reload and source return, accepted/rejected replacement, unrecorded/mismatched identities, quota-denied session behavior, actual read-only second-tab updates and unchanged writer ownership, naturally deceased/retired histories, and both short phones at 200% text. Complete stored-world digests stay unchanged through reading and annotation. The full existing browser and core suites guard save versions, deterministic continuation, autosave and canonical archive behavior.

Partnerships, social memory, individual decision/profession rules and Q-005 Spotlight families/budgets remain later increments. All existing P1 acceptance reviews remain open.

Actual RIVERSIDE week-zero captures were inspected: [desktop shortcuts and household profile](evidence/phase2-bookmarks-desktop.png) and [390×650 phone shortcuts at 200% text](evidence/phase2-bookmarks-phone.png). The phone capture uses the reader's internal scroll to reveal the shortcut and remove control beneath the visible close control; map context remains above the sheet. Current terrain/building shapes remain temporary programmatic drawings.

Before final hosted verification, all five new unit cases and eight new Chromium browser scenarios pass. Formatting, strict types, 53 source boundaries and the production build pass. The milestone PR records the final complete regression and exact-main live proof; these targeted results are not a claim that the full new milestone has already passed or merged.
