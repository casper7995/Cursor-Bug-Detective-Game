# Runner push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (onboarding + feel)

- [x] **R-1 Pre-run "READY → GO" overlay with key legend** — `INTRO_MS=1500` hold with `isIntroActive()` + `introProgress01()`; new `drawRunnerIntroOverlay`. Skip with SPACE/→. (+8) **[done iter-5]**
- [x] **R-2 Coyote-time + jump-buffer** — `COYOTE_TIME_MS=80`, `JUMP_BUFFER_MS=100`. State carries `lastGroundedAtMs`, `bufferedJumpAtMs`, `prevWantJump` (edge-detect). Tests: jump buffer fires on land + neutral init values. (+4) **[done iter-9]**
- [x] **R-3 Plank pre-fade warning** — `lifeT > 0.65` triggers red pulsing underline + 1px wobble (sin-based). Players see "leave NOW" before the floor disappears. (+3) **[done iter-14]**
- [x] **R-4 Speed-line FX during boost** — 6 motion lines scroll horizontally at varying lengths/y while `boostActive` is true; session pipes the flag through. Most-used input now has visible feedback. (+2) **[done iter-15]**

## Medium leverage

- [x] **R-5 Triple snippet pool** — generic pool 12 → 35 lines (detective-themed code + 4 narrative comment lines). Themed-per-anomaly still 3, but the 60% themed split means less repeat at any climb height. (+3) **[done iter-16]**
- [ ] **R-6 Soft retry transition** — `session.ts:150-165`. 200ms fade-out → reseed → fade-in to READY card. (+1)
- [x] **R-7 Clip plank/snippet rendering to viewport** — `clipToRect` wraps the plank/projectile/player render to `[0, RUNNER_HUD_TOP_PX + CLUE_STRIP_H ... W, H]`. World content can no longer bleed into the HUD or clue strip. (+3) **[done iter-14]**
- [x] **R-8 Truncate-on-word for clue strip** — `drawClueStrip` now uses shared `truncateOnWord`; chevron prefix is fixed and never gets eaten. (+2) **[done iter-16]**
- [x] **R-9 Clear prior canvas state before tutorial gate** — `restartSameMode` now clears the cached canvas + flips `texture.needsUpdate` so a fresh tutorial gate doesn't see the previous Game Over card behind it. (+1) **[done iter-15]**

## Polish

- [ ] **R-10 BOOST chip "0%" empty state** — `draw.ts:518` shows em-dash at boost ≤2%. Use `0%` + flat bar. (+1)
- [ ] **R-11 Move tier ribbon below HUD** — `draw.ts:818-819` y=30 overlaps mode label briefly. Move to y=58. (+1)
- [ ] **R-12 Drop duplicate `CLUE › ` label** — `draw.ts:267-287` "CLUE" + chevron + text duplicates meaning, eats horizontal space. (+1)
