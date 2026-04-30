# Runner push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (onboarding + feel)

- [ ] **R-1 Pre-run "READY → GO" overlay with key legend** — new `intro` phase in `session.ts`, render in `draw.ts`. 1.5s overlay before scroll: large "READY" → "GO!", legend `SPACE jump · → boost`. Skip with any key. **+8 alone — fixes the "void-die before learning boost exists" cliff.**
- [ ] **R-2 Coyote-time + jump-buffer** — `sim.ts:660-668`. 80ms grace after walking off, 100ms input buffer. Standard platformer feel-fix. (+4)
- [ ] **R-3 Plank pre-fade warning** — `draw.ts:733-769`. When alpha < 0.35, pulse red + 1px shake. Tells player "leave NOW." (+3)
- [ ] **R-4 Speed-line FX during boost** — new fx layer in `draw.ts`, triggered while `wantBoost`. 4-6 horizontal motion lines + 1.02× zoom. Most exciting input has smallest visual reaction today. (+2)

## Medium leverage

- [ ] **R-5 Triple snippet pool** — `runner/snippets.ts:12-83`. 12 generic → 30+, 3 themed/anomaly → 8+. Eliminates third-minute-looks-like-first-minute fatigue. (+3)
- [ ] **R-6 Soft retry transition** — `session.ts:150-165`. 200ms fade-out → reseed → fade-in to READY card. (+1)
- [ ] **R-7 Clip plank/snippet rendering to viewport** — Phase 1.4 helper. Snippets bleed above HUD today. (+3)
- [ ] **R-8 Truncate-on-word for clue strip** — `draw.ts:278-285`, use Phase 1.2 helper. Mid-word breaks today. (+2)
- [ ] **R-9 Clear prior canvas state before tutorial gate** — Game Over + tutorial render simultaneously. Bug, not polish. Whoever calls `tryMountRunnerTutorialGate`. (+1)

## Polish

- [ ] **R-10 BOOST chip "0%" empty state** — `draw.ts:518` shows em-dash at boost ≤2%. Use `0%` + flat bar. (+1)
- [ ] **R-11 Move tier ribbon below HUD** — `draw.ts:818-819` y=30 overlaps mode label briefly. Move to y=58. (+1)
- [ ] **R-12 Drop duplicate `CLUE › ` label** — `draw.ts:267-287` "CLUE" + chevron + text duplicates meaning, eats horizontal space. (+1)
