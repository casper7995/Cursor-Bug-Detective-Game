/** Logical gameplay actions (keyboard-first; remapping layer maps codes → actions). */

export const Action = {
  MoveForward: "MoveForward",
  MoveBack: "MoveBack",
  MoveLeft: "MoveLeft",
  MoveRight: "MoveRight",
  Sprint: "Sprint",
  Dash: "Dash",
  CameraOrbitLeft: "CameraOrbitLeft",
  CameraOrbitRight: "CameraOrbitRight",
  CycleTargetLeft: "CycleTargetLeft",
  CycleTargetRight: "CycleTargetRight",
  PrimaryAttack: "PrimaryAttack",
  Secondary: "Secondary",
  Interact: "Interact",
  BuildRotateCCW: "BuildRotateCCW",
  BuildRotateCW: "BuildRotateCW",
  MenuConfirm: "MenuConfirm",
  MenuBack: "MenuBack",
  ToggleBuild: "ToggleBuild",
  Structure1: "Structure1",
  Structure2: "Structure2",
  Structure3: "Structure3",
} as const;

export type ActionName = (typeof Action)[keyof typeof Action];

/** Default bindings use `KeyboardEvent.code` (stable across QWERTY macOS/Windows). */
export const DEFAULT_BINDINGS: Record<ActionName, string[]> = {
  [Action.MoveForward]: ["KeyW", "ArrowUp"],
  [Action.MoveBack]: ["KeyS", "ArrowDown"],
  [Action.MoveLeft]: ["KeyA", "ArrowLeft"],
  [Action.MoveRight]: ["KeyD", "ArrowRight"],
  [Action.Sprint]: ["ShiftLeft", "ShiftRight"],
  [Action.Dash]: ["Space"],
  [Action.CameraOrbitLeft]: ["BracketLeft"],
  [Action.CameraOrbitRight]: ["BracketRight"],
  [Action.CycleTargetLeft]: ["KeyQ"],
  [Action.CycleTargetRight]: ["KeyE"],
  [Action.PrimaryAttack]: ["KeyJ"],
  [Action.Secondary]: ["KeyK"],
  [Action.Interact]: ["KeyL"],
  [Action.BuildRotateCCW]: ["KeyU"],
  [Action.BuildRotateCW]: ["KeyO"],
  [Action.MenuConfirm]: ["Enter"],
  [Action.MenuBack]: ["Escape"],
  [Action.ToggleBuild]: ["KeyV"],
  [Action.Structure1]: ["Digit1"],
  [Action.Structure2]: ["Digit2"],
  [Action.Structure3]: ["Digit3"],
};
