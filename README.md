# Cursor Crew

Pick a cursor. Fight UI monsters. 120 seconds. Vibe Jam 2026 entry.

## What this is

A 120-second top-down arena game where the player picks one of five **system cursors** as their character (Arrow, I-beam, Hand, Spinner, Crosshair) and racks up combo kills against waves of hostile UI elements (404 errors, popups, cookie banners, loading spinners, unread notifications). Three bots fill the arena. Daily global leaderboard per character.

Submission target: <https://vibej.am/2026/> — deadline **2026-05-01 13:37 UTC**.

Full design spec: [`docs/specs/2026-04-17-cursor-crew-design.md`](docs/specs/2026-04-17-cursor-crew-design.md).

## Stack

- Vite + TypeScript
- Vanilla HTML5 Canvas (no game framework)
- Cloudflare Pages for hosting (planned)
- Cloudflare Worker + KV for the daily leaderboard (planned)
- PartyKit for optional multiplayer (Track 2 stretch)

Bundle target: <50 KB gzipped → instant load → passes the jam's "no loading screen" rule.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the production build locally
```

## Roadmap

See the design spec for the full plan. Short version:

- **Weekend 1** — playable single-player MVP (5 characters, 5 enemies, mini-boss, score, deploy, jam widget added).
- **Weekend 2** — bots, daily leaderboard, juice pass, optional multiplayer + portal.

## Important

The Vibe Jam 2026 entrant widget snippet **must** be added to `index.html` before submitting. Without it, the entry is disqualified. The exact snippet lives at <https://vibej.am/2026/#widget>.
