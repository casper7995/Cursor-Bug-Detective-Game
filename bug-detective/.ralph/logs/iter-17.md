# Iteration 17

**Date:** 2026-04-30
**Phase:** Phase 3 polish (HUD trio)
**Target:** runner (validated 65; multiple unrev'd improvements pending)
**Items:** R-10 + R-11 + R-12

## What landed
- **R-10**: BOOST chip empty state. Was `"—"` at <2%; now always shows `N%` and the empty bar. The affordance is consistent — players see the full chip state rather than a "broken-empty" widget.
- **R-11**: Tier ribbon y from 30 → `RUNNER_HUD_TOP_PX + CLUE_STRIP_H + 14 = 72`. Was overlapping the mode label inside the HUD bar at y=30. Now sits cleanly below the HUD + clue strip.
- **R-12**: Dropped the redundant `› ` chevron prefix from the clue strip hint. The "CLUE" label already carries the role. Saves ~15px of horizontal real estate that the chip block can use.

## Validation
- typecheck ✓
- vitest 266/266 ✓
- per-game review: deferred. Score holds at 65.

## Notes
Runner backlog: only R-6 (soft retry transition) remains open — the rest are all done. Tamper has 2 (T-6 bottom-band, T-10 sample-without-replacement). Sentence has S-13/S-14/S-15 from the iter-4 reviewer's "blockers to 90". Errand has 0 open.
