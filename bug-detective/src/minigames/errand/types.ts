/** Errand Race types — Cloud Agent themed. */

export type HintIcon = "cup" | "feather" | "key" | "question" | "warn";
export type DrawerContent = "clue" | "junk" | "trap";

export type DrawerIndex = 0 | 1 | 2 | 3 | 4;
export type HelperIndex = 0 | 1 | 2;

export interface Drawer {
  readonly index: DrawerIndex;
  readonly hint: HintIcon;
  readonly content: DrawerContent;
  /** Time it takes the helper to fully fill, in ms. 1500..3000. */
  readonly fillRateMs: number;
  /** For traps: progress fraction (0.3..0.7) at which the ABORT modal appears. */
  readonly trapAlertAt01: number;
  /** Trap "push" coin flip — deterministic per drawer. */
  readonly trapPushIsClue: boolean;
}

export type HelperState =
  | "waiting"
  | "moving"
  | "filling"
  | "alert"
  | "returning"
  | "lost";

export interface Helper {
  index: HelperIndex;
  state: HelperState;
  /** Drawer the helper is assigned to (if any). */
  drawerAssigned: DrawerIndex | null;
  /** 0..1 fill progress for filling/alert states. */
  fillProgress: number;
  /** Final result once the helper has returned (or null if lost). */
  result: "clue" | "junk" | null;
}

export interface ErrandRound {
  /** 5 drawers in deterministic seed order. */
  readonly drawers: readonly Drawer[];
  /** Mapping describing which hint icons "tend" to lead to which content. */
  readonly hintTruthMap: Readonly<Record<HintIcon, DrawerContent>>;
}

export const ERRAND_NUM_DRAWERS = 5;
export const ERRAND_NUM_HELPERS = 3;

export const ERRAND_SCORE = {
  ZERO: 0,
  ONE: 400,
  TWO: 700,
  THREE: 1000,
  SAFE_BONUS: 50,
  LOST_PENALTY: -100,
} as const;
