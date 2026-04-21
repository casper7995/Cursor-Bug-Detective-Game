/** Finish the Sentence — pure scoring + ending classification. */

import type { EndingKind, PickColor, PlayerPick } from "./types";
import { SENTENCE_SCORE, SENTENCE_SLOTS_PER_TEMPLATE } from "./types";

export interface SentenceResult {
  readonly score: number;
  readonly ending: EndingKind;
  readonly bluesPicked: number;
  readonly purplesPicked: number;
  readonly orangesPicked: number;
  readonly idles: number;
  readonly maxBlueStreak: number;
}

export function scoreSentenceRun(
  picks: readonly PlayerPick[],
): SentenceResult {
  let score = 0;
  let blue = 0;
  let purple = 0;
  let orange = 0;
  let idle = 0;
  let streak = 0;
  let maxStreak = 0;

  for (const p of picks) {
    switch (p.color) {
      case "blue":
        score += SENTENCE_SCORE.BLUE;
        blue++;
        streak++;
        if (streak > maxStreak) maxStreak = streak;
        break;
      case "purple":
        score += SENTENCE_SCORE.PURPLE;
        purple++;
        streak = 0;
        break;
      case "orange":
        score += SENTENCE_SCORE.ORANGE;
        orange++;
        streak = 0;
        break;
      case "idle":
        score += SENTENCE_SCORE.IDLE;
        idle++;
        streak = 0;
        break;
      default: {
        const _: never = p.color;
        void _;
      }
    }
  }

  const finalScore = Math.max(0, Math.min(1000, score));
  const ending = classifyEnding(blue, purple, orange + idle);
  return {
    score: finalScore,
    ending,
    bluesPicked: blue,
    purplesPicked: purple,
    orangesPicked: orange,
    idles: idle,
    maxBlueStreak: maxStreak,
  };
}

export function classifyEnding(
  blue: number,
  purple: number,
  oranges: number,
): EndingKind {
  if (blue >= SENTENCE_SLOTS_PER_TEMPLATE) return "by-the-book";
  if (oranges >= 2) return "typewriter-wrote-it";
  if (purple >= 3) return "cursed-case-file";
  return "improv";
}

export function shouldEmitOutcome(picks: readonly PlayerPick[]): boolean {
  return picks.some((p) => p.color === "blue");
}

/** Inject the player name into a prefix once 3 consecutive blues land. */
export function injectName(
  prefix: string,
  name: string | null,
  consecutiveBlues: number,
): string {
  if (!name || consecutiveBlues < 3) return prefix;
  // Replace standalone "you" / "I" hooks with the player's name.
  const sanitized = name.trim().slice(0, 16);
  if (!sanitized) return prefix;
  if (/\byou\b/i.test(prefix)) {
    return prefix.replace(/\byou\b/i, sanitized);
  }
  if (/^I /.test(prefix)) {
    return prefix.replace(/^I /, `${sanitized} `);
  }
  return prefix;
}

/** Re-export for convenience. */
export type { PickColor };
