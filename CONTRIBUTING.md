# Contributing

Thanks for your interest in Bug Detective. All game and worker code lives under [`bug-detective/`](bug-detective/).

For security-sensitive reports, see [SECURITY.md](SECURITY.md). Community expectations are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Quick start

```bash
cd bug-detective
npm install
npm run dev
```

- **Default Vite URL:** Vite typically serves on `http://localhost:5173/` unless the port is busy.
- **Playwright / CI alignment:** `npm run e2e`, `npm run verify`, and [`playwright.config.ts`](bug-detective/playwright.config.ts) expect **`http://127.0.0.1:5175`**. The Playwright `webServer` boots the dev server with `--port 5175 --strictPort`; with `reuseExistingServer`, you can match that locally with:
  `npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`

## Verification

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest unit tests |
| `npm run build` | Typecheck + Vite production build |
| `npm run e2e` | Playwright (**chromium**, **firefox**, **webkit**) |
| `npm run verify` | `npm test` → **`npm run e2e`** → **`npm run build`** → jam widget script |

First time running E2E or `verify`:

```bash
npx playwright install
```

Never commit `.env`, API keys, or tokens beyond what you intentionally document in [`.env.example`](bug-detective/.env.example).

## Deploy / worker / Pages

See [`bug-detective/DEPLOY.md`](bug-detective/DEPLOY.md) and [`bug-detective/worker/README.md`](bug-detective/worker/README.md).

## Pull requests

- Describe what changed and how you tested it.
- Prefer small, focused changes; run `npm test` at minimum before opening a PR, and **`npm run verify`** before larger changes.

## Maintainer notes

Optional product/engineering context: [`MAINTAINERS.md`](MAINTAINERS.md) (not needed to contribute).
