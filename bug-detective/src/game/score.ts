export const BASE_SCORE = 1000;
export const TIME_PENALTY_PER_SEC = 4;
export const CLUE_PENALTY_PER_HOVER = 50;
export const WRONG_ANSWER_FLOOR = 0;

export interface ScoreInputs {
  /** Was the answer correct? */
  readonly correct: boolean;
  /** Time spent investigating before submitting, in milliseconds. */
  readonly elapsedMs: number;
  /** Number of unique anomaly-target hovers held >350ms (the "clues used"). */
  readonly cluesUsed: number;
}

/**
 * Score formula:
 *   wrong answer    → 0
 *   correct answer  → max(0, BASE - timeLost - cluePenalty)
 *
 * `timeLost = floor(elapsedSec) * 4` (≤ 360 over a full 90s round)
 * `cluePenalty = cluesUsed * 50`
 *
 * Tiebreakers (handled in scoreClient): cluesUsed asc, elapsedMs asc, ts asc.
 */
export function computeScore(i: ScoreInputs): number {
  if (!i.correct) return WRONG_ANSWER_FLOOR;
  const timeLost = Math.floor(i.elapsedMs / 1000) * TIME_PENALTY_PER_SEC;
  const cluePenalty = i.cluesUsed * CLUE_PENALTY_PER_HOVER;
  return Math.max(0, BASE_SCORE - timeLost - cluePenalty);
}
