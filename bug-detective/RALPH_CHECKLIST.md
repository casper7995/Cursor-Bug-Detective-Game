# Ralph-loop checklist — Bug Detective final polish

The loop runs against this file. Each iteration picks the **topmost unchecked
item**, does the work, ticks the box with a one-line log, runs `npm run verify`,
commits, and stops until the next tick.

**Stop condition:** when every box below is checked, the iteration prompt must
print `ALL GREEN` and refuse to act. The user stops the loop manually.

**Open questions** (block items flagged `[?]` below; a human must decide before
the loop can tick them):

- [?] `§1-interactive`: this ralph-loop is running in a headless cloud env with
  no browser. Every §1 item, several §2 items (UI-driven runner/sentence/errand/tamper
  interactions), and the §3 "aha" / "≥2 distractors fit cipher" items need a
  human playthrough or a scripted browser (Playwright). Options:
  (A) human runs the checklist's "Manual end-to-end check" list in a browser and
  pastes results into `PLAYTEST_LOG.md`, then the loop can tick these;
  (B) add Playwright to the repo and script the checks (new dependency, needs
  explicit approval per the no-new-deps rule);
  (C) accept `[~]` (partial) for interactive items and ship on the code-level
  guarantees (tests + build + verify green).
  Waiting on human.

---

## 1. Entry + prop interaction (smoothness)

- [?] Title splash → page peel plays without camera pop or bloom flash on cold load (`?reset=1`) — blocked on §1-interactive
- [?] Skip-intro path (returning visitor, `bd:skipIntro=1`) lands directly on desk with HUD visible — blocked on §1-interactive
- [?] Mobile gate appears on `?mobile=1`, dismissable, boots simplified variant (no page-peel, no mascot hop) — blocked on §1-interactive
- [?] WebGL-unavailable fallback card displays and never white-screens (force via `?forceNoWebGL=1` if supported, otherwise stub `createScene` to throw) — blocked on §1-interactive
- [?] Every anomaly target prop triggers hover tooltip + magnifying-glass cursor: `calendar`, `mug`, `reagent-tray`, `monitor-screen`, `case-file`, `evidence-envelope`, `lamp-shadow`, `coffee-steam`, `keyboard`, `plant`, `lamp`, `desk` — blocked on §1-interactive
- [?] No dead-zones: hovering the visible silhouette of each prop registers within ~4px of its edge — blocked on §1-interactive
- [?] Esc reliably exits minigame overlays (all 4) and inspect-zoom — blocked on §1-interactive
- [?] Tab / Enter / 1/2/3 hotkeys all work in sentence-game pick phase — blocked on §1-interactive
- [?] Browser devtools console: zero errors, zero warnings across one full 90s round on Chrome latest — blocked on §1-interactive
- [?] Same, Firefox latest — blocked on §1-interactive
- [?] Same, Safari latest (or `webkit` Playwright preview) — blocked on §1-interactive

## 2. Mini-game playability (all four)

### Runner (monitor)
- [?] Tutorial gate dismiss persists across session (localStorage `bd:miniTutorial:runner`) — blocked on §1-interactive
- [?] Daily run reaches 2600m goal cleanly on at least one anomaly seed — blocked on §1-interactive
- [?] Endless mode unlocks after first daily clear; tier ribbon renders — blocked on §1-interactive
- [?] Clue-highlight tokens visible on planks at height ≥ 200m — blocked on §1-interactive
- [?] No frame-time spikes > 33ms during 30s continuous climb (measure via `performance.now()` in dev) — blocked on §1-interactive
- [x] Returns `MiniGameOutcome` with `clueToken` == uppercased `gameClueWords.runner` and `score` in [0, 1000] — verified at main.ts:1392 (`clueToken: picked.def.gameClueWords.runner.toUpperCase()`); score clamped 0..1000 in runner scoring

### Sentence (envelope)
- [?] Tab autocomplete accepts `blue` option instantly — blocked on §1-interactive
- [?] 2.5s idle timeout commits `idle` and advances — blocked on §1-interactive
- [?] Typewriter speed feels paced (no "waiting forever" and no "can't read") — blocked on §1-interactive
- [?] All 3 slots completable; result card renders — blocked on §1-interactive (note: sentence is 4 slots per template, not 3 — checklist typo, see open questions)
- [x] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForSentence(gameClueWords.sentence)` and `score` in [0, 1000] — verified at sentenceSession.ts:272 + main.ts:565 (session constructed with `clueWord: words.sentence`, outcome uses `clueTokenForSentence(this.clueWord)`)

### Errand (reagent tray)
- [?] Drag-and-drop hitboxes cover full visible agent row — blocked on §1-interactive
- [?] All helpers can be assigned; auto-dispatch fallback works — blocked on §1-interactive (note: auto-dispatch path is coded in errandSession.ts:234-246)
- [?] Abort/push modal for trap tasks renders with clear visual affordance — blocked on §1-interactive
- [x] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForErrand(gameClueWords.errand)` and `score` in [0, 1000] — verified at errandSession.ts:388 + main.ts:575
- [x] Zero-clue exit path is graceful (no broken results panel) — verified at errandSession.ts:383-386 (`if (clues === 0) this.onExit(); return;` — session exits cleanly without emitting outcome)

### Tamper (lamp)
- [?] Side-by-side spot hitboxes accurate (click within spot's visual bound) — blocked on §1-interactive
- [x] At least 4 spots per round — verified by tamper.test.ts "round has 6 calls and exactly one tampered spot" + tamper/round.ts TAMPER_CALLS_PER_ROUND = 6 (6 ≥ 4)
- [?] Wrong-click feedback is graceful (shake / red flash, no progress wipe unless spec'd) — blocked on §1-interactive
- [x] Returns `MiniGameOutcome` with `clueToken` == `clueTokenForTamper(gameClueWords.tamper)` and `score` in [0, 1000] — verified at main.ts:584 (session constructed with `clueWord: words.tamper`, outcome uses `clueTokenForTamper(this.clueWord)`)

## 3. Creative final-answer rubric (cipher)

- [x] For every anomaly, all four `gameClueWords` tokens (runner, sentence, errand, tamper) do NOT appear as case-insensitive substrings of `correctChoice` or any `distractorPool` entry — enforced by `tests/clueRiddle.test.ts` (passing, 12 anomalies × 4 tokens)
- [x] Every `gameClueWords` value is 3–8 chars, `[A-Za-z]+`, uppercase on emission (enforced by test)
- [x] Every anomaly's 4 cipher tokens are mutually distinct (enforced by test)
- [x] Answer panel evidence label reframed to cue "riddle" framing — now `"four clues, one culprit:"` at answerPanel.ts:64
- [x] `distractorPool` for every anomaly contains ≥ 5 entries so picker has range (enforced by `distractorPool has at least 5 entries` in clueRiddle.test.ts)
- [?] At least 2 distractors per anomaly plausibly fit the cipher phrase (prevents trivial elimination) — subjective, logged per-anomaly in `PLAYTEST_LOG.md` — blocked on §1-interactive
- [?] Playthrough log confirms "aha" reaction for ≥ 10/12 anomalies (subjective, one line per anomaly in `PLAYTEST_LOG.md`) — blocked on §1-interactive

## 4. Tests + ship-readiness

- [x] `npm test` green (all existing suites) — 146/146 passing as of commit e6ee1b4
- [x] New `tests/clueRiddle.test.ts` passes (cipher rubric: length, charset, uniqueness, no-substring)
- [x] No test left skipped / `.only` / `.skip` in changed files — grep confirms none in `tests/`
- [x] `npm run build` succeeds (tsc typecheck + vite bundle) — dist bundle 962KB / 259KB gz
- [x] `npm run verify` succeeds end-to-end (test + build + `scripts/check-jam-widget.sh`) — exit 0
- [x] `bug-detective/PLAYTEST_LOG.md` exists with one line per anomaly (seed template; playthrough cells awaiting browser session — blocked on §1-interactive for the actual y/n fills)
- [x] Branch `claude/test-fix-game-mechanics-R4FBe` pushed with all commits; no uncommitted changes (verified post-commit)

---

## Iteration log

The loop appends one short line here per tick. Newest at top.

- 2026-04-21 — audit-sweep — ticked all items satisfied by commit e6ee1b4 (§2 code-level outcome items, §3.1-5 cipher rubric, §4.1-5/7); created PLAYTEST_LOG.md seed; filed `§1-interactive` open question blocking 21 browser-only items pending human decision (human playthrough / Playwright / accept `[~]`)
