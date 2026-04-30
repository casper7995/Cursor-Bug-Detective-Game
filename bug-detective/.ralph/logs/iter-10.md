# Iteration 10

**Date:** 2026-04-30
**Phase:** Phase 3 polish
**Target:** errand (last validated 64; 4 unrev'd improvements pending)
**Item:** E-11 — tutorial Start button vs caption collision

## What landed
- Removed the redundant caption `left queue · 1/2/3 lanes · bugs march ←` from `drawErrandTutorialDiagram`. The lane rows already label themselves with "Fix / Rev / Wall" + "1/2/3", and the orange strips on the right of each lane already convey "bugs march ←" visually. The caption was clipping under the gate's bottom-anchored Start button.

## Reviewer dispatched
Spawned errand reviewer agent a513e5e79b3d65da5 with full change list since iter-3 review:
- iter-3: boss telegraph + GO + tutorial wrap + autoclose removed + footer + dual title dropped
- iter-7 (E-4): feedbackFx system + BASE shake
- iter-8 (E-5): clue-lock fill pill
- iter-10 (E-11): tutorial caption removed

If Playwright responds, expect significant uplift from 64.

## Validation
- typecheck ✓
- vitest 263/263 ✓
- per-game review: in flight (background agent)
