/** Finish the Sentence types — Tab autocomplete themed. */

export type PickColor = "blue" | "purple" | "orange";

export interface SentenceSlot {
  readonly prefix: string;
  readonly options: { readonly blue: string; readonly purple: string; readonly orange: string };
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

export const SENTENCE_SLOTS_PER_TEMPLATE = 4;

export const SENTENCE_SCORE = {
  BLUE: 250,
  PURPLE: 150,
  ORANGE: 0,
  IDLE: -50,
} as const;
