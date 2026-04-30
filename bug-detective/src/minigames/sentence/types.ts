/** Finish the Sentence types — Tab autocomplete themed. */

export type PickColor = "blue" | "purple" | "orange";

export interface SentenceSlot {
  readonly prefix: string;
  readonly options: {
    readonly blue: string;
    readonly purple: string;
    readonly orange: string;
  };
  /** Visible top-to-bottom order of the three suggestion rows for this slot. */
  readonly rowOrder: readonly [PickColor, PickColor, PickColor];
  readonly suffix: string;
}

export interface SentenceTemplate {
  readonly id: string;
  readonly slots: readonly SentenceSlot[];
}

export interface PlayerPick {
  readonly sentenceIdx: number;
  readonly color: PickColor | "idle";
}

export type EndingKind =
  | "by-the-book"
  | "cursed-case-file"
  | "improv"
  | "typewriter-wrote-it";

export const SENTENCE_SLOTS_PER_TEMPLATE = 8;

export const SENTENCE_SCORE = {
  /** Eight perfect blues hit the 1000 cap. */
  BLUE: 125,
  PURPLE: 70,
  /** Tutorial says idle and orange are equivalent — keep them so. */
  ORANGE: 0,
  IDLE: 0,
} as const;

/**
 * Per-beat pick timeout. S-15: tightens by ~7% per slot so the round
 * actually escalates instead of being 8 flat 3.0s beats. Floor 1.6s.
 */
export function pickTimeoutForSlot(sentenceIdx: number): number {
  return Math.max(1.6, 3.0 * Math.pow(0.93, sentenceIdx));
}
