# Iteration 18

**Date:** 2026-04-30
**Phase:** Phase 3 polish (multi-game)
**Targets:** runner R-6, tamper T-6 + T-10
**Why batched:** All three are isolated low-risk fixes in different files; combined commit gives reviewer a richer single playthrough when validation returns.

## What landed
- **R-6 (runner soft retry)**: New `SHUTTER_MS = 220` constant + `shutterMs` countdown field. `restartSameMode` arms `shutterMs = SHUTTER_MS`. Step decays it. Draw paints a black `0.92α` overlay that fades to 0 over the shutter window — sits over everything, including the new READY/GO intro, so the restart feels intentional.
- **T-6 (tamper bottom-band)**: `drawTamperDiffHintGutter` y from `diffY + diffH + 9` (= 299) to `diffY + diffH + 4` (= 294). The bottom progress strip at `H - 18` (= 302) now owns its row cleanly without the hint stacking into it.
- **T-10 (tamper sample-without-replacement)**: New Fisher–Yates `shuffle` in round.ts. Bugbot's per-call spot pick now draws from a shuffled deck and reshuffles when exhausted (5 spots, 6 calls → reshuffle once). Determinism is preserved because rng is the same seeded function.

## Validation
- typecheck ✓
- vitest 266/266 ✓ — including the existing determinism test ("same seed produces identical call list") confirming the shuffle is deterministic.
- per-game review: deferred. Validated scores hold.

## Notes
After this iteration: runner has 0 open items, tamper has 0 open items, errand has 0 open items, sentence has S-13/S-14/S-15 (Phase 3 polish: count-up, per-pick flash, beat escalation) plus old S-9/S-10 polish, shell has 10 open items including the high-leverage SH-1, SH-2, SH-3, SH-4, SH-5.

Next iteration target: shell (validated 0, 10 open) — or sentence (78, 11 open) for the easier path to 90.
