# Tamper push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (gameplay + worst visible bugs)

- [x] **T-1 Wrap Bugbot claim line + intro body** — replace `fillText` at `tamper/draw.ts:479` and `:631-641` with `wrapAndDraw` (Phase 1.1). Truncated text is the worst visible defect in every screenshot. (+5) **[done iter-01]**
- [ ] **T-2 Punch up subtle prop variants** — in `tamper/draw.ts:902-1206`, rewrite invisible variants: `puddle_oil`, `book_shifted`, `lampshade_tape`, `ledger_fold`, `signature_loopy`, `stamp_offset`. AND raise `sketchSize` ceiling from 18 → 24. (+6)
- [x] **T-3 Persist real-tamper reveal on success + on result card** — `tamperSession.ts:484-485` change `showRealTamper = phase.kind === "verdict" || phase.kind === "result"`. Surface tampered prop's label on result card. (+3) **[done iter-02]**

## Medium leverage

- [x] **T-4 Pick-mode hint copy** — change `"Click the real changed row in TONIGHT (left)."` to `"Click the changed prop in TONIGHT."` at `draw.ts:528`. Stale refactor copy. (+1) **[done iter-01]**
- [ ] **T-5 Hold verdict flash 1.2s** — bump `VERDICT_FLASH_S` at `tamperSession.ts:59` from 0.6 → 1.2. Especially needed for confident catches at +500. (+2)
- [ ] **T-6 Bottom-band collision** — gutter at `diffY+diffH+9` overlaps bottom strip at `H-18`. Move gutter to `diffY+diffH+4` OR drop during call/pick (duplicates info). (+2)
- [x] **T-7 "No clue earned" feedback** — when `tamperEarnsDeskClue` returns false, show line on result card: "needed: 3+ correct AND 1+ caught lie." (+2) **[done iter-02 — folded into T-3's teach line]**

## Polish

- [ ] **T-8 Per-prop hover state in pick-mode** — track pointer-over spot, brighten hovered prop vs others. Currently all 5 equally lit. (+2)
- [ ] **T-9 Clamp Bugbot pointer arrow** — for left/top-edge props, `ax = cx - r - 10` falls outside panel. Clamp arrow tail position. (+1)
- [ ] **T-10 Sample-without-replacement Bugbot picks** — `pickIndicesForLies` and call-spot picks use replacement; player commonly sees same prop pointed at 2-3 times in one round. Force coverage of all 5 spots before resampling. (+1)
