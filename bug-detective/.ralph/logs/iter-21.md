# Iteration 21

**Date:** 2026-04-30
**Phase:** Phase 3 polish (shell)
**Target:** shell (validated 0; first shell iteration)
**Items:** SH-1 (case-file body trim) + SH-4 (status prompt shorten)

## What landed
- **SH-1**: `CASE_FILE_BODY_LINES` in `src/ui/gameInstructions.ts` rewritten. Was 3 dense bullets including a 165-char control dump (Esc / Exit / Wider / scroll / − / + / X). Now 3 short verbs:
  - "Scan the desk — one prop is wrong today."
  - "Open four stations to fill your clue board."
  - "Make the call when Evidence hits 4/4."
  Detailed controls already exist in the `?howto=1` modal so nothing is lost.
- **SH-4**: HUD top-center prompt shortened from "sweep the desk — hover props and trust your tooltip" (49 chars) to "sweep the desk — trust the tooltip" (32 chars). Two call sites in `main.ts`. Should fit on one line at typical viewport widths and not bleed into the monitor screen content behind it.

## Validation
- typecheck ✓
- vitest 267/267 ✓
- per-game review: deferred (Playwright unavailable). Shell still has no validated baseline.

## Notes
Shell backlog has 8 items remaining: SH-2 (desk hit-routing), SH-3 (tooltip overlap with HUD), SH-5 (chrome ?/× collision in minigames), SH-6 (HUD evidence row contrast), SH-7 (title→peel pacing), SH-8 (return-to-desk transition), SH-9 (cursor on hover), SH-10 (audio bed).

The two highest-leverage remaining are SH-3 and SH-5 (visible in screenshots).
