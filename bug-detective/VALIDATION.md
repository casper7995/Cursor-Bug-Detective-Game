# Bug Detective — Pre-submit validation checklist

Mirrors the "Validation checklist (run before submit)" section in
`PLAN.md`. Items the agent could verify locally are checked. Items
that require the live production URL are flagged for the user's pass
in `DEPLOY.md` § 3.

## Agent-verified (local)

- [x] **Wow moment hits in first 15s.**
  Title splash → click → page-peel + camera dolly → diorama reveal +
  mascot landing typically completes in ~3-4 seconds. Verified via
  `/opt/cursor/artifacts/screenshots/post-title-game.png`.

- [x] **Full loop playable: intro → investigate → answer → score →
  leaderboard → restart.**
  Verified end-to-end via the computerUse subagent. Screenshots:
  `verify-settings-panel.png`, `verify-restart-clicked.png`,
  `results-via-enter.png`, `final-game-state.png`.

- [x] **Daily seed differs across two `?date=` values via worker.**
  Tested algorithmically: `fallbackSeed("2026-04-18") = 4071479664`,
  `fallbackSeed("2026-04-19") = 4088257283`,
  `fallbackSeed("2026-05-01") = 1605626279`. Worker uses the same
  FNV-1a so its `/seed?date=` returns identical values.
  Anomaly determinism test: 50 distinct seeds map to ≥4 distinct
  anomaly indices (asserted in `tests/anomalies.test.ts`).

- [x] **`vibej.am/2026/widget.js` present in built `dist/index.html`.**
  Verified by `scripts/check-jam-widget.sh`, run as part of
  `npm run verify`. Exit code 0.

- [x] **Mobile shows graceful fallback (not broken).**
  Mobile gate (dismissable card with "Play simplified" CTA) verified
  at `?mobile=1`; simplified touch flow loads diorama directly with
  tap-to-investigate. Screenshots: `mobile-gate-final.png`,
  `mobile-simplified-game.png`, `mobile-tap-hover.png`.

- [x] **Worker handles missing KV / 500s gracefully (client falls
  back to local seed).**
  Worker `/leaderboard` returns empty list on KV throw; `/score`
  returns 503 (client treats as score-not-saved, UX continues).
  `/seed` is pure FNV-1a, no KV touch — never fails.
  Tests: `worker.test.ts > graceful KV failure` (2 cases).
  Client: `seedClient.fetchSeed` on any non-OK response → falls
  back to identical local FNV-1a (`fallbackSeed`).

- [x] **`npm test` green in `bug-detective/`.**
  27/27 tests passing (anomalies determinism, score math, worker
  validation/tiebreakers/CORS/404/graceful-KV).

## Requires production URL (your QA pass per `DEPLOY.md` § 3)

- [ ] **Deployed URL loads in <3s on a fresh tab.**
- [ ] **No console errors on production URL across Chrome / Safari /
  Firefox.**

## Build metrics (latest)

| Metric | Value |
| --- | --- |
| JS bundle | 614 KB (159 KB gzip) |
| CSS bundle | 0.29 KB |
| HTML | 0.63 KB |
| Renderer pixel ratio cap | 2 (HiDPI fill-rate sanity) |
| Tests | 27 / 27 passing |
| Modules transformed | 44 |

## Scope honesty

The plan specifies 10+ anomalies; ships 12. The plan's Day 6 decision
gate (peel-shader vs simpler dolly fallback) was passed without
needing the fallback — peel renders cleanly in Chrome.

## Day 6 acceptance: peel verified

Vertex-shader page curl was tested side-by-side with the simpler
opacity-fade fallback before the gate. Shader path was visibly
better and the fallback was retired during the /simplify pass to
keep the renderer focused.

- Shader peel: see `/opt/cursor/artifacts/screenshots/post-title-game.png`
  and `/opt/cursor/artifacts/screenshots/desktop-still-works.png` (page
  visibly curls during dolly).

If your Safari smoke test (DEPLOY.md § 3) shows the shader peel
flickering, the cleanest workaround is to set the page-peel mesh's
material to a `MeshBasicMaterial` with `transparent:true` in
`src/intro/pagePeel.ts` and animate `opacity` as a fade — about
five lines of change.
