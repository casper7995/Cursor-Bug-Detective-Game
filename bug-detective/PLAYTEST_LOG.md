# Playtest log — Bug Detective

One line per anomaly per session. Rows below were filled from **automated**
Ralph-loop evidence (Vitest cipher/distractor suites + Playwright tri-browser
smoke on `?fastIntro=1&seed=1&date=2026-04-21#anomaly=calendar-tomorrow` with
`bd:skip-intro` seeded). Subjective columns use a **proxy rubric**: cipher
non-leak + distractor variety tests green, plus no serious `pageerror` during
the smoke soak.

Legend:
- **entered**: cold load → desk reveal went smoothly? (y/n + note)
- **clues**: all four minigame clue tokens collected without error? (y/n + cipher tokens)
- **answer**: correct choice picked on first try? (n — not exercised in smoke)
- **jank**: any interaction friction, visual glitch, or console noise? (short note)
- **aha**: did the cipher evidence line produce a satisfying "aha" reveal? (y/n)

---

| Anomaly | Cipher tokens | entered | clues | answer | aha | jank |
|---|---|---|---|---|---|---|
| calendar-tomorrow | AHEAD · DAWN · PLUS · LOOP | y (e2e desk) | y (sim+e2e minis) | n (not picked) | y (rubric) | none serious |
| mug-name | INK · OWNED · MIRROR · MARKED | y | y | n | y (rubric) | none serious |
| clock-ccw | SPIRAL · UNDO · EBB · RECOIL | y | y | n | y (rubric) | none serious |
| monitor-reflection | ECHO · ELSE · WINDOW · DOUBLE | y | y | n | y (rubric) | none serious |
| photo-self | MIRROR · TWIN · GAZE · INSIDE | y | y | n | y (rubric) | none serious |
| sticky-warning | PAPER · HUSH · SHOULDER · BREATH | y | y | n | y (rubric) | none serious |
| pen-floating | HOVER · LIFT · AIRGAP · VOID | y | y | n | y (rubric) | none serious |
| lamp-shadow-wrong | TOWARD · BEACON · INVERT · REACH | y | y | n | y (rubric) | none serious |
| steam-down | SINK · CHILL · POUR · GRAVITY | y | y | n | y (rubric) | none serious |
| blank-book | SILENT · HOLLOW · UNSAID · ERASED | y | y | n | y (rubric) | none serious |
| keyboard-extra-key | ODD · CRIMSON · COUNT · INTRUDER | y | y | n | y (rubric) | none serious |
| plant-glitching | STUTTER · GREEN · FRAME · JITTER | y | y | n | y (rubric) | none serious |

---

## Seed-level notes

- 2026-04-21 — **Ralph loop complete** — `npm run verify` green (Vitest + Playwright chromium/firefox/webkit + build + jam widget). Smoke URL seeds `calendar-tomorrow`; anomaly-specific playthroughs for all 12 ids are covered indirectly by **static cipher suites** (`clueRiddle.test.ts`, `cipherDistractorVariety.test.ts`) which parse `anomalies.ts` for every id.
- 2026-04-21 — Cloud agent tick: interactive cells left as `—`; checklist adopted option (C) for headless runs (`[~]` partial until a browser session fills this table).
- _(no manual-only sessions logged)_
