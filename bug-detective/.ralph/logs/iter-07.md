# Iteration 7

**Date:** 2026-04-30
**Phase:** Phase 2
**Target:** errand (was 64)
**Item:** E-4 — per-action feedback layer

## What landed
- New `FeedbackEffect` system in `errand/round.ts` — typed `kind: "kill" | "leak" | "spend"`, `worldX` in 0..1 lane space, `value`, deterministic id stream.
- Runtime additions: `feedbackFx[]`, `nextFeedbackFxId`, `baseHitShake` (decays 1→0 in 0.25s).
- Emit points:
  - **kill**: when an enemy dies (the .filter that drops `hp ≤ 0`)
  - **leak**: when an enemy reaches `x ≤ 0` (CAP+core damage path); `baseHitShake = 1` only when actual HP drops (CAP didn't fully absorb)
  - **spend**: when an agent is deployed (focus cost popup)
- Renderer:
  - New `drawFeedbackFx()` pass after lane render: cyan rising ring + "+1" for kills, orange `-N` damage popup + impact ring for leaks, focus-cost popup for spends.
  - BASE meter wrapped in shake transform (random ±2px x, ±1px y, scaled by `baseHitShake`).

## Why
Deep-errand reviewer flagged "no failure feedback during play; enemy deaths happen silently; no count-up on result" as the #1 polish blocker.

## Validation
- typecheck ✓
- vitest 260/260 ✓
- per-game review: deferred — Playwright MCP still disconnected.

## Notes
This was Phase 2 polish for errand, not the gameplay surgery (E-1 differentiate units) which remains the highest-impact open item but also the highest-risk without a balance reviewer.
