# Cursor Crew (monorepo)

This repository holds three apps in separate folders:

| App | Folder | Status |
| --- | --- | --- |
| **🐛 Bug Detective** | [`bug-detective/`](bug-detective/) | **Production / Vibe Jam 2026 entry** — deployed Cloudflare Pages site |
| Tower defense | [`tower-defense/`](tower-defense/) | Post-jam Three.js R&D |
| Cursor Crew (shooting game) | [`shooting-game/`](shooting-game/) | Jam-preserved 2025 entry — source only, not deployed |

## Quick start

**Bug Detective (jam entry)**

```bash
cd bug-detective
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # tsc + vite → dist/
npm run preview      # serve production build locally
npm run verify       # tests + build + jam-widget assertion
```

**Shooting game**

```bash
cd shooting-game
npm install
npm run dev
```

**Tower defense**

```bash
cd tower-defense
npm install
npm run dev
```

## Deploy / CI notes

**Cloudflare Pages** (jam entry — Bug Detective):

- Build command: `cd bug-detective && npm install && npm run build`
- Output directory: `bug-detective/dist`
- Production branch: `main`
- Environment variable: `VITE_LEADERBOARD_API=https://bug-detective-api.<your-subdomain>.workers.dev`
- Full step-by-step in [`bug-detective/DEPLOY.md`](bug-detective/DEPLOY.md).
- The previous shooting-game build settings are documented under
  [`shooting-game/README.md`](shooting-game/README.md) and can be restored by
  pointing the build command back at `shooting-game/`.

**Cloudflare Workers** (leaderboard + daily seed) — two independent
workers coexist; you can deploy either or both:

| Worker | Source | KV binding | Used by |
| --- | --- | --- | --- |
| `bug-detective-api` | [`bug-detective/worker/`](bug-detective/worker/) | `BUG_LB` | The live jam game |
| `cursor-crew-api` | [`shooting-game/worker/`](shooting-game/worker/) | `LB` | Shooting-game source (not deployed) |

See [`bug-detective/worker/README.md`](bug-detective/worker/README.md) for
KV setup and `wrangler deploy` steps for the live worker.

## Vibe Jam 2026

Submission deadline: **2026-05-01 13:37 UTC**. Required entrant widget
(`<script async src="https://vibej.am/2026/widget.js">`) is included in
`bug-detective/index.html` and verified at build time by
`bug-detective/scripts/check-jam-widget.sh`.

The jam-ready hand-off summary lives in
[`bug-detective/HANDOFF.md`](bug-detective/HANDOFF.md). Deployment runbook
is in [`bug-detective/DEPLOY.md`](bug-detective/DEPLOY.md). Cross-browser
audit notes are in [`bug-detective/CROSS_BROWSER.md`](bug-detective/CROSS_BROWSER.md).
