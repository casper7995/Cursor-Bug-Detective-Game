# Iteration 20

**Date:** 2026-04-30
**Phase:** Phase 3 polish (sentence final pass)
**Target:** sentence (validated 78; round out remaining items)
**Items:** S-15 (beat escalation) + S-9 (resolved by S-1) + S-10 (label overflow)

## What landed
- **S-15**: `pickTimeoutForSlot(idx)` returns `max(1.6, 3.0 * 0.93^idx)`. Slot 0 = 3.0s, slot 4 ≈ 2.25s, slot 7 ≈ 1.85s. The round now escalates instead of being 8 flat beats; the timer ring visibly drains faster as you go.
- **S-15 split**: extracted `pickTimeoutForSlot` to `types.ts` so tests can import without pulling the audio module (which references `window`).
- **S-10**: `drawShareCard` auto-shrinks the ending font when its width exceeds `w − 80`, with an 8.5px minimum. "THE TYPEWRITER WROTE IT FOR YOU" no longer clips.
- **S-9** retired: the badge overlap S-9 described was caused by the case/alt/nope hint badge that S-1 already removed. Only the number badge remains.

## Validation
- typecheck ✓
- vitest 267/267 ✓ — added `pickTimeoutForSlot starts at 3.0s and shrinks per beat with a 1.6s floor`
- per-game review: deferred. Score holds at 78.

## Notes
Sentence backlog is now empty (S-1 through S-15 all done). Shell remains 0 with 10 open items. Tamper, errand, runner have 0 open items each. Total open items across all minigames: 10 (all in shell, which has no validated baseline yet).
