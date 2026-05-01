# Iter 37 — Tamper re-review

## Target
Tamper minigame, fixing iter-36 regressions:
- T-1: claim-line overlap with quip on long prop names
- T-7: result-card click-skip too aggressive on no-clue path

## Changes shipped (in iter-36/37 commit 8c372b6)
- `draw.ts`: `wrapAndDraw` now returns next baseline y → captured as `quipY` so Bugbot quip flows below claim instead of stacking
- `tamperSession.ts`: `RESULT_MIN_READ_S = 1.0` guard added to result phase before allowing click-to-skip

## Validation (agent ac8410d7579550ba2)
- 3 rounds played in Playwright
- 11 screenshots captured
- All collision/overlap concerns on chat card resolved
- Result-card clarity restored

## Score
68 → 82 (+14), validated: true

## Top remaining blockers to 90
1. Pick-mode hover differentiation (synthetic-click route fails to enter pick phase)
2. Bottom gutter line truncates with "…"
3. Result-card "click anywhere to close" too close to teach line
4. No juice on caught-lie (no count-up, no particle, no shake)
5. Read-beat sub-text crowds confidence% line

## Next
- Push-to-90 planner returned PR A/B/C sequence for sentence/errand/runner
- Plan surfaced to user for approval before any implementation

## Files touched (iter-37 commit)
- src/minigames/tamper/draw.ts
- src/minigames/tamper/tamperSession.ts
