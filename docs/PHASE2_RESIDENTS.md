# Phase 2 resident foundations — 2026-10-10

D-025 authorizes beginning Phase 2 foundations while P1 art, physical-device and human usability reviews remain open. This slice implements a pure, immutable tick-zero identity component as `p2-resident-foundation-v1`. It is not yet part of the advancing world or local-save payload. Existing P1 worlds, rules, snapshots, RNG streams and viewer behavior remain intact.

## Founding identity contract

`createFounderRoster` accepts a complete, unchanged, supported P1 founding snapshot. It rejects running worlds and altered founding inputs; it does not invent an individual history for an old aggregate population. The component contains its version/configuration, seed, founding event and settlement IDs, six household records, 24 resident records, final identity RNG state and next entity ID.

- Homes follow the founding huts' canonical ID order, with four residents in each. Household IDs are allocated first from the source's next entity ID, then residents in household/member order. For RIVERSIDE, households are #11–16, residents #17–40 and the returned allocator is 41. No ID or allocator in the input world is changed. Integration into a future P2 world must consume the returned allocator and register these identities before advancing; the component must not be overlaid on an advancing P1 world.
- Each household draws a unique shared name from a 16-name authored list. Each resident draws a given name without replacement within their household from a 32-name authored list. Full founding names are unique; IDs remain the authoritative identity. These are original seed data, with no imported name generator or asset dependency.
- Founder ages range from 18 years through 50 years and 47 weeks, using the existing 48-week calendar. Age at founding is recorded without inventing birth events or a prior biography. Pure age/life-stage queries classify child below 18, adult below 60 and senior from 60, with checked integer arithmetic. These labels do not establish work, fertility or retirement rules.
- Initial health matches the founding settlement. Profession is unassigned. Location and home refer to the actual founding hut. Parent links are empty because founders' kinship is unknown; shared household names do not establish biological relationships, partnerships or marriage.
- Sociability, caution and persistence are bounded integers from 0–100. These initial attributes have no effect on P1 behavior. Their influence on activities and decisions needs its own versioned rule contract.

The age/stage ranges, authored lists and trait distribution are explicit engineering baselines, not evidence of balanced individual demographics or approved lifespan mechanics. `validateFounderRoster` validates only this complete tick-zero component by canonical comparison; a running-world validator must inspect saved evolving state directly rather than regenerate it from the seed.

## Determinism and isolation

Identity generation uses the existing FNV-1a derivation and rejection-sampled xorshift32 under the separate `residents-v1` namespace. The P1 stream registry remains exactly terrain/weather/demographics. The bounded draw order is six household-name selections, then given name, age, sociability, caution and persistence for each resident. That is 126 bounded requests; rejection sampling can consume additional raw draws. The returned final state preserves that distinction.

The factory and query helpers are independent of browser/UI/storage APIs. Output is deeply captured and frozen; the source, its RNG, events and allocators are untouched. Founding inputs under both supported P1 rule versions produce the same identity component. Inspection cannot create authoritative residents in the existing P1 viewer.

## Verification

The independent standard-library [Python probe](probes/resident_probe.py) generates three name/age/trait/RNG vectors, stored in [the fixture](../tests/fixtures/residents.json). Unit coverage checks those vectors, a fixed 100-seed identity/reference battery, JSON restoration, deep immutability, exact age boundaries and unsafe arithmetic, altered/transplanted/unsupported components and rejection of running worlds. The 100-seed test has a 60-second budget because it repeatedly validates full founding snapshots; its original five-second default was too short for the measured 16.7-second batch. No product latency claim follows from that test budget.

Browser parity compares complete component bytes for RIVERSIDE and PEOPLE_0–9 against Node, validates restored JSON and confirms unchanged P1 founding bytes in Chromium, Firefox and WebKit. Hosted full verification is recorded with the milestone PR.

```sh
python3 docs/probes/resident_probe.py
npx vitest run tests/unit/residents.test.ts tests/unit/determinism.test.ts
npx playwright test tests/browser/residents.spec.ts
```

## Next integration

Introduce a new versioned P2 world/save schema with resident and household identities, historic identity retention, authoritative population counts and strict reference validation. Connect real births/deaths, health, labor eligibility and household changes before exposing a live roster or biography. Preserve v1/v2 aggregate saves without retroactive people or silent migration. Opportunity families, Spotlight caps/commands and their decision rules remain governed by the outstanding Q-005 contract; direct observer nudges remain parked.
