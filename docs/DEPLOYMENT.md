# Deployment

Play at **[story-generator-opal.vercel.app](https://story-generator-opal.vercel.app)**.

- Vercel project `story-generator` (ID `prj_oqKFNAkqmbzLBkMoxldzVAF5PYNv`) is linked to `DdraigFawr13/Story-Generator`. Production follows `main` only; branch previews are off (D-026).
- `vercel.json` disables Git deployments for every branch (`**`) and re-enables exactly `main`. Don't change that rule. Its build runs `npm ci` and `npm run build` through `npm exec` with pinned `node@24.19.0` and `npm@11.9.0`, because Vercel's default Node/npm fail the strict engine pins.
- The game is static. Saves live in the browser's IndexedDB for that exact origin, so localhost saves don't appear in production.

## Deploying

Merge a PR whose CI is green. Never deploy unmerged work manually or enable previews unless the user asks.

## After each milestone merge

1. Check that Vercel's production deployment is READY and its source SHA equals the merge commit on `main`.
2. Open the production URL: generate a world at `/`, open a Legends page, step it, save, reload and load it; check an old `/?next` link still opens the same app.
3. Note any page or console errors in the PR.
