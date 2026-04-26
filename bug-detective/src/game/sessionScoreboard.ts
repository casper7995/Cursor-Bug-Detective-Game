/**
 * In-memory, session-only personal bests for the four evidence minigames.
 * Not persisted; cleared on new investigation / restart. Separate from
 * the shared daily leaderboard in scoreClient.
 */

import type { NotebookSlot } from "./notebook";
import { GAME_SCORE_LABEL } from "./score";

export interface MinigameSessionStats {
  latestScore: number;
  bestScore: number;
  /** Number of times a score was recorded for this slot. */
  attempts: number;
  updatedAtMs: number;
}

export interface RunnerEndlessSessionStats {
  bestClimbM: number;
  latestClimbM: number;
  climbAttempts: number;
  updatedAtMs: number;
}

const slots: readonly NotebookSlot[] = [
  "runner",
  "sentence",
  "errand",
  "tamper",
];

function emptySlot(): MinigameSessionStats {
  return {
    latestScore: 0,
    bestScore: 0,
    attempts: 0,
    updatedAtMs: 0,
  };
}

const perSlot: Record<NotebookSlot, MinigameSessionStats> = {
  runner: emptySlot(),
  sentence: emptySlot(),
  errand: emptySlot(),
  tamper: emptySlot(),
};

const runnerEndless: RunnerEndlessSessionStats = {
  bestClimbM: 0,
  latestClimbM: 0,
  climbAttempts: 0,
  updatedAtMs: 0,
};

/**
 * 0..1000 (or per-minigame) clue run score. Use for desk minis and runner daily clear.
 */
export function recordMinigameScore(
  slot: NotebookSlot,
  score: number,
  nowMs: number,
): { newBest: boolean } {
  const s = perSlot[slot];
  const prevBest = s.attempts === 0 ? -1 : s.bestScore;
  const newBestScore = s.attempts === 0 ? score : Math.max(s.bestScore, score);
  s.latestScore = score;
  s.bestScore = newBestScore;
  s.attempts += 1;
  s.updatedAtMs = nowMs;
  return { newBest: score > prevBest };
}

/** Endless exit: `meters` is floored max climb. */
export function recordRunnerEndlessClimb(
  meters: number,
  nowMs: number,
): { newBest: boolean } {
  const prev =
    runnerEndless.climbAttempts === 0 ? -1 : runnerEndless.bestClimbM;
  runnerEndless.latestClimbM = meters;
  runnerEndless.climbAttempts += 1;
  runnerEndless.bestClimbM =
    runnerEndless.climbAttempts === 1
      ? meters
      : Math.max(runnerEndless.bestClimbM, meters);
  runnerEndless.updatedAtMs = nowMs;
  return { newBest: meters > prev };
}

export function clearSessionScores(): void {
  for (const k of slots) {
    perSlot[k] = emptySlot();
  }
  runnerEndless.bestClimbM = 0;
  runnerEndless.latestClimbM = 0;
  runnerEndless.climbAttempts = 0;
  runnerEndless.updatedAtMs = 0;
}

export interface SessionRowView {
  readonly slot: NotebookSlot;
  /** RUN, WORD, DASH, EYE */
  readonly label: string;
  /** One line for HUD; "—" if nothing recorded. */
  readonly line: string;
}

function formatClueLine(s: MinigameSessionStats): string {
  if (s.attempts === 0) return "—";
  const t = s.attempts === 1 ? "try" : "tries";
  return `best ${s.bestScore} · latest ${s.latestScore} · ${s.attempts} ${t}`;
}

function formatRunnerLine(): string {
  const clue = perSlot.runner;
  const end = runnerEndless;
  const parts: string[] = [];
  if (clue.attempts > 0) {
    const t = clue.attempts === 1 ? "try" : "tries";
    parts.push(
      `clue best ${clue.bestScore} · latest ${clue.latestScore} · ${clue.attempts} ${t}`,
    );
  }
  if (end.climbAttempts > 0) {
    const ct = end.climbAttempts === 1 ? "run" : "runs";
    parts.push(
      `endless best ${end.bestClimbM}m · last ${end.latestClimbM}m · ${end.climbAttempts} ${ct}`,
    );
  }
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}

export function getSessionScoreboardView(): {
  readonly title: "Today · you";
  readonly rows: readonly SessionRowView[];
} {
  const rows: SessionRowView[] = [];
  for (const slot of slots) {
    const label = GAME_SCORE_LABEL[slot];
    const line =
      slot === "runner" ? formatRunnerLine() : formatClueLine(perSlot[slot]);
    rows.push({ slot, label, line });
  }
  return { title: "Today · you", rows };
}

export type SessionScoreboardView = ReturnType<typeof getSessionScoreboardView>;

/** @internal for unit tests */
export function __testGetSlot(slot: NotebookSlot): MinigameSessionStats {
  return { ...perSlot[slot] };
}
export function __testGetRunnerEndless(): RunnerEndlessSessionStats {
  return { ...runnerEndless };
}
