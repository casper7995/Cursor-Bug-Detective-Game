import { type ActionName, DEFAULT_BINDINGS } from "./actions";

type CodeToActions = Map<string, ActionName[]>;

function invertBindings(bindings: Record<ActionName, string[]>): CodeToActions {
  const m: CodeToActions = new Map();
  for (const [action, codes] of Object.entries(bindings) as [
    ActionName,
    string[],
  ][]) {
    for (const code of codes) {
      const list = m.get(code);
      if (list) list.push(action);
      else m.set(code, [action]);
    }
  }
  return m;
}

export class InputManager {
  private readonly codesDown = new Set<string>();
  private readonly codeToActions: CodeToActions;
  /** Actions that fired on this frame from a keydown edge (not repeat). */
  private readonly justPressed = new Set<ActionName>();

  constructor(
    private bindings: Record<ActionName, string[]> = DEFAULT_BINDINGS,
  ) {
    this.codeToActions = invertBindings(bindings);
  }

  attach(target: Window = window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
  }

  detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
  }

  setBindings(bindings: Record<ActionName, string[]>): void {
    this.bindings = bindings;
    this.codeToActions.clear();
    const next = invertBindings(bindings);
    for (const [k, v] of next) this.codeToActions.set(k, v);
  }

  /** Call at end of each frame after reading input. */
  endFrame(): void {
    this.justPressed.clear();
  }

  isDown(action: ActionName): boolean {
    const codes = this.bindings[action];
    for (const code of codes) {
      if (this.codesDown.has(code)) return true;
    }
    return false;
  }

  consumePress(action: ActionName): boolean {
    if (!this.justPressed.has(action)) return false;
    this.justPressed.delete(action);
    return true;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.codesDown.add(e.code);
    const acts = this.codeToActions.get(e.code);
    if (acts) {
      for (const a of acts) this.justPressed.add(a);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.codesDown.delete(e.code);
  };
}
