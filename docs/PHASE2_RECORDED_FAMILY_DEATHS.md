# I.7 — Recorded parent and child deaths in personal prose

The I.6 story samples are factual but sparse. Actual parent/child deaths were available in the personal timeline but absent from the brief annalistic prose. `resident-historian-v2` adds one source-linked paragraph for the latest retained death record involving a subject's known parents or children. Every named person is resolved by their actual recorded relationship and persistent ID. Shared household names do not establish kinship.

## Chronology and grouped records

For a living subject, the paragraph describes the latest recorded death among these known relations. For a deceased subject, a relation's earlier death appears before the subject's own death paragraph. A later death explicitly begins “After [name]'s death” and appears afterward, so the prose does not imply the subject experienced a later event. If both died in the same grouped canonical record, it identifies the same record after the own-death paragraph.

The personal timeline now retains both the subject's own death and known relatives' deaths when they share one event. Previously the own-death branch omitted that event's related-death text. Each canonical event still produces one timeline entry, with the actual names and IDs. Earlier related deaths remain reachable in the existing complete paginated timeline; the prose remains bounded to one latest-related-death paragraph.

No emotion, witnessing, orphan status, illness, relationship change, inheritance or guardianship is inferred. This is passive reporting of already recorded deaths, not a new simulation mechanic. Simulation rules, versions, canonical archives, RNG, IDs, complete saves, writer ownership and bookmark preferences are unchanged. The formatter version is presentation metadata and never enters a saved world.

## Concrete story review

At RIVERSIDE week 1,000, Ader Flint (#30) died at week 720 and known child Galen Flint (#52) at week 996. Ader's biography explicitly places the child's later death after Ader's life. Galen's profile places the known parent's week-720 death before Galen's own death. Anwen Flint (#72) died at week 612, before the same parent's death; Anwen's profile also identifies the later annal entry rather than implying a witnessed loss. Bera Willow (#62), still living, links known parent Fara Willow's actual death. These are recorded examples, not a claim of human engagement acceptance.

The original [100-seed report](evidence/phase2-individual-battery.json) remains evidence of its recorded source revision and earlier formatter. Current CI generates fresh prose samples with v2 while requiring unchanged simulation digests and complete saved continuation.

## Verification

Three focused unit regressions read actual retained worlds, check precise relation/source identities and chronology, preserve canonical state, and exercise controlled saved-RNG inputs through the real reducer. They cover a grouped parent/child death and a child's later death after the parent. The complete resident/version/save unit file passes.

The added browser scenario reads the naturally generated RIVERSIDE week-1,000 biography, follows the actual related-death source, returns to the exact focused link and scroll, and compares the entire stored envelope. It repeats on desktop and 320×568/390×650 phones at 200% text, retaining map context, visible close controls, 44-pixel links and no horizontal overflow. Existing version/save/bookmark/recap coverage and both complete seed batteries remain required. Final-head and exact-main live confirmation are recorded in the milestone PR.

Actual [desktop biography/records](evidence/phase2-family-deaths-desktop.png) and [390×650 source link at 200% text](evidence/phase2-family-deaths-phone.png) were captured and inspected. The phone reader keeps its close control visible and scrolls internally through the longer paragraph, with map context above it. Temporary terrain/building shapes remain programmatic drawings; selected-art, physical-device and human experience acceptance remain open. Broader families, guardianship, social memory and Q-005 Spotlight still require their own contracts.
