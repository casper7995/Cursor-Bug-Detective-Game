# Iteration 24

**Date:** 2026-04-30
**Phase:** Phase 3 polish (shell)
**Target:** shell (validated 0)
**Items:** SH-7 (title→peel pacing) + SH-8 (return-to-desk transition)

## What landed
- **SH-7**: Title splash JS dismiss `setTimeout` 350→220ms + CSS `transition: opacity` 320ms→200ms. The splash now lifts faster after click/key so the original page-peel reveal is the focal beat instead of waiting through a long fade.
- **SH-8**: `endDeskMiniFromOverlay` overlay `fadeOut` 180→280ms. The 420ms camera move back to the desk now has the overlay riding it; previously the overlay snapped out at 180ms and then the camera trailed for 240ms more, exposing the desk while the user expected the overlay to be in control. Now the overlay finishes ~150ms before the camera arrives, which feels intentional.

## Why
Shell-review agent: "the title splash is generic Apple-aesthetic, the page-peel is original but the case-file modal is a wall of rules — it should sell *atmosphere* before mechanics."
Shell-review agent: "after a minigame the camera snaps back. Add a brief fade or zoom-out."

## Validation
- typecheck ✓
- vitest 267/267 ✓
- per-game review: deferred. Shell still no validated baseline.

## Notes
Shell backlog: 2 open. SH-2 (desk hit-routing) needs Playwright; SH-10 (audio bed) is content work.
