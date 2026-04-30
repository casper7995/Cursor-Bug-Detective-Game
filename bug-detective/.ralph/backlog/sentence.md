# Sentence push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (the gameplay-critical items)

- [x] **S-1 KILL THE ANSWER-KEY SPOILERS** — done iter-4, validated +14 by reviewer (64→78).
- [x] **S-2 Editor auto-scroll to active slot** — `drawEditorScene` now slices `allLines` to the last `maxLines` (computed from `editorH/16`). Line numbers reflect absolute index, not the rendered offset. Active typing edge is always visible. (+5) **[done iter-26]**
- [ ] **S-3 Loosen the 6/8 fail gate** — `sentence/scoring.ts:89` requires 6+ blues to emit any clue; 5 forfeits the entire envelope. Allow partial credit (e.g., 4-5 blues = lowercase clue at half score). (+4)
- [x] **S-4 Reconcile idle vs orange contradiction** — set IDLE=ORANGE=0; verified by reviewer iter-4. (+3) **[done iter-4]**

## Medium leverage

- [x] **S-5 Per-pick reveal beat** — superseded by S-14 in iter-19 which adds the picked-row glow flash. (+4) **[resolved by S-14]**
- [x] **S-6 Title strip overlap** — and **S-7** dupe breadcrumb both fixed by collapsing the title strip to just `case_file.md`. The Tab/Enter hint stays in the popover footer where it belongs. (+3) **[done iter-26]**
- [x] **S-7 Drop duplicated breadcrumb** — see S-6. **[done iter-26]**
- [x] **S-8 Move progress dots inside canvas** — anchored to editor right-edge, spacing 12px instead of 14. All 8 dots fit within W=512. (+1) **[done iter-26]**

## Iter-4 reviewer follow-ups

- [x] **S-11 Share card hold longer** — RESULT_AUTOCLOSE_S 3.4 → 12; click still advances. **[done iter-11]**
- [x] **S-12 Share card vs chrome overlap** — title strip + progress dots + desk chrome hidden during result phase so the share card owns the screen. **[done iter-11]**
- [x] **S-13 Score reveal juice** — `revealT` over 1.4s drives a count-up (ease-out quad) of the score and a soft headline pulse on the ending label. Score recolors to ending hue at the end of count. (+3) **[done iter-19]**
- [x] **S-14 Per-pick commit flash** — new `reveal` phase between pick and next type (280ms). Picked row glows in its color, fading out. Idle defaults to orange. (+3) **[done iter-19]**
- [x] **S-15 Beat escalation** — `pickTimeoutForSlot` shrinks ~7%/slot from 3.0s with a 1.6s floor; slot 4 ≈ 2.25s, slot 7 ≈ 1.85s. Round actually escalates instead of being 8 flat beats. (+2) **[done iter-20]**

## Polish

- [x] **S-9 Suggestion popover badge alignment** — overlap was caused by the case/alt/nope hint badge that S-1 already removed; only the number badge remains, no overlap. (+1) **[resolved by S-1]**
- [x] **S-10 Share-card ending labels overflow** — `drawShareCard` auto-shrinks the ending font when the label width exceeds `w − 80`, with a 8.5px floor. Long labels like "THE TYPEWRITER WROTE IT FOR YOU" now fit. (+1) **[done iter-20]**
