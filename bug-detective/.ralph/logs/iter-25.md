# Iteration 25

**Date:** 2026-04-30
**Phase:** Phase 2 (shell — hit-routing)
**Target:** shell (validated 0)
**Item:** SH-2 — desk hit-routing inconsistency (lamp bleeding over envelope)

## What landed
- `lampHit` invisible hit-cylinder in `src/scene/desktopDiorama.ts:550-557`:
  - radius `0.18 → 0.13`
  - height `1.05 → 0.92`
  - centered y `0.55 → 0.42`
- The volume now hugs the actual lamp silhouette (neck + shade) rather than projecting a fat-cylinder shadow that, at certain camera angles, bled over the envelope's screen-space and stole envelope clicks.

## Why
Deep-sentence reviewer: "the desk's 3D hit testing kept routing the click off the envelope at this viewport (the lamp's invisible hit volume sits over the envelope's, see `desktopDiorama.ts:475-481`)."
Shell-review agent: same finding.

## Validation
- typecheck ✓
- vitest 267/267 ✓ (`preferredDeskHoverHit` tests still pass — the function is unchanged; the fix is in the geometry)
- per-game review: deferred. Shell still has no validated baseline.

## Risk
The new dimensions might miss legitimate clicks on the very top of the lamp shade if the camera is high. The neck/shade material is its own mesh that's also hoverable (`lampNeck` was added in the same neighborhood), so coverage is layered. If a future reviewer reports "lamp clicks miss," I'll widen to 0.15r as a middle ground.

## Notes
Shell backlog: only SH-10 left, marked deferred (audio asset, not engineering). All other shell items shipped in iter-21..25.

Total open items across all minigames + shell: 1 (deferred).
