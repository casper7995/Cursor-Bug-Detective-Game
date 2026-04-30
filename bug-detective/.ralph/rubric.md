# Minigame 100-Point Rubric

Every per-game score uses this exact breakdown. Same rubric for every iteration → consistent comparison.

## Categories (100 total)

### Gameplay loop (35)
- **Decision quality (15)** — does the player make a meaningful choice each round, or collapse to one dominant strategy?
- **Skill expression (10)** — can a better player score better, demonstrably, beyond luck?
- **Escalation (10)** — does difficulty/tension ramp through a single play?

### Feedback & feel (25)
- **Per-action feedback (15)** — every input has a clear visual + audio reaction. No silent state changes.
- **Result clarity (10)** — at end-of-round the player understands what happened, what they earned, why.

### Display & formatting (20)
- **No clipping/overflow (8)** — all text fits its container; no mid-word truncation.
- **No collisions (6)** — title strips, breadcrumbs, hints, badges don't overlap.
- **Consistent hierarchy (6)** — fonts/sizes match purpose; primary actions visually dominant.

### Polish & pacing (15)
- **Transitions (5)** — intro/outro/retry feel intentional, not abrupt.
- **Animation (5)** — at least one juicy moment per round (count-up, particle, shake, flash).
- **Pacing (5)** — no dead beats; no rushed reveals.

### Replayability (5)
- Variance across 3 plays. Procedural variety, not memorization.

## Scoring rules

- Every category has integer scores. Sum to a single 0–100.
- A game scores **90+ only when** every category is ≥80% of its max AND total ≥90.
- A category at 0 capped to 50 total no matter what else passes.
- The reviewer **must produce a per-category breakdown**, not just a total.

## Validation requirements (NON-NEGOTIABLE)

Every score must come from **real gameplay**, not static analysis:
1. Dev server running.
2. Playwright actively navigates and plays the game.
3. **At least 3 screenshots per game state** (intro, mid-action, verdict, result).
4. Reviewer confirms: "I played at least 2 full rounds and observed N specific events."
5. If gameplay observation fails → score capped at the prior iteration's score (no regression and no progress).

A score given without playable gameplay observation is INVALID and the iteration must be re-run.
