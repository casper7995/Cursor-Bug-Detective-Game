# Phase 1 — Shared Infrastructure

Build once in `src/minigames/desk/aiCard.ts` (or new `src/minigames/desk/canvasUtils.ts`). Each item is a single deliverable; gate at typecheck + tests, no per-game review needed for Phase 1 items (they pay back in Phase 2).

## P1.1 — `wrapAndDraw` helper (PROMOTE FROM TAMPER) [done iter-01]
**Status:** promoted to `desk/aiCard.ts`; tamper now imports the shared one.
**Action:** export from a shared module; replace `fillText` for any string ≥2 words on a constrained card in:
- `tamper/draw.ts` Bugbot claim line @ ~line 479 (worst single visible bug)
- `tamper/draw.ts` intro card body @ ~line 631-641
- `sentence/draw.ts` editor body wrap pass
- `errand/tutorialGate.ts` bullet wrap

**Verify:** typecheck + tests + visual confirm in browser.

## P1.2 — `truncateOnWord(ctx, text, maxW)` [done iter-01: helper exported; runner/tamper call sites still TODO]
**Action:** new helper, replaces inline `slice(-1)` loops:
- `runner/draw.ts:278-285` (clue strip)
- `tamper/draw.ts:210-217` (hint gutter)

## P1.3 — `drawAiCardTitle(ctx, main, sub)` measure-and-offset [done iter-01: helper exported; tamper/sentence sessions still need to swap to it]
**Action:** new helper. Replace hardcoded `(18, 26) / (118, 26)` pairs in:
- `tamper/tamperSession.ts:476`
- `sentence/sentenceSession.ts:503`
- (audit other sessions for the pattern)

## P1.4 — `clipToRect(ctx, rect, drawFn)` [done iter-01: helper exported; runner call site still TODO]
**Action:** new helper. Apply around plank/snippet rendering in `runner/draw.ts` so world content can't bleed into the HUD bar.

## P1.5 — Shared `drawResultStrip(ctx, stats, layout)` [done iter-02 — exported as `drawAiResultStrip`; tamper migrated; runner/errand/sentence migrate during their Phase 2/3 iterations]
**Action:** new export. Animated count-up of headline number, comparison delta line, stat row (3-4 stats), 2 action buttons.
Migrate:
- `runner/draw.ts:421-492` (Game Over card)
- `tamper/draw.ts:756` (result card — also surface tampered prop)
- `errand` result card
- `sentence/draw.ts:347-403` (share card)

**Phase 1 acceptance:** all 4 games typecheck, tests pass, no regression in scores. Phase 2 cannot start until Phase 1 is committed.
