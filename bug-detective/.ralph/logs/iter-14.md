# Iteration 14

**Date:** 2026-04-30
**Phase:** Phase 2/3
**Target:** runner (validated 65; multiple unrev'd improvements pending)
**Items:** R-3 (plank pre-fade warning) + R-7 (clip world to viewport)

## What landed
- **R-7**: World content (planks + snippet text + projectiles + player + ground shadow) now wrapped in `clipToRect` against a playfield rect that starts below `RUNNER_HUD_TOP_PX + CLUE_STRIP_H = 58px`. Snippet text can no longer bleed into the HUD or clue strip. Used the shared `clipToRect` from Phase 1.4 (first real consumer).
- **R-3**: Refactored plank fade math to compute a unified `lifeT` (0..1 toward disappearance) regardless of pristine vs touched state. When `lifeT > 0.65`, the underline draws in pulsing accent orange (sin-based alpha) with a 1px sin-wobble vertical offset. Visible "leave NOW" warning before the plank vanishes.

## Why
- Shell-review and deep-runner agents both flagged the snippet-text-bleeds-into-HUD bug (visible as `// the page keeps its own VOID` strings in the HUD bar in screenshots).
- Deep-runner agent flagged the silent fade as a fairness issue: the floor disappears with no warning.

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred. Score holds at 65.

## Notes
First production use of the shared `clipToRect` primitive from iter-1. The reuse-review agent flagged it as having zero callers; this iteration retires that complaint.
