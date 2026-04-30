# Iteration 12

**Date:** 2026-04-30
**Phase:** Phase 3 polish
**Target:** tamper (validated 68; multiple unrev'd improvements pending)
**Items:** T-5 (verdict flash hold), T-8 (per-prop hover), T-9 (pointer clamp)

## What landed
- **T-5**: `VERDICT_FLASH_S` 0.6 → 1.2 in `tamperSession.ts`. Especially needed so a +500 confident catch is readable.
- **T-9**: `drawBugbotPointer` now takes the `PanelRect` and clamps `ax`/`ay` so the arrow tail and "bot" label stay inside the TONIGHT panel for edge spots (`lampshade` at top-left was clipping into the panel gutter).
- **T-8**: Session tracks `hoveredPropId` during pick-mode; the move handler updates it via `spotPropAt`. `drawDiffCard` and `drawScenePanel` now accept an optional `hoveredSpotId`. Hovered prop gets a brighter solid ring + slightly larger radius; non-hovered ones keep the dashed dim halo.

## Why
Tamper post-refactor reviewer (iter-0) called these out:
- "verdict flash is too fast (0.6s) to read the feedback line + score-bit"
- "Bugbot 'bot' arrow tag falls outside the panel for left-edge props"
- "Pick-mode shows hover halos on ALL 5 TONIGHT props simultaneously, regardless of where the cursor is — looks like a screensaver, not a click prompt"

## Validation
- typecheck ✓
- vitest 263/263 ✓
- per-game review: deferred (Playwright MCP unavailable). Score holds at 68.

## Pending tamper items
- T-6 (bottom-band collision)
- T-10 (sample-without-replacement Bugbot picks)
