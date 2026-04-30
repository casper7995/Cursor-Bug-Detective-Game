# Iteration 27

**Date:** 2026-04-30
**Phase:** Phase 2 (sentence — last actionable item)
**Target:** sentence (validated 78)
**Item:** S-3 — loosen the 6/8 blue-pick fail gate

## What landed
- New `outcomeStrength(picks): "none" | "partial" | "full"` in `scoring.ts`.
  - `none`: incomplete OR <4 blues — forfeit envelope.
  - `partial`: 4-5 blues — clue still emitted at half score.
  - `full`: 6+ blues — full clue, full score.
- `shouldEmitOutcome` retained as `outcomeStrength(picks) !== "none"` for back-compat.
- `sentenceSession.finalizeOutcome` switches on strength: emits clue at `Math.floor(score / 2)` when partial.
- Tests:
  - `sentence.test.ts`: previous test asserting "5 blues = false" updated to "5 blues = true"; new `outcomeStrength tiers by blue count` test pins 0/3/4/5/6.
  - `clueGating.test.ts`: shifted from "needs ≥6 blues" to "needs ≥4 blues" with explicit assertion that 3 blues still forfeits.

## Why
Iter-4 sentence reviewer flagged "the 6/8 fail gate" as a top blocker: a 5-blue + 2-purple + 1-orange run is a beautiful paragraph and zero reward. Now good-but-not-perfect play earns the desk something.

## Validation
- typecheck ✓
- vitest 268/268 ✓
- per-game review: deferred. Score holds at 78.

## Notes
**All actionable backlog items across all minigames + shell are now closed.** Only deferred items remain:
- SH-10 (audio asset content work, not engineering)

Loop has run out of plannable code work. Without Playwright validation, validated scores are stuck at: shell 0, tamper 68, sentence 78, errand 64, runner 65 — none ≥90 by the strict rubric. Real progress shipped: ~30 backlog items across 5 minigames + shell, 268 tests passing, all changes committed.
