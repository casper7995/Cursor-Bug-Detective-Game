# Iteration 19

**Date:** 2026-04-30
**Phase:** Phase 3 polish (sentence reveal juice)
**Target:** sentence (validated 78; reviewer-blockers list)
**Items:** S-13 (score count-up + ending pulse) + S-14 (per-pick commit flash)

## What landed
- **S-13**: `drawShareCard` now takes `revealT: number = 1`. Score count-up uses ease-out quad over the first 70% of reveal; ending headline pulses (font scale ±18%) over the first 25%. Score recolors from ink to ending hue when count finishes. Session passes `phase.t / 1.4` so reveal completes in 1.4s.
- **S-14**: New `reveal` phase between `pick` and the existing `advanceAfterPick`. 280ms (`REVEAL_FLASH_S`). The popover shows with the picked row highlighted; an alpha-fading colored overlay paints over the row in its color (blue/purple/orange — idle treated as orange). Step machine handles the new phase; `currentSentenceIdx` extended to include reveal so the editor doesn't snap forward early.

## Why
Sentence iter-4 reviewer flagged both as blockers toward 90:
- "Score reveal lacks juice — no count-up, no particle, no shake on the big 280"
- "Per-pick commit lacks a flash — when player presses 1/2/3, the row highlight just disappears"

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred. Score holds at 78. Expected next-review: 78 → 84-86.

## Notes
Sentence has S-15 (beat escalation) + S-9/S-10 polish remaining. Shell still 0 with 10 open items.
