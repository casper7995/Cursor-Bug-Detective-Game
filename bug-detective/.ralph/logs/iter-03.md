# Iteration 3

**Date:** 2026-04-30
**Phase:** Phase 2 (per-game gameplay surgery)
**Target:** errand (lowest score, was 58)
**Items:** E-2, E-3, E-6, E-7, E-8, E-9, E-10 (multi-item batch)

## What landed
- **E-3**: `firstBossWave` 4 → 2; cadence changed to "first-then-every-3" so wave 2/5/8 are bosses (was 4/8 only).
- **E-2**: `bossWarningActive(rt)` helper in `errand/round.ts`. Renderer shows "⚠ ZERO-DAY INBOUND" pulsing ribbon spanning the playfield top when a Zero-Day is within `bossWarningLeadSec` (9s) of spawn.
- **E-6**: Queue card label "HEAD READY" → "GO" — fits the available x-range without colliding with the recharge ring.
- **E-7**: Tutorial gate bullets wrap via shared `wrapAndDraw`; layout estimator (`estimateBulletsBlock`) measures wrapped lines so card grows accordingly.
- **E-8**: `DEFEAT_AUTOCLOSE_S` removed; defeat result holds until click (existing pointer handler advances).
- **E-9**: Dropped redundant "> CURSOR AGENTS // DEFEND_DESK" panel heading; replaced with cyan WAVE pill that sits next to the breadcrumb.
- **E-10**: Footer hint shortened: "1/2/3 deploy lane · click queue to promote · ESC exit"

## Reviewer score
**58 → 64 (+6)**, validated by Playwright agent (10 screenshots saved to `/Users/caspe/minigame-review/errand/iter-3/`).

## Two regressions found in same iteration (both fixed before commit)
- **R1: Boss ribbon overlay BASE/CAP meters** — original placement at `panelY + 28` clashed with the meter labels at `panelY + 26`. **Fixed**: moved ribbon to span the playfield top (`fieldTopOffset - 14`), pulsing with `Math.sin(elapsed * 6)`, doesn't overlap header.
- **R2: Tutorial Start button overlapping diagram** — `bulletsBlock` estimator was using old static formula. **Fixed**: rewrote estimator to mirror new draw loop (15px per wrapped line + 3px gap + tail pad).

## Validation
- typecheck ✓
- vitest 260/260 ✓ (added `first boss arrives on configured wave` test)
- per-game review: validated true, 64/100
- Reviewer flagged remaining blockers to 90 — captured in `.ralph/backlog/errand.md` for future iterations

## New top backlog item flagged by reviewer
**Passive defeat:** spam-Fixer-in-all-lanes is still dominant; reaching score cap with do-nothing play in 3+ minutes. This is E-1 (differentiate units) and is the single biggest remaining item.

## Loop spec changes (user requested mid-iteration)
- Added `/simplify` gate after every key stage
- Added Playwright/Chrome cleanup at end of each reviewer
- Added commit gate after every successful per-game iteration
- Added asset cleanup gate
- Removed iteration cap (no `--max-iterations`)
- Added 5th scoring target: **shell experience** (game start, opening entry, exploration smoothness)

## Next iteration target
Per loop rules: lowest non-shell score is sentence (64) tied with errand (64). Pick sentence next — its top item S-1 (kill answer-key spoilers) is a 3-line change worth +15 alone.

After that: errand E-1 (gameplay surgery for unit differentiation), then runner R-1 (READY/GO overlay), then tamper T-2 (subtle prop variants).

Shell needs a baseline review before its push-to-90 plan can start.
