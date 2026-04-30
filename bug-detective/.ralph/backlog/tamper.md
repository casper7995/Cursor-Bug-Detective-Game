# Tamper push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (gameplay + worst visible bugs)

- [x] **T-1 Wrap Bugbot claim line + intro body** — replace `fillText` at `tamper/draw.ts:479` and `:631-641` with `wrapAndDraw` (Phase 1.1). Truncated text is the worst visible defect in every screenshot. (+5) **[done iter-01]**
- [x] **T-2 Punch up subtle prop variants** — rewrote 6 subtle variants (stamp_offset rotated+shifted, signature_loopy red big-loop, ledger_fold filled triangular flap, lampshade_tape wide orange strip, puddle_oil 3-color iridescent, book_shifted dashed ghost outline + bigger rotation). Raised sketchSize ceiling 18→22. (+6) **[done iter-6]**
- [x] **T-3 Persist real-tamper reveal on success + on result card** — `tamperSession.ts:484-485` change `showRealTamper = phase.kind === "verdict" || phase.kind === "result"`. Surface tampered prop's label on result card. (+3) **[done iter-02]**

## Medium leverage

- [x] **T-4 Pick-mode hint copy** — change `"Click the real changed row in TONIGHT (left)."` to `"Click the changed prop in TONIGHT."` at `draw.ts:528`. Stale refactor copy. (+1) **[done iter-01]**
- [x] **T-5 Hold verdict flash 1.2s** — `VERDICT_FLASH_S` 0.6 → 1.2. (+2) **[done iter-12]**
- [ ] **T-6 Bottom-band collision** — gutter at `diffY+diffH+9` overlaps bottom strip at `H-18`. Move gutter to `diffY+diffH+4` OR drop during call/pick (duplicates info). (+2)
- [x] **T-7 "No clue earned" feedback** — when `tamperEarnsDeskClue` returns false, show line on result card: "needed: 3+ correct AND 1+ caught lie." (+2) **[done iter-02 — folded into T-3's teach line]**

## Polish

- [x] **T-8 Per-prop hover state in pick-mode** — `hoveredPropId` set in pointer-move during `disagree-point`; hovered prop gets brighter solid ring + larger radius vs others. (+2) **[done iter-12]**
- [x] **T-9 Clamp Bugbot pointer arrow** — `drawBugbotPointer` now takes the panel rect and clamps `ax`/`ay` so the arrow tail + "bot" tag stay inside the TONIGHT panel for edge spots. (+1) **[done iter-12]**
- [ ] **T-10 Sample-without-replacement Bugbot picks** — `pickIndicesForLies` and call-spot picks use replacement; player commonly sees same prop pointed at 2-3 times in one round. Force coverage of all 5 spots before resampling. (+1)
