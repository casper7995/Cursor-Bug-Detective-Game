# Iteration 4

**Date:** 2026-04-30
**Phase:** Phase 2
**Target:** sentence (was 64)
**Items:** S-1, S-4 + simplify-cleanup batch from iter-3 reviewer findings

## What landed
- **S-1**: Removed `case/alt/nope` answer-key spoilers from sentence suggestion popover (`sentence/draw.ts:238-240`). +15 expected.
- **S-4**: `IDLE: -25 → 0` in `sentence/types.ts` to match tutorial copy that says idle = orange.
- **Simplify cleanup** (from iter-3 quality/reuse/efficiency reviewers):
  - Migrated `sentence/draw.ts:wrapText`, `practiceCoach.ts:wrapCoachLine`, `runner/draw.ts:wrapFillText` to shared `wrapLines` (deleted ~60 lines of duplication)
  - `tamper/draw.ts:367` truncation loop → shared `truncateOnWord`
  - `estimateBulletsBlock` rewritten with offscreen canvas `measureText` + memoization (was a `5.6 * length` hack)
  - `formatScoreDelta` helper extracted (4-level ternary flattened)
  - `TAMPER_PANEL_RECTS` hoisted to module-level constant (was per-frame allocation)
  - Dropped unused `tamperedLabel` from `TamperResultCardInfo`

## Validation
- typecheck ✓
- vitest 260/260 ✓ (sentence partial-credit test updated 450→475 due to IDLE change)
- per-game review: spawned but Playwright MCP disconnected mid-loop; pending

## Commit
b618279: "ralph iter-1 to iter-4: phase 1 infra + errand boss telegraph + sentence spoilers + simplify migrations"

## Note on Playwright disconnection
Playwright tools became unavailable mid-iteration. Sentence reviewer (a64fd7997e644c9d3) was launched before the disconnect — its result will or won't validate iter-4 depending on whether it had Playwright access at start time. Future iterations may need to defer per-game scoring reviews until MCP is restored.
