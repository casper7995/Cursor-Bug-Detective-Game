# Cursor Crew (monorepo)

This repository holds three apps in separate folders:

| App | Folder | Description |
| --- | --- | --- |
| **🐛 Bug Detective** (jam entry, **deployed**) | [`bug-detective/`](bug-detective/) | Vibe Jam 2026: 3D desktop diorama, find the daily anomaly in 90s. Page-peel wow opener, leaderboard, share card. |
| Shooting game (jam-preserved) | [`shooting-game/`](shooting-game/) | Earlier Vibe Jam idea — Canvas arena: pick a cursor, 120s waves, boss, leaderboard Worker. |
| Tower defense (active dev) | [`tower-defense/`](tower-defense/) | Three.js “Defrag Run” arena — protect the Recycle Bin, upload progress, optional structures. |

## Quick start

**Bug Detective (jam entry)**

```bash
cd bug-detective
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # tsc + vite → dist/
npm run preview      # serve production build locally
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

- **Cloudflare Pages** (jam entry — Bug Detective):
  - Build command: `cd bug-detective && npm install && npm run build`
  - Output directory: `bug-detective/dist`
  - Production branch: `main`
  - Environment variable: `VITE_LEADERBOARD_API=https://bug-detective-api.<your-subdomain>.workers.dev`
  - The previous shooting-game build settings are documented under
    [`shooting-game/README.md`](shooting-game/README.md) and can be restored by
    pointing the build command back at `shooting-game/`.
- **Worker** (leaderboard + daily seed): lives under
  [`bug-detective/worker/`](bug-detective/worker/) — see
  [`bug-detective/worker/README.md`](bug-detective/worker/README.md) for KV
  setup and `wrangler deploy` steps. The shooting-game worker (`shooting-game/worker/`)
  is preserved but no longer the deployed leaderboard for the jam.

## Vibe Jam 2026

Submission deadline: **2026-05-01 13:37 UTC**. Required entrant widget
(`<script async src="https://vibej.am/2026/widget.js">`) is included in
`bug-detective/index.html` and verified at build time by
`bug-detective/scripts/check-jam-widget.sh`.
