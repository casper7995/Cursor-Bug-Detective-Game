# Sentence push-to-90 backlog

Order by leverage. Mark each item `[done]`, `[blocked]`, or leave open.

## High leverage (the gameplay-critical items)

- [x] **S-1 KILL THE ANSWER-KEY SPOILERS** — done iter-4, validated +14 by reviewer (64→78).
- [ ] **S-2 Editor auto-scroll to active slot** — `sentence/draw.ts:130-146` clips after 8 lines. Past slot 6, the player can't see the prefix they're completing. Render the last 8 lines OR the active-slot window. (+5)
- [ ] **S-3 Loosen the 6/8 fail gate** — `sentence/scoring.ts:89` requires 6+ blues to emit any clue; 5 forfeits the entire envelope. Allow partial credit (e.g., 4-5 blues = lowercase clue at half score). (+4)
- [x] **S-4 Reconcile idle vs orange contradiction** — set IDLE=ORANGE=0; verified by reviewer iter-4. (+3) **[done iter-4]**

## Medium leverage

- [ ] **S-5 Per-pick reveal beat** — pulse the right answer for 250ms before advancing, regardless of player choice. New sub-phase in `sentenceSession.ts:293-300`. Teaches; turns the run into actual practice. (+4)
- [ ] **S-6 Title strip overlap** — `sentenceSession.ts:504-506` hardcoded x=162 collides "Tab cycles · Enter accepts" with "case_file.md". Use Phase 1.3 helper. (+2)
- [ ] **S-7 Drop duplicated breadcrumb** — `sentenceSession.ts:503` and `draw.ts:266` both say "Tab cycles · Enter accepts". Pick one (keep popover, drop title-strip). (+1)
- [ ] **S-8 Move progress dots inside canvas** — `sentenceSession.ts:548` last dot lands at x=600 on a 512-wide canvas. Reposition. (+1)

## Iter-4 reviewer follow-ups

- [x] **S-11 Share card hold longer** — RESULT_AUTOCLOSE_S 3.4 → 12; click still advances. **[done iter-11]**
- [x] **S-12 Share card vs chrome overlap** — title strip + progress dots + desk chrome hidden during result phase so the share card owns the screen. **[done iter-11]**
- [ ] **S-13 Score reveal juice** — count-up tween on the big score number; small flash on the ending headline. (+3 from reviewer's blocker list)
- [ ] **S-14 Per-pick commit flash** — 120ms green pulse on right answer / red on wrong, before advance. (+3)
- [ ] **S-15 Beat escalation** — tighten pick-timer 5-10% per beat, or add a "beat 7-8 panic" visual. (+2)

## Polish

- [ ] **S-9 Suggestion popover badge alignment** — `draw.ts:240, 244` both right-anchor at `r.x+r.w-{50,38}` and overlap. Move to a separate column. (+1)
- [ ] **S-10 Share-card ending labels overflow** — "TYPEWRITER WROTE IT FOR YOU" overflows at 11px. Shrink to 10px or 2-line wrap. (+1)
