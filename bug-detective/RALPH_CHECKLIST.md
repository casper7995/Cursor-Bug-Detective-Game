# Ralph-loop checklist — Bug Detective final polish

The loop runs against this file. Each iteration picks the **topmost unchecked
item**, does the work, ticks the box with a one-line log, runs `npm run verify`,
commits, and stops until the next tick.

**Stop condition:** when every box below is checked, the iteration prompt must
print `ALL GREEN` and refuse to act. The user stops the loop manually.

**Open questions** (block items flagged `[?]` below; a human must decide before
the loop can tick them):

- _(none yet)_

---

## 1. Entry + prop interaction (smoothness)

- [ ] Title splash → page peel plays without camera pop or bloom flash on cold load (`?reset=1`)
- [ ] Skip-intro path (returning visitor, `bd:skipIntro=1`) lands directly on desk with HUD visible
- [ ] Mobile gate appears on `?mobile=1`, dismissable, boots simplified variant (no page-peel, no mascot hop)
- [ ] WebGL-unavailable fallback card displays and never white-screens (force via `?forceNoWebGL=1` if supported, otherwise stub `createScene` to throw)
- [ ] Every anomaly target prop triggers hover tooltip + magnifying-glass cursor: `calendar`, `mug`, `reagent-tray`, `monitor-screen`, `case-file`, `evidence-envelope`, `lamp-shadow`, `coffee-steam`, `keyboard`, `plant`, `lamp`, `desk`
- [ ] No dead-zones: hovering the visible silhouette of each prop registers within ~4px of its edge
- [ ] Esc reliably exits minigame overlays (all 4) and inspect-zoom
- [ ] Tab / Enter / 1/2/3 hotkeys all work in sentence-game pick phase
- [ ] Browser devtools console: zero errors, zero warnings across one full 90s round on Chrome latest
- [ ] Same, Firefox latest
- [ ] Same, Safari latest (or `webkit` Playwright preview)

## 2. Mini-game playability (all four)

### Runner (monitor)
- [ ] Tutorial gate dismiss persists across session (localStorage `bd:miniTutorial:runner`)
- [ ] Daily run reaches 2600m goal cleanly on at least one anomaly seed
- [ ] Endless mode unlocks after first daily clear; tier ribbon renders
- [ ] Clue-highlight tokens visible on planks at height ≥ 200m
- [ ] No frame-time spikes > 33ms during 30s continuous climb (measure via `performance.now()` in dev)
- [ ] Returns `MiniGameOutcome` with `clueToken` == uppercased `gameClueWords.runner` and `score` in [0, 1000]

### Sentence (envelope)
- [ ] Tab autocomplete accepts `blue` option instantly
- [ ] 2.5s idle timeout commits `idle` and advances
- [ ] Typewriter speed feels paced (no "waiting forever" and no "can't read")
- [ ] All 3 slots completable; result card renders
- [ ] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForSentence(gameClueWords.sentence)` and `score` in [0, 1000]

### Errand (reagent tray)
- [ ] Drag-and-drop hitboxes cover full visible agent row
- [ ] All helpers can be assigned; auto-dispatch fallback works
- [ ] Abort/push modal for trap tasks renders with clear visual affordance
- [ ] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForErrand(gameClueWords.errand)` and `score` in [0, 1000]
- [ ] Zero-clue exit path is graceful (no broken results panel)

### Tamper (lamp)
- [ ] Side-by-side spot hitboxes accurate (click within spot's visual bound)
- [ ] At least 4 spots per round
- [ ] Wrong-click feedback is graceful (shake / red flash, no progress wipe unless spec'd)
- [ ] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForTamper(gameClueWords.tamper)` and `score` in [0, 1000]

## 3. Creative final-answer rubric (cipher)

- [ ] For every anomaly, all four `gameClueWords` tokens (runner, sentence, errand, tamper) do NOT appear as case-insensitive substrings of `correctChoice` or any `distractorPool` entry — enforced by `tests/clueRiddle.test.ts`
- [ ] Every `gameClueWords` value is 3–8 chars, `[A-Za-z]+`, uppercase on emission (enforced by test)
- [ ] Every anomaly's 4 cipher tokens are mutually distinct (enforced by test)
- [ ] Answer panel evidence label reframed to cue "riddle" framing (e.g. `"the desk whispers:"` or `"four clues, one culprit:"`)
- [ ] `distractorPool` for every anomaly contains ≥ 5 entries so picker has range; add cipher-plausible distractors where the current pool is too "obviously wrong"
- [ ] At least 2 distractors per anomaly plausibly fit the cipher phrase (prevents trivial elimination) — subjective, logged per-anomaly in `PLAYTEST_LOG.md`
- [ ] Playthrough log confirms "aha" reaction for ≥ 10/12 anomalies (subjective, one line per anomaly in `PLAYTEST_LOG.md`)

## 4. Tests + ship-readiness

- [ ] `npm test` green (all existing suites)
- [ ] New `tests/clueRiddle.test.ts` passes (cipher rubric: length, charset, uniqueness, no-substring)
- [ ] No test left skipped / `.only` / `.skip` in changed files
- [ ] `npm run build` succeeds (tsc typecheck + vite bundle)
- [ ] `npm run verify` succeeds end-to-end (test + build + `scripts/check-jam-widget.sh`)
- [ ] `bug-detective/PLAYTEST_LOG.md` exists with one line per anomaly: `entered / clues / answer / jank`
- [ ] Branch `claude/test-fix-game-mechanics-R4FBe` pushed with all commits; no uncommitted changes

---

## Iteration log

The loop appends one short line here per tick. Newest at top.

- _(no iterations yet — first loop tick will add an entry)_
