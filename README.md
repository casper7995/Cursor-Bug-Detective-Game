# Cursor Crew

Pick a cursor. Fight UI monsters. 120 seconds. Vibe Jam 2026 entry.

## What this is

A 120-second top-down arena where you pick one of five **system cursors** (Arrow, I-beam, Hand, Spinner, Crosshair), fight waves of hostile UI enemies, survive a Captcha mini-boss at 60s, and chase combo score. Three bots help clear waves (their kills do not add to your score). Optional **Vibe Jam portal** in/out when `?portal=true` and `?ref=` are present.

Submission: <https://vibej.am/2026/> — deadline **2026-05-01 13:37 UTC**.

Design spec: [`docs/specs/2026-04-17-cursor-crew-design.md`](docs/specs/2026-04-17-cursor-crew-design.md).

## Stack

- Vite 6 + TypeScript 5, Canvas 2D
- Vitest for score / spawner / seed unit tests
- Cloudflare Pages (`dist/`) + Worker + KV (leaderboard + daily seed)
- PartyKit scaffold for optional multiplayer (`party/server.ts`)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # tsc + vite → dist/
npm run preview      # serve production build locally
npm run party:dev    # optional PartyKit dev server
```

### Leaderboard + seeded RNG

1. Create a KV namespace and deploy the Worker (`worker/`): `cd worker && npx wrangler kv namespace create LB --remote` — paste the id into `worker/wrangler.toml`, then `npx wrangler deploy`.
2. Set `VITE_LEADERBOARD_API` to your Worker URL (see `.env.example`) and rebuild so the client can fetch `/seed` and post scores.

Without `VITE_LEADERBOARD_API`, the game uses a local fallback hash for the daily seed and skips network leaderboard calls.

### Cloudflare Pages

Connect the repo, build command `npm run build`, output directory `dist`, production branch `main`.

## Jam widget (required)

`index.html` includes the official entrant snippet:

`<script async src="https://vibej.am/2026/widget.js"></script>`

Verify it appears in the built `dist/index.html` before submitting.

## Optional PartyKit

`partykit.json` points at `party/server.ts`. This is a minimal broadcast stub; extend for authoritative multiplayer if needed.
