# Iteration 1

**Date:** 2026-04-30
**Phase:** Phase 1 (shared infrastructure)
**Items completed:** P1.1 (`wrapAndDraw`), P1.2 (`truncateOnWord`), P1.3 (`drawAiCardTitle`), P1.4 (`clipToRect`)
**Item progressed:** also applied `wrapAndDraw` at the worst tamper sites + fixed stale T-4 copy.

## Files changed
- `src/minigames/desk/aiCard.ts` — added 4 shared primitives (wrapAndDraw, truncateOnWord, clipToRect, drawAiCardTitle)
- `src/minigames/tamper/draw.ts` — imported shared `wrapAndDraw`, deleted private duplicate, applied at Bugbot claim line + intro card body, fixed "(left)" stale copy

## Validation
- typecheck: ✓
- vitest 259/259: ✓
- per-game review: not run (Phase 1 items don't trigger review)

## Backlog updates
- _phase1_shared.md: P1.1, P1.2, P1.3, P1.4 → [done]
- tamper.md: T-1 → [done] (Bugbot claim + intro wrap), T-4 → [done] (stale copy)
- P1.5 (drawResultStrip) still open

## Notes
4 of 5 Phase 1 primitives landed in one iteration. P1.5 (shared result-card scaffold) is the largest of the 5 and deferred to its own iteration.
