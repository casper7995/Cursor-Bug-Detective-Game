import type { NotebookSlot, NotebookState } from "./notebook";

export const WRONG_ANSWER_FLOOR = 0;

const W: Record<NotebookSlot, number> = {
  runner: 0.25,
  sentence: 0.25,
  errand: 0.25,
  tamper: 0.25,
};

export interface GameScoreBreakdown {
  readonly weightedSum: number;
  readonly timePenalty: number;
  readonly perGame: Record<NotebookSlot, number>;
  readonly baseScore: number;
}

export interface ScoreInputs {
  readonly correct: boolean;
  /** Time spent investigating before submitting, in milliseconds. */
  readonly elapsedMs: number;
  readonly notebook: NotebookState;
}

export const BASE_CASE_SCORE = 1000;

function perGameScores(notebook: NotebookState): Record<NotebookSlot, number> {
  return {
    runner: notebook.runner?.gameScore ?? 0,
    sentence: notebook.sentence?.gameScore ?? 0,
    errand: notebook.errand?.gameScore ?? 0,
    tamper: notebook.tamper?.gameScore ?? 0,
  };
}

/**
 * Weighted mini-game scores + base 1000 − time penalty (25 per minute).
 * Wrong answer → 0.
 */
export function computeScore(i: ScoreInputs): {
  score: number;
  breakdown: GameScoreBreakdown;
} {
  const perGame = perGameScores(i.notebook);
  if (!i.correct) {
    return {
      score: WRONG_ANSWER_FLOOR,
      breakdown: {
        weightedSum: 0,
        timePenalty: 0,
        perGame,
        baseScore: BASE_CASE_SCORE,
      },
    };
  }

  const keys = Object.keys(W) as NotebookSlot[];
  let gameScoreSum = 0;
  for (const k of keys) {
    gameScoreSum += perGame[k] * W[k]!;
  }

  const elapsedSec = i.elapsedMs / 1000;
  const timePenalty = Math.floor(elapsedSec / 60) * 25;
  const finalScore = Math.max(
    0,
    Math.round(gameScoreSum + BASE_CASE_SCORE - timePenalty),
  );

  return {
    score: finalScore,
    breakdown: {
      weightedSum: gameScoreSum,
      timePenalty,
      perGame,
      baseScore: BASE_CASE_SCORE,
    },
  };
}

/** Compact labels for leaderboard / debug (RUN, WORD, DASH, EYE). */
export const GAME_SCORE_LABEL: Record<NotebookSlot, string> = {
  runner: "RUN",
  sentence: "WORD",
  errand: "DEF",
  tamper: "EYE",
};

export function formatGameScoresDetail(b: GameScoreBreakdown): string {
  const slots: NotebookSlot[] = ["runner", "sentence", "errand", "tamper"];
  return slots
    .map((k) => `${GAME_SCORE_LABEL[k]} ${Math.round(b.perGame[k])}`)
    .join(" · ");
}

function deriveFinalScoreFromBreakdown(b: GameScoreBreakdown): number {
  return Math.max(0, Math.round(b.baseScore + b.weightedSum - b.timePenalty));
}

export function formatGameScoreBreakdownLines(
  b: GameScoreBreakdown,
  finalScore = deriveFinalScoreFromBreakdown(b),
): string[] {
  return [
    formatGameScoresDetail(b),
    `Weighted clue score ${Math.round(b.weightedSum)}`,
    `Base case bonus ${b.baseScore}`,
    `Time penalty -${Math.round(b.timePenalty)}`,
    `Final score ${Math.max(0, Math.round(finalScore))}`,
  ];
}

export function formatScoreBreakdownSummary(
  b: GameScoreBreakdown,
  finalScore = deriveFinalScoreFromBreakdown(b),
): string {
  return `${b.baseScore} base + ${Math.round(b.weightedSum)} evidence - ${Math.round(b.timePenalty)} time = ${Math.max(0, Math.round(finalScore))}`;
}
