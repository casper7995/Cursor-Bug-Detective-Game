# Iteration 16

**Date:** 2026-04-30
**Phase:** Phase 3 polish
**Target:** runner (validated 65; multiple unrev'd improvements pending)
**Items:** R-5 (snippet pool 3×) + R-8 (truncate-on-word for clue strip)

## What landed
- **R-5**: `CODE_SNIPPETS` 12 → 35 lines. New entries: detective-themed code (witness, fingerprint, alibi, motive, archive, courtroom, profile, suspect) plus 4 narrative comment lines. Eliminates the "third-minute-looks-like-first-minute" repeat described by deep-runner.
- **R-5 follow-up**: rewrote `FALLBACK_SNIPPET_WIDTHS` const into a function that derives widths from char-count × 7.85 so the fallback grows with the pool (was hardcoded to 12 entries).
- **R-8**: `drawClueStrip` now uses shared `truncateOnWord` from aiCard.ts. Chevron prefix `› ` is computed separately and re-prepended so it never gets eaten by truncation; body fits within `maxHintW − prefix width`. Mid-word ellipses gone.

## Why
- Deep-runner agent flagged: "snippet variety is anemic ... the same 3 themed lines repeating every ~30m of climb. Becomes wallpaper inside one run."
- Shell-review agent flagged: "Truncation breaks mid-word: '› ca…', '› mi…'."

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred. Score holds at 65.

## Notes
Errand has zero open items. Runner has 4 left: R-6 (soft retry), R-10 (BOOST 0% empty state), R-11 (tier ribbon y), R-12 (drop CLUE › chevron). Tamper has 2 (T-6 bottom-band, T-10 sample-without-replacement).
