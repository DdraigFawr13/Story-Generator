# Browser tests (Playwright)

Read with the `test-design` skill when writing, changing or fixing browser tests. Citations follow the skill's style: `terra:22` is line 22 of project-terra's `docs/LESSONS.md`.

## Waits

- Poll with a helper that calls `page.evaluate`.
- Never pass an async function to `waitForFunction`: Playwright treats the returned promise as truthy and doesn't wait (terra:22).

## Locators

- Use `getByRole` with the exact name copied from the source (controls-simulator:38).
- Anchor names: `/^Name/` (controls-simulator:37).
- Scope a locator to its row by the row's label, never "the first" (Vulcan:28).
- Follow the named item, not a fixed position (Vulcan:55).

## Race-free reads

- Read paired values in one `evaluate` (Vulcan:30).
- Time a worker by its own clock (Vulcan:14).
- Pause before comparing with a worker-side save (Vulcan:20).
- Measure redrawn buttons in one `evaluateAll` (Vulcan:44).
- Tap well inside a square, not on an edge (terra:12).

## Config

- Set `retries: 0` (VER-04).
- Set an explicit per-test timeout with a margin over the local time.
- Turn on `reuseExistingServer` only when the port is known to be free (Vulcan:54).
