# Iteration 9

**Date:** 2026-04-30
**Phase:** Phase 2
**Target:** runner (was 65 — pending validation of iter-5)
**Item:** R-2 — coyote-time + jump-buffer

## What landed
- New constants `COYOTE_TIME_MS = 80`, `JUMP_BUFFER_MS = 100` in `runner/sim.ts`
- `RunnerSimState` gains `lastGroundedAtMs`, `bufferedJumpAtMs`, `prevWantJump`
- `stepRunnerSim` now allows jump under three paths:
  - grounded + wantJump (existing)
  - **coyote**: ungrounded but within 80ms of last grounded frame
  - **buffer**: grounded with a recent (<100ms) jump press while airborne
- Edge-detect on `wantJump` (`!prevWantJump`) so a held key buffers exactly once per press
- Two new tests: jump-buffer fires on land; neutral init values for new state fields

## Mid-iter notification: sentence iter-4 reviewer returned
Score 64 → 78 (+14) — S-1 (kill answer-key spoilers) and S-4 (idle/orange reconcile) both verified. Sentence remaining blockers to 90:
- Result card auto-closes too fast for the long paragraph
- Result card overlaps title strip + chrome ?/X buttons
- No "juicy" score reveal moment (count-up / particle)
- No per-pick flash on commit
- Flat escalation across 8 beats

## Validation
- typecheck ✓
- vitest 263/263 ✓ (added 2 runner tests)
- per-game review: deferred for runner — Playwright MCP still flaky for new launches
