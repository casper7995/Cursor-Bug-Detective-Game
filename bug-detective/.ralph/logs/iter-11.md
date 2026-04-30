# Iteration 11

**Date:** 2026-04-30
**Phase:** Phase 3 polish
**Target:** sentence (validated 78 last; iter-4 reviewer's top 2 blockers)
**Items:** S-11 (longer result hold) + S-12 (no chrome overlap on result)

## What landed
- `RESULT_AUTOCLOSE_S` 3.4 → 12. The 8-line paragraph needs time. Click still advances any time.
- During `phase.kind === "result"`:
  - Title strip "Tab cycles · Enter accepts · case_file.md" is hidden
  - Progress dots are hidden
  - `drawDeskChromeAi` (the ?/× buttons) is hidden
  The share card now owns the screen. Tutorial gate still draws on top (intentional).

## Why
Sentence iter-4 reviewer flagged these as blockers #1 and #2 toward 90:
1. "Result card auto-closes after 3.4s — too short to read an 8-sentence paragraph"
2. "Result card overlaps title strip and ?/X chrome buttons — content visibly bleeds through behind the scrim"

## Validation
- typecheck ✓
- vitest 263/263 ✓
- per-game review: deferred (Playwright MCP unavailable; iter-4 reviewer was the last successful playthrough). Score holds at 78.

## Notes
Three items remain on the path to 90 for sentence: S-13 (score count-up + ending flash), S-14 (per-pick commit flash), S-15 (beat escalation). All Phase 3 polish; none risky.
