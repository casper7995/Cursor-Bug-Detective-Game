# Iteration 15

**Date:** 2026-04-30
**Phase:** Phase 3 polish + bug fix
**Target:** runner (validated 65; multiple unrev'd improvements pending)
**Items:** R-9 (clear canvas state on restart) + R-4 (boost speed-line FX)

## What landed
- **R-9** — `RunnerSession.restartSameMode` now clears the renderCtx canvas (`clearRect(0,0,w,h)`) and flips `texture.needsUpdate` so the cached Game Over frame doesn't peek through behind a freshly mounted tutorial gate while the next `step()` is still pending.
- **R-4** — Session tracks `boostingThisFrame` (true when `wantBoost && boost was actually consumed`) and pipes it to the renderer as `boostActive`. While true, draw paints 6 horizontal motion lines (varied y, length, phase) inside the playfield clip — eye registers speed.

## Why
- Shell + deep-runner reviewers both flagged the layered Game Over + tutorial bug.
- Deep-runner agent: "the most exciting input has the smallest visual reaction" (boost). +2 score points specifically for adding boost feedback.

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred. Score holds at 65.

## Notes
Errand backlog has zero open items now (E-1 through E-11 all shipped). Runner has 6 open: R-5 (snippet pool 3x), R-6 (soft retry), R-8 (truncate-on-word for clue strip), R-10 (BOOST 0% empty state), R-11 (tier ribbon y), R-12 (drop CLUE › chevron).
