# Iteration 26

**Date:** 2026-04-30
**Phase:** Phase 3 polish (sentence — missed items round-up)
**Target:** sentence (validated 78)
**Items:** S-2 (editor auto-scroll) + S-6/S-7 (title strip collapse) + S-8 (progress dots inside canvas) + S-5 retired

## What landed
- **S-2**: `drawEditorScene` no longer clips after 8 lines. New `maxLines = floor((editorH-32-12)/16)` and `startLine = max(0, allLines.length - maxLines)`. Renders the LAST `maxLines` lines so the typing edge stays visible. Line-number column shows the absolute index, not the rendered offset.
- **S-6 / S-7**: Title strip collapsed from `[Tab cycles · Enter accepts] [· case_file.md]` (with hardcoded x=162 collision) to just `case_file.md` at x=18. The Tab/Enter affordance is already in the popover footer next to the picks where it belongs.
- **S-8**: Progress dots now anchor to the editor right edge with 12px spacing. baseX = `editorRight - (total-1)*12` so all 8 dots fit on a 512px canvas (was last-dot at x=600).
- **S-5** retired — the per-pick reveal beat S-5 asked for is what S-14 (iter-19) shipped: picked-row glow flash for 280ms before advancing.

## Why
Sentence iter-4 reviewer flagged S-2 as blocker #2 toward 90 ("the player can't see the prefix they're being asked to complete past slot 6"). S-6, S-7, S-8 were shell-review agent's collision findings.

## Validation
- typecheck ✓
- vitest 267/267 ✓
- per-game review: deferred. Score holds at 78.

## Notes
Sentence backlog: only S-3 (loosen 6/8 fail gate) remains open. That's a balance change — defer until reviewer can validate. Total open items across all minigames + shell: 2 (S-3 deferred for balance review, SH-10 deferred for audio asset).
