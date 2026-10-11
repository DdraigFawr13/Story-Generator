# Narrative recap verification — 2026-10-10

This milestone implements the approved [recap contract](NARRATIVE_RECAPS.md) under D-029. It changes presentation, browser preferences and playback scheduling at reading boundaries; simulation rules, canonical saves and historical archives remain unchanged.

## Factual and controller checks

The recap unit cases cover exact year/season ranges, incomplete/unsafe-period rejection, historical output independence from later events/current stocks, interval source IDs, real canonical building identities, summed demographic counts, field contribution only with its recorded cause, removed structures, decay, extinction and honest quiet intervals. Controlled archive cases exercise rare formatter inputs; they are not claims about seed trajectories.

Controller checks compare the complete committed world to headless simulation after automatic pauses at week 48 at 1x/4x/16x. They verify seasonal/off, manual reading without canonical changes, no automatic reading during Step, preference changes applying to future boundaries, preserved reading on rejected replacement and cleared reading on accepted replacement. Existing uninterrupted controller scheduling and live-list anchoring tests explicitly select Off so they still test their intended long-run behavior across year boundaries.

## Browser and visual checks

The browser suite exercises yearly boundaries at three speeds, explicit continuation to week 49, persistence of seasonal/off preferences, manual Step, reload-paused, browsing older periods and number jumps, source/causal inspection, return to the same prose/scroll/focused link, accepted/rejected replacement and retained v1 winter history/continuation. Every recap browser case collects page and console errors. Save digest comparisons use actual IndexedDB envelopes and independent Node simulation at the same version/tick.

Phone cases at 320×568 and 390×650 with 200% root text verify a visible close control, map context above the sheet, no horizontal overflow, keyboard activation and return to the same reading position, close-focus restoration and unchanged saved history. Pointer-based desktop evidence inspection separately checks return through causes. These are browser viewport/text checks, not physical Android or installed Safari evidence.

Implementation screenshots were inspected at 1280×900, 390×650 and 320×568 with 200% text. The desktop uses a bounded prose scroller and separate continuation controls. On phones the sheet scrolls while its compact heading/close control remains visible above the prose. Browse history discloses the precise week range and navigation controls, leaving prose visible immediately on short phone screens; browser checks cover that initial visibility at 200% text. Current map art remains temporary under the existing P1 review.

## Real prose review

[narrative-recap-samples.json](evidence/narrative-recap-samples.json) contains five formatter outputs from actual deterministic simulations: RIVERSIDE year one, THIMBLE year two, v2 dormant winter, retained v1 winter and v1 year 42 including extinction. Each includes its exact simulation version, period and source IDs. The last period retains actual weather and zero-yield harvest records; it does not invent a living population or crop food production after extinction.

Reading these samples caught an identity error: canonical building events contain the settlement ID as well as the building ID. The formatter now selects the building identity instead of the first entity, and real-seed assertions cover the labels. Field #12's recorded spring contribution is 83 food in RIVERSIDE year one. Prose keeps reserve transitions separate from aggregate deaths rather than inferring an unrecorded cause, and reports winter crop dormancy without denying foraging. Repeated phrasing remains a limitation of the small local formatter; no hosted narrator is added. This implementation review does not substitute for the user's engagement/readability acceptance.

## Validation and deployment record

[PR #25](https://github.com/DdraigFawr13/Story-Generator/pull/25) merged reviewed head `e97dd06b791a1952e4d0320fd9196f79bf201aa9` as main commit `216ccf3c602dcf6173719f3eea86b67a1cf29d39`; their complete trees match. Local validation passed 140 core tests and 159 browser checks (53 each in Chromium, Firefox and WebKit), formatting, strict types, 32-module boundaries, production build and both independent Python probes. GitHub's [core and browser checks](https://github.com/DdraigFawr13/Story-Generator/actions/runs/38063450925) also passed on the exact reviewed head. The earlier PR #24 billing failure did not prevent this milestone's hosted checks.

Vercel deployment `dpl_E8dJMEQMgXFEgoWjwL2uD3pyNrXr` reported READY, production, source git/main and that exact main SHA. The [stable play URL](https://story-generator-opal.vercel.app) resolved to the same deployment. A real production Firefox session returned HTTP 200, generated RIVERSIDE and automatically paused at week 48 with yearly selected by default. Its full prose matched Node, historical field evidence and cause navigation returned to the reader, seasonal winter prose reported dormant crops, and desktop/phone reading preserved focus and scroll.

The UI saved the actual IndexedDB world at week 48, reloaded and resumed paused without opening an old automatic recap. Closing reading stayed paused; explicit Continue watching advanced to week 49. Both save digests matched independent Node simulation: `a5b223a38337809cb8fe549ffa951e886cbf9c6f9a40fe08e24feaf55bb42be7` at 48 and `2db85de92eb5b8361d702007a747aa29e40a65d29b29c46a77b480318100b50d` at 49. No page or console errors were collected. The live checks used the actual interface and origin-local storage, without production fixture injection or disabled TLS verification.

Main-only Vercel updates remain enabled under D-026. Subsequent documentation-only commits do not change the reviewed application; their exact production source revision is recorded in the documentation follow-up PR. Physical-device, selected-art and human experience acceptance remain separate.
