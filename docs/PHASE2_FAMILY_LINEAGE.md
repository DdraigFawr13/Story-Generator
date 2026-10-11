# Recorded family across generations — I.8

The resident reader now follows the retained parent-child graph beyond the immediate parent and children. This is passive task 2.8 reading, using the existing `p2-settlement-v1` records; it adds no relationship rule or save migration.

## What the reader establishes

“Recorded family across generations” offers ancestors and descendants, name/ID search and pages of at most 32 people. Results are ordered by generation and stable ID. Living and deceased identities remain readable. Grandparents and grandchildren require two actual parent-child links; deeper paths state their generation distance. Shared given names, surnames, household membership and homes never establish kinship.

Each row identifies the intermediate parent or child and links the birth record that proves that edge. For an ancestor, this is the child's birth; for a descendant, it is the descendant's own birth. Following a name opens its recorded life through the existing profile return trail. Unknown founding parentage and further unrecorded parentage remain explicit; this is not a complete family tree, partnership or guardianship model.

## Reading and bounds

The controller indexes retained IDs once, walks each direction iteratively with a visited set, and reads existing birth records. Traversal is bounded by retained identities, not recursive call depth. Only a 32-person page renders; search and direction changes reset its page. Page navigation focuses the results heading. Subject changes reset the lineage view; accepted world replacement keeps the existing session reset, while rejected Resume retains the profile.

Birth evidence uses the same exact-element return mechanism as personal prose: expanded details, filters, page, scroll and the original source control survive evidence/causal navigation. Native controls, wrapping labels and source links retain 44-pixel targets and the map-above-reader phone arrangement at enlarged text. No reading action changes state, archive, RNG, global IDs, saved envelope, bookmarks or writer ownership.

## Verification

Five targeted lineage unit cases and the existing 12 resident/world-reader cases passed. Natural `TERRAIN_005` week-1,000 history supplies an actual three-generation chain; RIVERSIDE supplies an actually deceased recorded child. Assertions check both edge sources, intermediate parentage, deceased retention, unknown founding ancestors, exclusion of unrelated same-household founders, stable ordering, P1 isolation and complete canonical equality.

The browser cases exercise the actual three-generation history, descendant search/name navigation, ancestor evidence, exact focus/scroll return, unchanged complete saved envelope, 320×568 and 390×650 phones at 200% text, visible close/map context and 44-pixel sources. A separate fresh-world case checks empty unknown lineage and absence of inferred relatives from household names. Complete final-head CI and exact-main live results are recorded in the milestone PR after execution; this document does not substitute for those results.

Both cases passed locally in Chromium (20.5 seconds) and native Firefox (25.2 seconds), with retries disabled. Actual [desktop](evidence/phase2-lineage-desktop.png), [320-pixel phone](evidence/phase2-lineage-320-text.png) and [390-pixel phone](evidence/phase2-lineage-390-text.png) captures were inspected. Phone captures show the actual returned source at 200% text with visible close controls and map context; they are viewport evidence, not selected-art or physical-device acceptance.

`node scripts/family-lineage-study.mjs` reproduces [six retained natural samples](evidence/phase2-lineage-samples.json), checks every projected relationship/source for every retained person and compares complete-world digests with the original 100-seed report. All six matched without canonical mutation. The review includes Wren Stone (#58), whose parent Rona (#47) and grandparent Neri (#23) are proved by records #503 and #66; Meri Stone's deceased grandparent Rian; Tarin Flint's living two-generation path; Rian Willow's four recorded children; Tegan Rowan's retained deceased child Vara; and Rian Alder's three recorded children. These are recorded paths with unknown further parentage, not evidence of complete reproductive families or engagement acceptance.

Partnerships, guardianship, social memory, autonomous relationship choices and Q-005 Spotlight contracts remain later slices. Selected-art, physical-device and human experience acceptance remain open.
