# Iteration 8

**Date:** 2026-04-30
**Phase:** Phase 2 / 3 polish
**Target:** errand (last validated 64)
**Item:** E-5 — animated clue-lock progress

## What landed
- New `clueLockProgress01(waveNumber, secondsHeld)` in `errand/round.ts`. Returns 0..1 from the better of (waveNumber-1)/(clueLockWaves-1) and secondsHeld/clueLockSeconds, capped at 1.
- Replaces the silent binary "clue OPEN/LOCKED" label in the panel with:
  - Animated fill pill — orange while progressing, green when locked
  - Status text: `WAVE N · X% TO CLUE` while open; `WAVE N · CLUE LOCKED` after; preserves `WAVE PAUSE · NEXT N` and `DEFEAT`
- Unit test asserting the 0/0.5/1 transitions.

## Why
Deep-errand reviewer flagged that `clueLocked` flips silently — players can't see why no clue was earned on early defeat. The pill now shows continuous progress toward the lock, removing one of the two silent state changes.

## Validation
- typecheck ✓
- vitest 261/261 ✓ (added `clueLockProgress01 advances toward lock and caps at 1`)
- per-game review: deferred — Playwright MCP still disconnected.

## Notes
E-1 (differentiate units) remains the highest-impact open errand item, deferred until reviewer can validate balance.
