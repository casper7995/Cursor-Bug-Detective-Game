/** Logical gameplay actions for Bug Detective (keyboard-first). */

export const Action = {
  Submit: "Submit",
  Restart: "Restart",
  Mute: "Mute",
  MenuConfirm: "MenuConfirm",
  MenuBack: "MenuBack",
  Settings: "Settings",
  /** Jump in the monitor code-runner minigame — Space (Tab stays for Sentence mini). */
  RunnerJump: "RunnerJump",
  /** Speed boost in the monitor code-runner — hold ArrowRight / D (not tap). */
  RunnerBoost: "RunnerBoost",
  /** Retry after game over in daily runner (R — shared with Restart in other phases). */
  RunnerRetry: "RunnerRetry",
} as const;

export type ActionName = (typeof Action)[keyof typeof Action];

/** Default bindings use `KeyboardEvent.code` (stable across QWERTY layouts). */
export const DEFAULT_BINDINGS: Record<ActionName, string[]> = {
  [Action.Submit]: ["Enter"],
  [Action.Restart]: ["KeyR"],
  [Action.Mute]: ["KeyM"],
  [Action.MenuConfirm]: ["Enter", "Space"],
  [Action.MenuBack]: ["Escape"],
  [Action.Settings]: ["Comma"],
  [Action.RunnerJump]: ["Space", "ArrowUp", "KeyW"],
  [Action.RunnerBoost]: ["ArrowRight", "KeyD"],
  [Action.RunnerRetry]: ["KeyR"],
};
