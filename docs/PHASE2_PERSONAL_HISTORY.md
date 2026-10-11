# Observable resident histories — I.3

Fresh worlds use the existing schema-3 `p2-settlement-v1` life/work baseline. This milestone connects its actual residents to New World, playback, the existing local slot, settlement recaps and personal inspection. It adds no demographic rule, hosted generation service or silent migration.

## World and save routing

The playable world router dispatches the two supported P1 versions to their original validator and reducer, and P2 to its direct saved-state validator and individual reducer. The separate internal tick-zero foundation format is not a playable save. Complete saves retain configuration, every RNG stream, global allocators, identities, current work/home/care state and the full admitted archive.

The IndexedDB database/key, whole-transaction writes, single-writer lease, manual replacement rule, eight-week autosave and paused Resume remain unchanged. A fresh P2 candidate cannot overwrite an existing P1 slot until the user explicitly replaces it. P1 worlds retain aggregate population, original winter behavior and original histories; their viewer explains that named residents begin in fresh worlds.

## Reading a recorded life

“Read residents” opens a read-only roster with name/ID search, living/deceased status and household filters. Roster pages contain at most 32 people. Stable IDs distinguish reused names. Shared household names do not establish kinship.

A profile presents current life stage, precise age in the 48-week calendar, health, household, assigned hut, actual weekly assignment and recorded traits. Deceased profiles stop aging at their actual death tick and retain their last home/work and recorded health/risk inputs. Weekly assignments do not establish a permanent profession; traits have not yet shaped decisions. Newborns have no opening health ledger until their first full week.

Known parent and child links navigate real relationships and preserve a return trail. Founders' birth, parentage and earlier lives remain unrecorded. Birth records identify one known parent; further parentage remains unknown. Hut and assignment targets link to their real creation evidence, or to the assigned person for care work. Home focus uses the recorded tile without inventing travel or a residence for an unhoused person.

The resident historian uses local deterministic prose with a restrained annalistic voice. Its initial `resident-historian-v1` cites actual founding/birth, child birth, latest assignment/home and death records. [I.7's `resident-historian-v2`](PHASE2_RECORDED_FAMILY_DEATHS.md) also reports the latest actual parent/child death with explicit chronology around the subject's own death. It does not invent feelings, marriages, disputes, illnesses, accomplishments or prehistory. The personal timeline includes actual assignment/home changes, known children's births and known relatives' recorded deaths, including a relative sharing the subject's own death record. Earlier records remain reachable in pages of 32 even when they are outside the chronicle's latest 200 headlines.

## Passive inspection and navigation

Profiles, filters, prose, family links, camera movement and evidence inspection do not change authoritative state, RNG, IDs or history. Opening a resident profile does not pause playback. An automatic yearly/seasonal recap replaces the resident reading view and retains its existing explicit-continuation behavior.

Evidence opens the existing chronicle at the real source record and location, including records outside the headline window. Following causes retains the existing causal return trail. “Back to resident” restores the profile, personal page, scroll and exact source button, even when prose and timeline both cite the same record. Accepted world replacement resets profile/filter/trail state using the controller's session identity; rejected Resume preserves the current world and profile.

On phones the reader occupies 56% of the dynamic viewport, with a fixed header and independently scrolling content. It preserves visible map context, wrapped enlarged text, minimum 44px targets, keyboard evidence/return and Escape close with a visible focused opener. Desktop reading has a bounded scrolling body. Resident dots use living people's recorded home tiles with illustrative spacing inside a tile; deceased residents are not drawn as removed buildings.

## Verification checkpoint

Targeted core verification passed 42 tests across world routing, controller and recap coverage. Ten targeted Chromium checks passed before the full regression run. New browser coverage checks complete fresh P2 saves, 57+80 saved continuation, passive playback with exact yearly pauses, both original P1 reducers, real known parent/child links, age at death, exact evidence focus/scroll return, rejected/accepted replacement, complete personal pagination and 320×568 / 390×650 phones at 200% text. Full regression, final-head CI and exact-main production checks are recorded when completed in the milestone PR and integration handoff.

Inspected screenshots show the real RIVERSIDE resident Jory Willow (#51) at week 1,000: [desktop](evidence/phase2-resident-desktop.png), [desktop annals](evidence/phase2-resident-prose-desktop.png), [390×650 phone](evidence/phase2-resident-phone.png), [phone annals](evidence/phase2-resident-prose-phone.png) and [320×568 phone at 200% text](evidence/phase2-resident-phone-text.png). The prose begins with the recorded birth and one known parent; it invents no second parent or earlier life. The enlarged phone header wraps while the body remains independently scrollable. These are implementation viewport checks, not physical-device or human acceptance.

Partnerships, formal guardianship/inheritance, permanent professions, injuries/sickness, trait-driven decisions, social memory, passive bookmarks and explicit Story Spotlight commands remain subsequent P2 increments. This milestone does not close the full Phase 2 relationship, long-run balance or human experience acceptance criteria. P1 selected art and physical-device reviews remain open.
