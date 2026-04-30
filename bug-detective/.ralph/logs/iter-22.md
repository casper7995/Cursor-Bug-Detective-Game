# Iteration 22

**Date:** 2026-04-30
**Phase:** Phase 3 polish (shell)
**Target:** shell (validated 0)
**Items:** SH-3 (tooltip overlap with HUD) + SH-5 (chrome visual competition with titles)

## What landed
- **SH-3**: `hud.ts:setHover` now picks the tooltip's transform based on cursor y. When `mouseClient.y < 110` (HUD safe zone covering evidence row + status text), the tooltip flips to render BELOW the cursor (`translate(-50%, 14px)`) instead of the default ABOVE. Eliminates orange-pill-over-evidence-row overlaps.
- **SH-5**: `drawDeskChromeAi` chip background dropped from `rgba(253,253,250,0.9)` → `rgba(253,253,250,0.55)` and glyphs muted from solid `#5a554a` → `rgba(90, 85, 74, 0.85)`. The chrome buttons still read as buttons but no longer visually compete with each minigame's title strip in the same y-band. The actual hit-rects are unchanged so click affordance is preserved.

## Why
Shell-review agent flagged both:
- "Hover-tooltips render in canvas above the 3D scene as orange pills (e.g. 'monitor', 'desk') and overlap the HUD HTML overlay text on top."
- "The desk chrome `?` and `×` buttons sit in the top-right of every minigame at internal y=10 — they collide with each minigame's own title strip drawn at y=26."

## Validation
- typecheck ✓
- vitest 267/267 ✓
- per-game review: deferred. Shell still has no validated baseline.

## Notes
Shell backlog: 6 open. SH-2 (desk hit-routing inconsistency) and SH-6 (HUD evidence row contrast) are next-highest leverage.
