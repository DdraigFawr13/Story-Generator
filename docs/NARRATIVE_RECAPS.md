# Narrative recaps and linked inspection

D-029 records the approved next milestone and the user's instruction to merge and begin executing it on 2026-10-10. This implements D-028's requested connected narrative prose using the existing settlement archive. Settlement and building histories come first; real individual stories depend on the later versioned P2 integration. PR #24 is merged and its live main deployment verified.

## The reading experience

A recap should turn a bounded period's real changes into a few connected paragraphs. It should explain the sequence, link consequences to recorded causes, and make it easy to investigate a thread. The existing event archive remains the evidence behind the prose.

For example, a formatter could produce: “During spring, work on [the new field] finished before [the harvest]. That field contributed to the recorded yield of [actual food amount]. By the end of the period, [recorded reserve change or shortage status].” Bracketed text here denotes data and inspection links, not facts about an already observed world. The implemented narrative must use actual recorded values and distinguish sequence from a causal link.

At a completed recap boundary, playback pauses and the reader opens with its date range. Reading a link keeps the world paused and focuses the corresponding map location, event evidence or available biography. A Back to recap control preserves the reading position. Continuing playback is an explicit action; closing the reader, following a link or returning from a backgrounded tab must not implicitly restart it. Manual recap reading from an already paused game stays paused.

**Yearly is the user-selected default**, pausing after 48 complete weeks; **Seasonal** pauses every 12 weeks; **Off** disables automatic reading pauses. At 1x these intervals are 12 and three active minutes. Manual **Read history** offers every completed year or season with previous, next, latest and a number jump. Before the first year it opens the latest completed season; before week 12 it is disabled. Step commits one week without forcing a reader. Reload/Resume stay paused without replaying past reading boundaries. Weekly and four-week schedules are outside this milestone.

The approved voice is a historian with restrained flair: usually two to four annual paragraphs or one to two seasonal paragraphs, shorter for quiet periods. The cadence preference lives in browser-local preference storage outside canonical saves. Unavailable preference storage falls back to yearly and does not prevent play.

## Facts, identities and links

Build a read-only recap input from the exact committed snapshot, interval bounds, selected events and their recorded causes. Use stable event and entity IDs for every inspection target. Preserve the interval's historical facts even if the current building has since disappeared. A displayed cause must exist in the canonical history; events merely occurring together must not become an invented cause.

The running P1 viewer models aggregate population, buildings and settlement conditions. Its first narrative slice can link those locations and records, and describe actual births/deaths in aggregate. It must not assign aggregate events to invented named people, imply thoughts or relationships that were never simulated, or retrofit the P2 founder component onto an existing save. Links to individual people become available only after the versioned P2 world/save integration provides real identities and histories.

Generating, opening, navigating and dismissing a recap must not consume simulation RNG, admit authoritative commands or change canonical world bytes. Pausing affects scheduling only. New World and accepted Resume reset the reader's session; rejected loads preserve the current inspection. Resume stays paused and must not automatically replay every recap boundary in the saved history.

## First local milestone

Implement a deterministic formatter for the current settlement events, with connected prose and linked source records. Keep the output bounded and prioritize consequential changes and their recorded causes over routine repetition. A quiet interval should get a short, truthful account rather than invented drama. Add the accessible recap reader, interval controls, pause boundary, return-to-reading navigation and manual reading through the existing controller/inspection seams.

Verify complete-world digests remain unchanged by recap reading and links; equal admitted ticks at different playback speeds retain identical histories. Exercise exact interval boundaries, new-world/Resume handling, quiet intervals, shortage/recovery, winter and extinction. Browser checks should cover keyboard focus/return, long paragraphs, phone scrolling, 200% text, and saved-world continuation. A human should judge whether a real seed's recap is readable and creates curiosity; automated factual checks cannot establish writing quality.

D-029 supersedes D-027's earlier pause for this approved plan. Implement the recap milestone before deeper P2 individual behavior. See [verification and real prose samples](NARRATIVE_RECAPS_VERIFICATION.md) for implementation evidence; automated factual checks do not establish the user's final experience acceptance.

`src/controller/recaps.ts` formats immutable interval records as a read-only `historian-v1` presentation projection. It groups harvest/weather, construction/loss, reserve/ration changes and aggregate births/deaths. Supporting records expose every contributor to a combined total. Positive field yield requires both the recorded field yield and completion cause; decay links require the removal's recorded cause. A dormant winter crop harvest does not imply there was no foraging.

P1 saves retain events but only the latest weekly ledger. Older recaps do not borrow current stocks/population as historical endpoints or invent historical foraging totals. They do not reconstruct or advance the world. Equal historical intervals produce equal prose after later events are added; P1 v1/v2 saves retain their original rules and continuation behavior.

The controller checks automatic boundaries after the whole week commits and pauses before another timer is scheduled. The reader remains mounted during evidence inspection so period, sources, scroll and focused link can be restored. Phone reading uses a scrolling sheet below the map with a sticky close control. Accepted replacements synchronously invalidate the old reading session, including same-seed/same-week replacements; rejected loads preserve it.

## Optional AI narration

ChatGPT does not need to be embedded for the first local recap. A later hosted language-model API could provide more varied prose from the same bounded, evidence-linked recap input. It would be a presentation adapter: it cannot invent events, change people or influence the simulation.

Before adding that service, decide the provider/model, budget, which world information may be sent, failure behavior and how claims/source links are checked. Keep credentials on a server; never put an API key in the browser bundle. Local factual prose should remain available when the service is disabled, slow or unavailable. A ChatGPT subscription alone is not an API credential or a promise that generation is free. No hosted AI provider, paid runtime requirement or account integration is authorized by this proposal.
