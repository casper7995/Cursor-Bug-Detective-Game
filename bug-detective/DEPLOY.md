# Bug Detective — Deployment Runbook

Follow this when deploying the jam build to Cloudflare. The plan is to
**replace the existing shooting-game site** on Cloudflare Pages with the
Bug Detective build.

## Prerequisites

- Cloudflare account with the existing `shooting-game` Pages project.
- Cloudflare Workers + KV access (for the leaderboard).
- `wrangler` CLI authenticated locally (`npx wrangler login`).

---

## 1. Deploy the Worker (leaderboard + seed)

```bash
cd bug-detective/worker

# First time only — create the KV namespace
npx wrangler kv namespace create BUG_LB --remote
# → outputs an id like:
#   { binding = "BUG_LB", id = "abc123..." }
# Paste the id into wrangler.toml's [[kv_namespaces]] block.

# Deploy
npx wrangler deploy
# → outputs the worker URL, e.g.
#   https://bug-detective-api.<account>.workers.dev
```

Smoke-test the endpoints:

```bash
WORKER=https://bug-detective-api.<account>.workers.dev

curl "$WORKER/seed?date=2026-04-18"
# → {"date":"2026-04-18","seed":1234567}

curl "$WORKER/leaderboard?date=2026-04-18&puzzleId=bug-detective-v1"
# → {"scores":[]}
```

CORS is permissive (`Access-Control-Allow-Origin: *`) so the client can
call from anywhere.

---

## 2. Re-point Cloudflare Pages at `bug-detective/`

In the Pages dashboard for the existing project:

| Setting | New value |
| --- | --- |
| Build command | `cd bug-detective && npm install && npm run build` |
| Build output directory | `bug-detective/dist` |
| Production branch | `main` |
| Environment variable | `VITE_LEADERBOARD_API=https://bug-detective-api.<account>.workers.dev` |

Then trigger a new deploy (push to `main` or "Retry deployment" in the
dashboard). The site will be replaced in place — same Pages project,
same custom domain (if any).

If you need to roll back to the shooting-game build, the old build
command and output directory are documented in
[`shooting-game/README.md`](../shooting-game/README.md).

---

## 3. Production smoke test

Once the deploy is green, browse the live URL and verify:

- [ ] Title splash renders ("Bug Detective", animated emojis, CTA pulses).
- [ ] Click → page-peel intro fires; mascot mid-flight reads as a chunky toy.
- [ ] After landing: timer counts down from 1:30, status shows "find the bug".
- [ ] Hover a desk prop → magnifying glass cursor + tooltip appears.
- [ ] Press Enter / wait → answer panel appears with prompt + 3 choices.
- [ ] Click an answer → results panel shows: headline, reveal text, score
      stats, leaderboard panel, "tomorrow's bug in HH:MM:SS" countdown,
      Share + Restart buttons.
- [ ] Settings gear (top right) opens a panel with Sound toggle, hotkeys,
      About line.
- [ ] DevTools Network tab shows the worker calls succeed (`/seed`,
      `/leaderboard`, `POST /score`).
- [ ] DevTools view-source shows the `vibej.am/2026/widget.js` script.
- [ ] Mobile view (DevTools device toolbar, narrow + touch) shows the
      "open on desktop" gate, NOT the game.

If any step fails, see [`bug-detective/README.md`](README.md) for the
relevant module.

---

## 4. Hand off for jam submission

Once production is green and smoke-tested, post a "ready for review"
message to the user with:

- Production URL.
- Worker URL.
- Smoke-test checklist results.

**The agent does NOT submit to <https://vibej.am/2026/> — the user runs
the final review and submits.**
