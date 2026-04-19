/** Logical gameplay actions for Bug Detective (keyboard-first). */

export const Action = {
  Submit: "Submit",
  Restart: "Restart",
  Mute: "Mute",
  MenuConfirm: "MenuConfirm",
  MenuBack: "MenuBack",
  Settings: "Settings",
  /** Jump in the monitor code-runner minigame. */
  RunnerJump: "RunnerJump",
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
};
