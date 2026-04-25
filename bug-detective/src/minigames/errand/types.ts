/** Errand Race types — Cloud Agent themed. */

export type HintIcon = "cup" | "feather" | "key" | "question" | "warn";
export type DrawerContent = "clue" | "junk" | "trap";

export type DrawerIndex = 0 | 1 | 2 | 3 | 4;
export type HelperIndex = 0 | 1 | 2;

export type InterventionKind = "inspect" | "abort" | "push";

export interface TaskSignalProfile {
  readonly relevance01: number;
  readonly safety01: number;
  readonly urgency01: number;
}

export interface AgentTrait {
  readonly paceScale: number;
  readonly label: "steady" | "fast" | "careful";
}

export interface Drawer {
  readonly index: DrawerIndex;
  readonly hint: HintIcon;
  readonly content: DrawerContent;
  readonly fillRateMs: number;
  readonly signalProfile: TaskSignalProfile;
  readonly trapAlertAt01: number;
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
  drawerAssigned: DrawerIndex | null;
  fillProgress: number;
  result: "clue" | "junk" | null;
  readonly trait: AgentTrait;
  tripwireT: number;
}

export interface ErrandRound {
  readonly drawers: readonly Drawer[];
  readonly hintTruthMap: Readonly<Record<HintIcon, DrawerContent>>;
  readonly agentTraits: readonly [AgentTrait, AgentTrait, AgentTrait];
}

export const ERRAND_NUM_DRAWERS = 5;
export const ERRAND_NUM_HELPERS = 3;

/** Window to abort or push a trap before auto-abort. */
export const ERRAND_TRIPWIRE_ABORT_S = 2.4;

export const ERRAND_SCORE = {
  ZERO: 0,
  ONE: 400,
  TWO: 700,
  THREE: 1000,
  SAFE_BONUS: 50,
  LOST_PENALTY: -100,
} as const;
