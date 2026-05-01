# Tamper minigame: per-call tampered spot (kill the "always W" pattern)

## The problem you flagged

Round structure today:
- 1 scene picked at round start (3 scenes available: case-file-set, evidence-bench, lamp-corner).
- **1 spot in that scene is marked `tampered: true`** for the entire 6-call round.
- 6 calls fire; on each call Bugbot points at some spot and claims either "tampered" or "clean".
- The truth on every call is determined by **that one fixed tampered spot** — so once the player identifies it on call 1, the remaining 5 calls collapse into a mechanical pattern-match. There is no diversity.

## The fix in one sentence

Make `tampered` a **per-call** fact, not a per-round fact. Each of the 6 calls gets its own freshly-rolled tampered spot, so the player must re-scan the panels every call.

## Why this is the right cut

- **Data model already supports it**: every spot has both a `sketchKey` (ORIGINAL) and a `tonightSketchKey` (TONIGHT variant), and `drawPropSketch` already renders both. We just stop pinning "the tampered one" to a single spot for the round.
- **Bugbot's lie/honest mechanic survives intact** — but now both axes vary per call (which spot is tampered AND whether Bugbot is lying), so the answer changes shape every time.
- **No new art, no new scenes, no new audio.** Pure logic + render-state change.

## Diversity math

With this change, each call independently rolls:
- 1 of 5–6 tampered spots × honest/lying axis × point-at-tampered/point-at-clean axis ≈ **20+ distinct call shapes** per scene, × 3 scenes = ~60 unique call situations. The player can never coast on call 1's deduction.

The "10 versions" you mentioned is comfortably exceeded — and the 6 calls in a single round are now ~6 independent puzzles.

## Files affected (5 production + 1 test)

### 1. `src/minigames/tamper/types.ts`
- Add a per-call field to `TamperCall`: `tamperedSpotId: string` (which spot is the real tamper for **this** call).
- Keep round-level `TamperRound.tamperedSpotId` for back-compat — but it becomes "the most recent call's tampered spot, used for the result-card teach line" rather than the truth-source for the round. (Renaming is more disruptive than it's worth; a comment clarifies.)
- Drop the per-spot `tampered: boolean` field. It's no longer meaningful at the spot level since every spot can be the tamper of some call. Renderer reads it from the current call instead.
- `TamperScene.spots[].tampered` removal cascades into `scenes.ts` data and the test that asserts "exactly one tampered spot" — both have to flip.

### 2. `src/minigames/tamper/scenes.ts`
- Strip `tampered: false` from every spot (16 spots × 3 scenes = 48 lines, mechanical delete).
- Spot data otherwise unchanged.

### 3. `src/minigames/tamper/round.ts`
- `buildTamperRound`:
  - Stop picking one tampered spot up-front; stop mapping spots to add `tampered: i === idx`.
  - For each of the 6 calls, roll an independent `tamperedSpotId` (deterministic via the same `rng`).
  - Then roll Bugbot's `bugbotPointsAtSpotId` (continue using the without-replacement deck — keeps Bugbot from pointing at the same prop twice in a row, which is good UX).
  - Bugbot's claim is now derived from `(bugbotPointsAtSpotId === call.tamperedSpotId) XOR isLying`.
  - The lie-clustering bias (back-half lean) and confidence-rises-with-lateness rules **stay** — they're independent of which spot is tampered.
  - `TamperRound.tamperedSpotId` is set to the **last call's** tamperedSpotId so the result-card teach line still resolves to a real prop.
- `scoreCall(call, verdict, tamperedSpotId)` signature **changes**: drop the third param, read `call.tamperedSpotId` instead.
  - Updates `disagree-point` correctness: `right = !honest && verdict.spotId === call.tamperedSpotId`.
- `scoreTamperRound` updated to pass each call's own tamperedSpotId — really just removes the round-level passthrough.

### 4. `src/minigames/tamper/draw.ts`
- `drawDiffCard` signature gains `currentTamperedSpotId: string` (replaces the implicit "scene knows which spot is tampered" via `spot.tampered`).
- `drawScenePanel` — change `const isTamperHere = half === "tonight" && spot.tampered;` to `const isTamperHere = half === "tonight" && spot.id === currentTamperedSpotId;`.
- Result-card teach line (`drawResultCard`) keeps showing the most recent call's tampered prop — already lines up with the round's "last call's tampered" stored value.

### 5. `src/minigames/tamper/tamperSession.ts`
- `drawDiffCard(...)` call site adds `this.round.calls[this.phase.callIndex].tamperedSpotId`.
- `scoreCall(call, v)` call sites drop the third arg.
- "Real tamper reveal" overlay in the verdict phase: uses `currentCall().call.tamperedSpotId` (was: `this.round.tamperedSpotId`).

### 6. `tests/minigames/tamper.test.ts`
- "round has 6 calls and exactly one tampered spot" → rewrite to assert: each call has a `tamperedSpotId` matching some spot in the scene, and the distribution across 6 calls hits ≥3 distinct spots over 64 seeds (sanity check on diversity).
- "many seeds each mark exactly one tampered spot" → delete (concept no longer applies); replace with a new assertion that across 64 seeds, the per-call `tamperedSpotId` distribution covers ≥4 of the 5–6 scene spots on average (real diversity check).
- All scoring tests update their `scoreCall(...)` call sites (drop third arg).
- "answering each call correctly" — still 6×150 = 900, holds.
- "agree-all baseline only scores honest calls" — still holds (honesty axis untouched).
- "disagree-point with the wrong spot" — still holds (just reads `call.tamperedSpotId` now).
- "3 right + 3 caught lies clamps to 1000" — still holds.

## What stays the same

- 3 scenes, scene-pick logic (still per-round).
- 6 calls per round.
- Lie clustering toward back half + confidence-rises-with-lateness.
- Caught-lie bonus (250) and confident-catch bonus (100).
- Without-replacement deck for Bugbot's pointing target.
- Result card, score clamp [0, 1000], clue-earn rules.
- All copy ("Bugbot says: the X changed", verdict feedback lines).
- All animations, transitions, sound.
- Tutorial diagram.

## What changes for the player

- **Each call demands a fresh look at the panels.** Call 1 spot might be the lampshade; call 2 might be the wire; call 3 might be the puddle.
- **The "always W" deduction collapses.** Knowing call 1's tampered spot tells you nothing about call 2.
- **Bugbot's lie/honest behavior reads richer** because the truth shifts under it.
- **Caught-lie click target shifts**: in pick-mode the player must point at *this call's* tampered spot, not "the round's" tampered spot. This is what makes the panel comparison load-bearing every call.

## Risks & how I'll mitigate

1. **The round becomes too hard if every call asks for fresh perception under timer pressure.**
   - Mitigation: the `READ_BEAT_S` and `CALL_DURATION_S` timers (already tuned) give 1.25s of read-beat + 4.25s of decision time. That's plenty to scan 5–6 small icons once you know what you're looking at.
   - If reviewer feedback shows the timer is now too tight, I'll bump `CALL_DURATION_S` 4.25 → 5.5 in a follow-up. (Single-line tweak; not in this change.)

2. **Result-card teach line ("Real change: wire (cut strand)") becomes ambiguous** — which call's tamper is it referring to?
   - Mitigation: I'll change it to count distinct tampered spots across the round (e.g., "Tonight's tampers: wire (cut strand), key (bent), book (shifted), …") OR just the final call's tamper — TBD with a small UX call when I get there. Default to listing the unique set; it's truthier.

3. **Test brittleness** — diversity assertions are statistical.
   - Mitigation: assert across 64 seeds (matching existing test pattern), use a low bar like "≥4 distinct tampered spots seen" so we don't flake on RNG.

## Verification plan

1. `npx tsc --noEmit` — clean.
2. `npx vitest run` — all tests pass (some rewritten, none deleted-and-not-replaced).
3. **Manual play** in dev server: enter tamper, play 1 round, confirm:
   - Each call's TONIGHT panel highlights a *different* prop variant when revealed.
   - Bugbot's pointer arrow moves between calls.
   - The "real" green-ring overlay on verdict miss lands on a different prop each call.
4. Replay same seed twice — call list identical (determinism preserved).

## Out of scope (deliberately)

- Per-call mode rotation (the "what kind of tamper" / "is Bugbot lying" axis split — option #2 from earlier discussion).
- New scenes or new tamper variants.
- Timer / scoring rebalance.
- Audio cues per call.

This change addresses your specific complaint ("answer is always the W, no diversity") with the minimum surgery that genuinely fixes it.

## LOC estimate

- ~20 LOC removed (per-spot `tampered` flag + scenes data + the round-level uniqueness logic).
- ~30 LOC added (per-call rolling, propagation through draw + session).
- Net: ~50 LOC churn, mostly in `round.ts`. Single PR.
