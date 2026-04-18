# Bug Detective — Hand-off for jam submission

**Status: ready for your final review.** All 13 days of work in the plan
are complete. Only deployment + the actual jam submission remain — those
require your Cloudflare credentials and your final sign-off, so they're
yours to do.

## What's built

A 90-second daily anomaly hunt in a 3D desktop diorama, with a "page
peel" wow opener, a daily-seeded leaderboard, share card, mobile gate,
and Cursor-themed mascot.

### Walkthrough of one round

1. Page loads → **title splash** ("Bug Detective" + animated emojis).
2. Click anywhere → **page peel intro**: the splash vanishes, the
   mascot appears as a tiny OS-cursor-sized figure on a fake "welcome to
   my page" page, then the page peels back as the camera dollies in to
   reveal the desktop diorama; mascot lands as a chunky toy on the desk.
3. **Investigation phase** (90s): hover desk props with the magnifying
   glass cursor; HUD shows tooltips. Each prop has been mutated by today's
   anomaly (one of 12 — calendar shows wrong date, clock spins
   counter-clockwise, mug name swapped, monitor reflection wrong, photo
   shows you, sticky-note has a warning, pen floating, lamp shadow
   wrong, steam falls down, blank book, extra keyboard key, plant
   glitching).
4. Press Enter or wait for timer → **answer panel**: 3 choices (correct
   + 2 distractors), pick one with arrow keys + Enter, mouse, or 1/2/3.
5. **Results panel**: correct/wrong, reveal text, score (1000 base −
   time × 4 − clues × 50 − wrong × 500, floored at 0), today's
   leaderboard (top 10 + your rank), countdown to tomorrow's bug, share
   card (1200×630 PNG with Web Share API + Twitter intent), restart
   button. **3-consecutive-correct** triggers a brief "Detective Pro"
   outro card before the regular results.
6. R or click "play again" → re-investigate (same anomaly until UTC
   midnight; tomorrow brings a new seed).

### Settings (gear icon, top-right)

- **Sound** toggle (mirrors M hotkey, persisted in localStorage).
- **Skip intro next load** toggle — when on, returning visitors land
  directly on the desk without the title splash + page-peel intro.
- **Restart round** button (mirrors R hotkey).
- Hotkey reference: M / Enter / R.

### Mascot

3-panel iso cube head in two-tone Cursor-logo treatment (one eye on
each visible front facet, smile bridging the corner) wrapped in a
glass shell, on a humanoid body (torso + jointed arms + jointed legs),
holding a magnifying glass in its right hand. Idle bob when stationary;
billboards to face the camera always.

## Repo layout (only the jam-relevant bits)

```
bug-detective/
├── DEPLOY.md           ← deployment runbook (next step)
├── HANDOFF.md          ← this file
├── README.md
├── index.html
├── package.json
├── public/sounds/      ← intentionally empty (procedural audio)
├── src/
│   ├── api/            ← seedClient, scoreClient
│   ├── audio/          ← procedural SFX + ambient pad
│   ├── cursor/         ← mascot v3 (humanoid + iso cube head)
│   ├── game/           ← state machine, timer, score
│   ├── input/          ← keyboard manager + actions
│   ├── intro/          ← page peel + mouse cursor tracker
│   ├── scene/          ← desktop diorama + 12 anomalies
│   ├── three/          ← scene/camera/postFx
│   ├── ui/             ← hud, answer/results panel, share card,
│   │                     leaderboard, countdown, mobile gate, title
│   │                     splash, settings panel
│   └── main.ts         ← orchestrator
├── tests/              ← anomalies, score, worker (25 tests)
├── worker/             ← Cloudflare Worker (leaderboard + seed) + KV
│   ├── README.md
│   ├── index.ts
│   └── wrangler.toml
└── scripts/check-jam-widget.sh
```

## What works (verified locally)

| Check | Status |
| --- | --- |
| `npm test` | ✅ 25/25 pass |
| `npm run build` | ✅ 593KB JS / 158KB gzip |
| `scripts/check-jam-widget.sh` | ✅ vibej.am widget present in dist/ |
| Title splash → page peel → investigate → answer → results loop | ✅ end-to-end on `vite preview` |
| Mascot reads as Cursor-logo iso cube on humanoid body | ✅ visual confirmation |
| Page peel + camera dolly + diorama reveal | ✅ on every fresh load |
| Procedural audio (8 SFX + ambient pad), Mute hotkey + settings toggle | ✅ |
| Bloom on lamp + vignette in corners (only post-intro) | ✅ |
| Mobile gate at `/?mobile=1` | ✅ |
| Worker: `/seed`, `/leaderboard`, `POST /score` with strict validation | ✅ tested against in-memory KV stub |
| Daily seed determinism (FNV-1a same on client + worker) | ✅ test |
| Anomaly determinism (same seed → same anomaly + distractors) | ✅ test |

## What needs you (couldn't do from inside the agent VM)

1. **Deploy the worker** (Cloudflare Workers + KV).  
   See `bug-detective/DEPLOY.md` § 1 — `wrangler kv namespace create
   BUG_LB --remote` then `wrangler deploy`. Capture the URL.
2. **Re-point Cloudflare Pages** at `bug-detective/`.  
   See `bug-detective/DEPLOY.md` § 2 — change build command, output
   directory, and add the `VITE_LEADERBOARD_API` env var.
3. **Production smoke test**.  
   See `bug-detective/DEPLOY.md` § 3 — 11-item checklist.
4. **Submit to <https://vibej.am/2026/>**.  
   Per your instruction, the agent does NOT submit. Once you've
   reviewed the production deploy, paste the URL into the jam form
   before **2026-05-01 13:37 UTC**.

## Decisions taken during the build (worth a mention)

- **Mascot was rebuilt three times.** v1 was an octahedron pyramid (you
  flagged geometry mismatch); v2 was a hex-gem; v3 (current) is the
  isometric cube with two-tone Cursor-logo facets and humanoid body, per
  your latest feedback. Each iteration is in git history if you want to
  diff.
- **Audio is fully procedural.** No assets shipped — `public/sounds/`
  is intentionally empty. The synth pad + SFX use WebAudio oscillators
  + filters, generated at runtime. Zero licensing risk, zero
  asset-sourcing time.
- **Page-peel uses a custom GLSL shader** (in `src/intro/pagePeel.ts`)
  to roll the page convincingly. There's a fallback flag
  `USE_PEEL_SHADER` that swaps to a simpler vertex-displaced plane if a
  driver chokes on the shader.
- **Cloudflare Pages replaces the shooting-game site** (per your
  direction). Both projects stay in the repo; only the Pages build
  settings change. Old shooting-game settings documented in
  `shooting-game/README.md` for trivial rollback.
- **Bloom is disabled during the page-peel intro.** Otherwise the
  bright fake-page texture caused full-screen glow. Re-enabled when
  landing completes.

## Known limitations / non-blockers

- **Bundle is 614KB** (160KB gzipped). The Vite build warns about
  >500KB chunks. Three.js is the bulk; could shave ~100KB by
  selectively importing instead of `import * as THREE` but that's a
  refactor I left out of the jam scope.
- **No PWA / offline mode.** Worker fallback exists for the daily seed
  (FNV-1a hash of UTC date) so the game is fully playable without
  network — just no leaderboard or score posting.
- **Mobile = simplified touch flow.** Phones see a dismissable card
  with a "Play simplified" button that boots a no-peel, tap-to-
  investigate variant. Touch users can play; the page-peel + hover
  mechanics are still desktop-only.
- **Cross-browser tested only in Chrome.** A code-level audit lives in
  `CROSS_BROWSER.md` (Safari `webkit-` prefixes added, localStorage
  try/catch wrapping, WebGL fallback card, transmission graceful-
  degrade). Live Safari + Firefox smoke-test is in `DEPLOY.md` § 3.
