# New art target — simplified, stylized sprite-world

**Status:** user preference approved in principle: **simple, artistic top-down 2D, reminiscent of the readability and restraint of RimWorld, with slightly richer details and stronger artistic personality**. Illustrated Minimal was selected by the user on 2026-10-09 (D-014). Source sprite size, zoom thresholds and interaction validation remain open.

## Preserve Direction C's UX while revising the map art

Direction C (Naturalist's Observation Desk) remains the approved composition: **map + chronicle + inspector**. Earlier art reference images were too detailed, realistic, textured, and frequently isometric. They are **not** the production art target.

Treat RimWorld as inspiration for **abstraction, silhouettes, clarity at multiple zooms, and visual economy**, not a source of assets, character templates, UI skins or exact shapes. Create an original visual identity and original artwork.

## Preferred qualities

- **True overhead/near-overhead orthographic view**, not an isometric medieval diorama or dense painted city scene.
- **Graphic, hand-authored sprite shapes:** clean contours, simple readable humans, distinct house roofs, terrain and objects.
- **Slightly more visual detail than RimWorld:** a small amount of clothing, roof materials, plant shapes, paths, unique props, season and damage state. Details should aid identity or narrative, not overwhelm.
- **Controlled palette:** natural olive/fern/earth colors with muted jewel-toned accents for special objects, societies and middle-fantasy phenomena; subtle texture, not noisy dithering everywhere.
- **Artistic stylization:** pleasing asymmetric silhouettes, restrained shape variation, expressive lighting/weather palettes and readable material cues.
- **Visible historical change:** new huts, expanded fields, repaired or ruined walls, worn paths, burnt sites, changing foliage. Assets map to real state changes.
- **Emotional readability at scale:** distinguish normal activity from evacuation, mourning, celebration, fire and conflict through sparse states/animation/markers, not cinematic detail or gratuitous blood/gore.
- **UI:** use clear contemporary typography for historical prose. The ledger can feel literary without filling the screen with ornate parchment texture.

## Provisional source-art design tests (replace 16x16 mandate)

Earlier `16x16 pixel tiles + integer scaling` was a *proposal*, not a locked constraint. RimWorld's visual abstraction is not synonymous with 16px pixel art. Do not fix 16px as the mandated source-art resolution.

The completed comparison used three treatments of **the same village layout and HUD**:
1. **Minimal graphic:** simplest pawn silhouettes and 1–2-tone objects, high map readability.
2. **Illustrated minimal (selected, D-014):** same shapes with small roof/clothing/foliage accents, limited texture and shadow, stronger distinctiveness.
3. **Soft illustrative:** gently textured shapes and lighting, a little more color nuance, still notably simpler than the previously shown dense medieval/isometric mockups.

Continue with Illustrated Minimal; the other treatments document the completed comparison. Source resolution, tile size and in-game zoom should be measured against the *displayed* sprite readability, small Android screens, asset throughput and minimum useful world detail. Candidate terrain source sizes: 24/32/48 px, or vector-like sprites rendered to a suitable density; **not** a decision to force a scale now.

## Art comparison criteria

- Can people, buildings, fires, fields, social states, ruins and important historical locations be identified at actual game zoom?
- Is the map readable when time runs and there are dozens or hundreds of sprites?
- Do state changes feel significant because visual differences are legible?
- Do variants scale to a later regional map without requiring all assets to be redrawn?
- Is the asset pipeline practical for many different societies and architectures?
- Does it look like an original game rather than a clone of RimWorld?
- Do animated or fantasy effects remain restrained rather than stealing attention from the history?

## Production constraints

- No copyrighted RimWorld sprites, UI sprites, tracing or extracted game assets; independently create assets.
- An art guide should specify palette ranges, stroke hierarchy, shadow conventions, scale references and export/atlas naming after selected comparison.
- Placeholder drawings in planning should not be mistaken for released sprites.
- Fantasy variety can be integrated later via modular silhouettes, accents and creatures; do not require dozens of species in Phase 1.

## Current visual checkpoint

The final three-treatment comparison is complete, and the user selected Illustrated Minimal. Two matching phone static studies now show collapsed chronicle and expanded event details with a highlighted map location and explicit return to map. See [continuation review](CONTINUATION_REVIEW.md).

Next validate actual-size readability and interactions against that selected target; do not repeat art selection. Generated images are not production sprites, measured touch targets or a working simulation. Named resident details in the desktop study preview Phase 2; the Phase 1 inspector uses settlement/building/event facts.
