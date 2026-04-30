# Iteration 5

**Date:** 2026-04-30
**Phase:** Phase 2
**Target:** runner (was 65 — averaged from 58/72 by two reviewers)
**Item:** R-1 (Pre-run READY → GO overlay with key legend)

## What landed
- New `INTRO_MS = 1500` constant in `runner/session.ts`
- `RunnerSession` gains `introMs` field, `isIntroActive()`, `introProgress01()`
- `step()` skips `stepRunnerSim` during intro; any `wantJump`/`wantBoost` cancels intro immediately
- `restartSameMode()` resets intro
- New `drawRunnerIntroOverlay(ctx, progress01)` in `runner/draw.ts`:
  - "READY" headline for first 55% of intro, then "GO!" with pop-scale tween
  - Key legend row: `SPACE jump · → boost · ESC desk`
  - Sub-line: "press anything to start"
  - Fades out over the last 30% of intro

## Why
The deep-runner agent flagged the missing intro as the #1 issue: the only place the keys are mentioned is the *post-fail* hint, so first-timers void-die before they learn boost exists.

## Validation
- typecheck ✓
- vitest 260/260 ✓
- per-game review: deferred — Playwright MCP disconnected; will batch-validate when reconnected.

## Notes
Loop is operating without Playwright per-game validation as of iter-5. Code-level changes continue with typecheck + unit-test gates intact. When Playwright is restored, dispatch reviewers for iter-4 (sentence) and iter-5 (runner) in parallel.
