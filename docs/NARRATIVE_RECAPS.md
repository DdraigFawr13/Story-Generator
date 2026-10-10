# Narrative recaps and linked inspection

The user requested actual narrative prose on 2026-10-10, rather than relying on bullet-like event headlines: periodic weekly/monthly/yearly recaps that pause the game for reading and link to interesting people or things. D-028 records this product direction. This document defines the next proposed implementation slice; PR #24 does not add a recap reader or an AI dependency. The user selected “Next milestone after the pause (Recommended)”; finish PR #24 and its Vercel verification, then stop before implementing this slice.

## The reading experience

A recap should turn a bounded period's real changes into a few connected paragraphs. It should explain the sequence, link consequences to recorded causes, and make it easy to investigate a thread. The existing event archive remains the evidence behind the prose.

For example, a formatter could produce: “During spring, work on [the new field] finished before [the harvest]. That field contributed to the recorded yield of [actual food amount]. By the end of the period, [recorded reserve change or shortage status].” Bracketed text here denotes data and inspection links, not facts about an already observed world. The implemented narrative must use actual recorded values and distinguish sequence from a causal link.

At a completed recap boundary, playback pauses and the reader opens with its date range. Reading a link keeps the world paused and focuses the corresponding map location, event evidence or available biography. A Back to recap control preserves the reading position. Continuing playback is an explicit action; closing the reader, following a link or returning from a backgrounded tab must not implicitly restart it. Manual recap reading from an already paused game stays paused.

Weekly, every-four-week and yearly schedules correspond to 1, 4 and 48 committed weeks in the current calendar. “Every four weeks” provides the requested monthly frequency without inventing calendar dates or changing simulation units. Annual reading is the proposed initial default, with frequency and an off setting available; that default is an implementation proposal, not a user-selected cadence. A Read recap action should also let a viewer inspect the latest completed period while paused.

## Facts, identities and links

Build a read-only recap input from the exact committed snapshot, interval bounds, selected events and their recorded causes. Use stable event and entity IDs for every inspection target. Preserve the interval's historical facts even if the current building has since disappeared. A displayed cause must exist in the canonical history; events merely occurring together must not become an invented cause.

The running P1 viewer models aggregate population, buildings and settlement conditions. Its first narrative slice can link those locations and records, and describe actual births/deaths in aggregate. It must not assign aggregate events to invented named people, imply thoughts or relationships that were never simulated, or retrofit the P2 founder component onto an existing save. Links to individual people become available only after the versioned P2 world/save integration provides real identities and histories.

Generating, opening, navigating and dismissing a recap must not consume simulation RNG, admit authoritative commands or change canonical world bytes. Pausing affects scheduling only. New World and accepted Resume reset the reader's session; rejected loads preserve the current inspection. Resume stays paused and must not automatically replay every recap boundary in the saved history.

## First local milestone

Implement a deterministic formatter for the current settlement events, with connected prose and linked source records. Keep the output bounded and prioritize consequential changes and their recorded causes over routine repetition. A quiet interval should get a short, truthful account rather than invented drama. Add the accessible recap reader, interval controls, pause boundary, return-to-reading navigation and manual reading through the existing controller/inspection seams.

Verify complete-world digests remain unchanged by recap reading and links; equal admitted ticks at different playback speeds retain identical histories. Exercise exact interval boundaries, new-world/Resume handling, quiet intervals, shortage/recovery, winter and extinction. Browser checks should cover keyboard focus/return, long paragraphs, phone scrolling, 200% text, and saved-world continuation. A human should judge whether a real seed's recap is readable and creates curiosity; automated factual checks cannot establish writing quality.

This should become the next focused product milestone before deeper P2 individual behavior, once the requested pause ends. The user explicitly selected that timing; this contract does not override D-027.

## Optional AI narration

ChatGPT does not need to be embedded for the first local recap. A later hosted language-model API could provide more varied prose from the same bounded, evidence-linked recap input. It would be a presentation adapter: it cannot invent events, change people or influence the simulation.

Before adding that service, decide the provider/model, budget, which world information may be sent, failure behavior and how claims/source links are checked. Keep credentials on a server; never put an API key in the browser bundle. Local factual prose should remain available when the service is disabled, slow or unavailable. A ChatGPT subscription alone is not an API credential or a promise that generation is free. No hosted AI provider, paid runtime requirement or account integration is authorized by this proposal.
