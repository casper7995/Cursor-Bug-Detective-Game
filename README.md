# Cursor Crew (monorepo)

This repository holds two apps in separate folders:

| App | Folder | Description |
| --- | --- | --- |
| **Shooting game** (jam-preserved) | [`shooting-game/`](shooting-game/) | Vibe Jam 2026 Canvas arena: pick a cursor, 120s waves, boss, leaderboard Worker. |
| **Tower defense** (active dev) | [`tower-defense/`](tower-defense/) | Three.js “Defrag Run” arena — protect the Recycle Bin, upload progress, optional structures. |

## Quick start

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

- **Cloudflare Pages** (jam entry): set root to this repo, build command `cd shooting-game && npm install && npm run build`, output directory `shooting-game/dist`.
- **Worker** (leaderboard + seed): lives under `shooting-game/worker/` — see [`shooting-game/README.md`](shooting-game/README.md).
