# Vercel hosting — main only

D-026 authorizes playable Vercel hosting with updates only from commits on `main` by default. It supersedes the earlier visual-milestone preview rule. D-029 explicitly resumes work after D-027's pause and authorizes the approved recap milestone.

Play at **[story-generator-opal.vercel.app](https://story-generator-opal.vercel.app)**. The GitHub repository `DdraigFawr13/Story-Generator` is linked to the `story-generator` Vercel project in Golden Goose Engineering Group. The project ID is `prj_oqKFNAkqmbzLBkMoxldzVAF5PYNv`; its production branch is `main`. Preview deployments are disabled in project settings. These identifiers are project metadata, not credentials.

`vercel.json` captures the Vite build (`npm ci`, `npm run build`, output `dist`) and disables Git deployments for all branch paths with `**`, enabling only the exact `main` branch. Vercel's documented matching rule permits a deployment when any matching rule is true, so `main` is enabled even though it also matches `**`. The project selects Node 24.x at the platform level. Both commands run through `npm exec` with explicit `node@24.19.0` and `npm@11.9.0` packages so dependency scripts and bundling use the repository's exact pins. Local `.vercel/` files stay ignored.

The first main build (`ba816eb`, PR #23) failed `npm ci` because Vercel supplied Node 24.21.0/npm 11.19.0 while the repository's strict engines require Node 24.19.0/npm 11.9.0. The explicit tooling commands then built that same main revision successfully in deployment `dpl_F71CMtd7MtzWo8mWbk38V8KESAs6`; the stable production URL returned HTTP 200 without authentication. This establishes hosting/build compatibility, separate from the live flow verification of PR #24's main revision below.

Git pushes to `main` build and deploy production. Feature-branch pushes and PRs run GitHub CI without updating Vercel. Do not manually deploy unmerged work or enable branch previews by default. Before any manual recovery deployment, verify the team, project, production target, clean `main` checkout and exact commit; deploy that main SHA explicitly. A later exception requires an explicit user instruction.

The game is a static browser application. Simulation and its single atomic save slot run locally in the browser, using IndexedDB; no account, server simulation, AI service or runtime API key is needed. Saves belong to the exact browser and site origin. A localhost save, another browser's save and a deployment-specific URL's save do not automatically appear on the stable production domain. Use the project's stable production URL for ongoing play.

After the merge, verify Vercel's reported source SHA equals the main merge commit and the deployment is READY. From an ordinary browser session on the production domain, create a seeded world, inspect the map and chronicle, exercise Play/Pause and Step, save, reload, Resume paused, and continue. Check desktop and phone layouts and collect page/console failures. Production bundles do not serve the development-only `/tests/fixtures/*.ts` helpers, so live checks must use the actual interface and browser storage. Record the live URL and results in the [PR #24 deployment record](https://github.com/DdraigFawr13/Story-Generator/pull/24).

The hosted viewer creates named `p2-settlement-v1` worlds and preserves existing P1 v1/v2 saves under their original rules. [Personal histories](PHASE2_PERSONAL_HISTORY.md) and [household histories and archive filters](PHASE2_HOUSEHOLD_HISTORY.md) remain factual, passive views of retained records. The milestone PR records exact-main live verification after each merge. Hosting does not close the outstanding selected-art, physical-device, storage-policy or human experience reviews.

Configuration reference: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

## PR #24 production verification — 2026-10-10

PR #24 merged as `2b2cd40040be4ca1a604e9fc901f58472c80a26a`. Vercel deployment `dpl_5JSKjVVHVRiVzyACLBmoEs1JZRX6` reported that exact main SHA, production target and READY status; the stable alias resolved to the same deployment. A real Firefox session on the stable domain returned HTTP 200, generated RIVERSIDE, exercised Step and Play/Pause, saved through the UI, compared the IndexedDB save digest to Node at week four, reloaded, resumed paused and continued to week five. Desktop and phone chronicle/evidence inspection produced no page or console errors. The temporary browser profile trusted the environment's configured proxy CA with TLS verification enabled; no machine-wide trust settings were changed.

Exact pre-merge local validation passed 129 core tests and 129 browser checks (43 each in Chromium, Firefox and WebKit), formatting, strict types, module boundaries, build and both independent Python probes. GitHub Actions could not start because the account's billing/spending limit rejected the jobs; these local results are not hosted CI results.
