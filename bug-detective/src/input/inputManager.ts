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
  /**
   * When true, desk minigames own keyboard input (Tab autocomplete, etc.).
   * Skips binding Tab/Enter/Space/arrows to global runner / submit actions so
   * capture-phase handlers here do not steal keys before session listeners.
   */
  private suppressGameKeys = false;

  /** Only keys we preventDefault when bound — unbound Tab/Space still behave normally. */
  private static readonly NAV_CODES = new Set<string>([
    "Tab",
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);

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
    target.addEventListener("keydown", this.onKeyDown, { capture: true });
    target.addEventListener("keyup", this.onKeyUp, { capture: true });
  }

  detach(target: Window = window): void {
    target.removeEventListener("keydown", this.onKeyDown, { capture: true });
    target.removeEventListener("keyup", this.onKeyUp, { capture: true });
  }

  setBindings(bindings: Record<ActionName, string[]>): void {
    this.bindings = bindings;
    this.codeToActions.clear();
    const next = invertBindings(bindings);
    for (const [k, v] of next) this.codeToActions.set(k, v);
  }

  /** While a desk mini (sentence / errand / tamper) is fullscreen, set true. */
  setSuppressGameKeys(suppress: boolean): void {
    this.suppressGameKeys = suppress;
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
    if (this.suppressGameKeys) return;
    this.codesDown.add(e.code);
    const acts = this.codeToActions.get(e.code);
    if (acts) {
      if (InputManager.NAV_CODES.has(e.code)) e.preventDefault();
      for (const a of acts) this.justPressed.add(a);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    // Always clear physical key state so keys held before a desk mini opens
    // cannot stay "down" forever when keyup is suppressed for game actions.
    this.codesDown.delete(e.code);
    if (this.suppressGameKeys) return;
  };
}
