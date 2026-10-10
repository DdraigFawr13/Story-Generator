# Narrative recap verification — 2026-10-10

This milestone implements the approved [recap contract](NARRATIVE_RECAPS.md) under D-029. It changes presentation, browser preferences and playback scheduling at reading boundaries; simulation rules, canonical saves and historical archives remain unchanged.

## Factual and controller checks

The recap unit cases cover exact year/season ranges, incomplete/unsafe-period rejection, historical output independence from later events/current stocks, interval source IDs, real canonical building identities, summed demographic counts, field contribution only with its recorded cause, removed structures, decay, extinction and honest quiet intervals. Controlled archive cases exercise rare formatter inputs; they are not claims about seed trajectories.

Controller checks compare the complete committed world to headless simulation after automatic pauses at week 48 at 1x/4x/16x. They verify seasonal/off, manual reading without canonical changes, no automatic reading during Step, preference changes applying to future boundaries, preserved reading on rejected replacement and cleared reading on accepted replacement. Existing uninterrupted controller scheduling and live-list anchoring tests explicitly select Off so they still test their intended long-run behavior across year boundaries.

## Browser and visual checks

The browser suite exercises yearly boundaries at three speeds, explicit continuation to week 49, persistence of seasonal/off preferences, manual Step, reload-paused, browsing older periods and number jumps, source/causal inspection, return to the same prose/scroll/focused link, accepted/rejected replacement and retained v1 winter history/continuation. Every recap browser case collects page and console errors. Save digest comparisons use actual IndexedDB envelopes and independent Node simulation at the same version/tick.

Phone cases at 320×568 and 390×650 with 200% root text verify a visible close control, map context above the sheet, no horizontal overflow, keyboard activation and return to the same reading position, close-focus restoration and unchanged saved history. Pointer-based desktop evidence inspection separately checks return through causes. These are browser viewport/text checks, not physical Android or installed Safari evidence.

Implementation screenshots were inspected at 1280×900, 390×650 and 320×568 with 200% text. The desktop uses a bounded prose scroller and separate continuation controls. On phones the sheet scrolls while its compact heading/close control remains visible above the prose. Current map art remains temporary under the existing P1 review.

## Real prose review

[narrative-recap-samples.json](evidence/narrative-recap-samples.json) contains five formatter outputs from actual deterministic simulations: RIVERSIDE year one, THIMBLE year two, v2 dormant winter, retained v1 winter and v1 year 42 including extinction. Each includes its exact simulation version, period and source IDs. The last period retains actual weather and zero-yield harvest records; it does not invent a living population or crop food production after extinction.

Reading these samples caught an identity error: canonical building events contain the settlement ID as well as the building ID. The formatter now selects the building identity instead of the first entity, and real-seed assertions cover the labels. Field #12's recorded spring contribution is 83 food in RIVERSIDE year one. Prose keeps reserve transitions separate from aggregate deaths rather than inferring an unrecorded cause, and reports winter crop dormancy without denying foraging. Repeated phrasing remains a limitation of the small local formatter; no hosted narrator is added. This implementation review does not substitute for the user's engagement/readability acceptance.

## Validation and deployment record

Final exact-revision validation and the main deployment result are recorded in the scoped pull request. GitHub Actions was unable to start at the preceding baseline because the account's billing/spending limit rejected jobs; local checks are reported separately from hosted CI. Main-only Vercel updates remain enabled under D-026. Live production checks use the real interface and origin-local storage, since development fixtures are not included in production.
