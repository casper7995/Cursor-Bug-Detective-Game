# Iteration 6

**Date:** 2026-04-30
**Phase:** Phase 2
**Target:** tamper (was 68)
**Item:** T-2 — punch up the subtle prop variants

## What changed in `drawPropSketch` (`src/minigames/tamper/draw.ts`)
- **stamp_offset**: now rotates 0.18 rad AND shifts the dot 0.32 size (was 0.12). Both deltas at once → unmistakable.
- **signature_loopy**: second loop is now bigger (0.22 size, was 0.1) and drawn in accent orange — pops against the original ink stroke.
- **ledger_fold**: was a tiny corner notch; now a filled triangular shadow flap covering ~40% of the page corner. Reads at 16px.
- **lampshade_tape**: was a 0.12×0.1 swatch; now a wide 0.8×0.18 horizontal orange strip across the rim with a 1px outline.
- **puddle_oil**: was one orange ellipse with a tiny yellow accent; now a layered iridescent sheen with dark base + orange + blue + yellow rings.
- **book_shifted**: rotation increased from 0.08 to 0.22 rad and translation from 0.06 to 0.18, plus a dashed "ghost" outline at the original position so the displacement is unmistakable.

Also raised the `sketchSize` ceiling from 18px to 22px (max 0.85 → 0.95 of `r`) so all the new detail actually has pixels to read in.

## Why
Deep-tamper agent flagged 6 subtle variants as effectively invisible at the rendered size, breaking the spot-the-difference loop ~half the time depending on which prop got tampered.

## Validation
- typecheck ✓
- vitest 260/260 ✓
- per-game review: deferred — Playwright MCP still disconnected. Will batch-validate when reconnected.
