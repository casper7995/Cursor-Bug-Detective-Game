# Iteration 23

**Date:** 2026-04-30
**Phase:** Phase 3 polish (shell)
**Target:** shell (validated 0)
**Items:** SH-6 (evidence row contrast) + SH-9 (cursor cue, retired)

## What landed
- **SH-6**: Empty evidence-slot `tok` element bumped from `opacity: 0.25` (em-dash, near-invisible) to `opacity: 0.55` with `_ _ _ _` placeholder text and 0.08em letter-spacing. Players now see the slots as fillable trackers rather than broken-empty UI. Filled state resets letter-spacing to normal.
- **SH-9** retired: there's already a `loupeEl` HTML element in hud.ts that follows the cursor and fades in on hoverable props. The "look cue" SH-9 asked for is already visible — it's just a visual element, not a native CSS cursor swap. Marked `[resolved by existing UX]`.

## Why
Shell-review agent: "Top HUD evidence row (MONITOR / ENVELOPE / AGENTS / LAMP) sits at top:24/left:24 but uses `_` placeholders and a near-black background — easy to miss as a tracker."

## Validation
- typecheck ✓
- vitest 267/267 ✓
- per-game review: deferred. Shell still has no validated baseline.

## Notes
Shell backlog: 4 open. SH-2 (desk hit-routing) is the highest-impact remaining but needs Playwright to validate. SH-7 (title→peel pacing), SH-8 (return-to-desk transition), SH-10 (audio bed) are polish.
