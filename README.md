# Story Generator

A breadth-first world simulator in the spirit of Dwarf Fortress, set in a grounded medieval fantasy. It generates a world with a few centuries of history, then lets you watch one place live day by day, while a historian's chronicle tells what really happened.

**Status:** the project was rebooted on 2026-10-11 ([plan](docs/REBOOT_PLAN.md)). Phases 0 to 2 are done (world generation, then 250 years of peoples and legends with a legends browser); Phase 3 (one live site) is in progress. See [ROADMAP.md](docs/ROADMAP.md).

[Play](https://story-generator-opal.vercel.app)

## Docs

- [Vision](docs/VISION.md): what the game is and is not.
- [Reboot plan](docs/REBOOT_PLAN.md): the full design and phase plan.
- [Roadmap](docs/ROADMAP.md): phase status.
- [Architecture](docs/ARCHITECTURE.md): layers, determinism, saves.
- [Content guide](docs/CONTENT_GUIDE.md): adding races, spells, events and rules.
- [Decisions](docs/DECISIONS.md) and [changelog](CHANGELOG.md).
- [Contributing](CONTRIBUTING.md), [agent rules](AGENTS.md), [deployment](docs/DEPLOYMENT.md).

Pre-reboot documents are kept in [docs/archive/](docs/archive/).

## Development

Use Node **24.19.0** and npm **11.9.0** (pinned in `.nvmrc`, `.npmrc` and `package.json`).

```sh
npm ci
npm run dev          # open the printed URL
npm run check        # format, types, boundaries, unit tests, build
npx playwright install chromium
npm run test:browser # Chromium smoke
```

No service API key or backend is needed. Everything runs in the browser.
