# Bug Detective

Find the bug. 90 seconds. Daily case. Vibe Jam 2026 entry.

You are a 3D cursor mascot. The page you load *becomes* the game in the first
15 seconds. You investigate one hand-crafted desktop diorama for ~90 seconds,
find the anomaly, pick the bug from 3 choices, get scored. New anomaly each day
(daily seed). Leaderboard for jam-week voter retention.

Submission: <https://vibej.am/2026/> — deadline **2026-05-01 13:37 UTC**.

## Stack

- Vite 6 + TypeScript 5, Three.js (mesh primitives only — no GLTF)
- Vitest for anomaly determinism + score math unit tests
- Cloudflare Pages (`dist/`) + Worker + KV (leaderboard + daily seed)
- Procedural audio (8 SFX + slow synth pad — no shipped audio assets)

## Develop

Run all commands from this folder (`bug-detective/`).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # tsc + vite → dist/
npm run preview      # serve production build locally
npm run verify       # tests + build + jam-widget assertion
```

## Leaderboard worker

1. Create a KV namespace and deploy the worker (`worker/`):

   ```bash
   cd worker
   npx wrangler kv namespace create BUG_LB --remote
   # paste the returned id into wrangler.toml
   npx wrangler deploy
   ```

2. Set `VITE_LEADERBOARD_API` to the deployed worker URL (see `.env.example`)
   and rebuild so the client can fetch `/seed` and post scores.

Without `VITE_LEADERBOARD_API`, the game uses a local FNV-1a fallback for the
daily seed and skips network leaderboard calls.

## Jam widget

`index.html` includes the official entrant snippet:

`<script async src="https://vibej.am/2026/widget.js"></script>`

`scripts/check-jam-widget.sh` asserts it survived the build into
`dist/index.html`. Wired into `npm run verify`.

## Cloudflare Pages

This repo's existing Pages project is configured to build Bug Detective:

- **Build command**: `cd bug-detective && npm install && npm run build`
- **Output directory**: `bug-detective/dist`
- **Production branch**: `main`
- **Env var**: `VITE_LEADERBOARD_API` = the worker URL above
