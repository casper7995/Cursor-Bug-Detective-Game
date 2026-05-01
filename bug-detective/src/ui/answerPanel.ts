/**
 * Final-call panel: a multiple-choice case file. Player picks the line
 * consistent with all four cipher clues. Esc / "Back to desk" returns
 * to investigating (notebook preserved) so the panel never traps players.
 */

export interface AnswerPanel {
  readonly element: HTMLElement;
  /**
   * Open with the case prompt + evidence cipher line + ordered choice list.
   * `correctIndex` is the index into `choices` of the right pick.
   */
  show(args: {
    prompt: string;
    evidenceLine?: string;
    choices: readonly string[];
    correctIndex: number;
  }): void;
  hide(): void;
  setFormHint(message: string | null): void;
  /** Fires with `correct = true` only when the right choice was selected. */
  onSubmitChoice(
    handler: (result: { correct: boolean; index: number }) => void,
  ): void;
  /** Fires when the player presses Esc or the "Back to desk" button. */
  onCancel(handler: () => void): void;
  destroy(): void;
}

const STYLE_OVERLAY =
  "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(26,24,18,0.88);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);pointer-events:auto;z-index:10;";
const STYLE_PANEL =
  "background:#14120b;color:#efe7d7;padding:22px 26px 18px;border-radius:18px;border:1px solid rgba(245,78,0,0.35);box-shadow:0 18px 48px rgba(0,0,0,0.55);min-width:360px;max-width:540px;width:92%;font-family:'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;";
const STYLE_PROMPT =
  "font:600 18px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;margin:0 0 6px;color:#f54e00;letter-spacing:0.02em;";
const STYLE_SUB =
  "font:500 12px 'Berkeley Mono',ui-monospace,monospace;margin:0 0 14px;color:#a89072;letter-spacing:0.04em;line-height:1.5;";
const STYLE_HINT =
  "font:500 12px 'Berkeley Mono',ui-monospace,monospace;margin:0 0 12px;color:#c08532;letter-spacing:0.04em;line-height:1.4;min-height:1.2em;";
const STYLE_FORM_ERR =
  "font:500 12px 'Berkeley Mono',ui-monospace,monospace;margin:8px 0 0;color:#e8a050;letter-spacing:0.02em;line-height:1.4;min-height:1.2em;";
const STYLE_CHOICE_LIST =
  "display:flex;flex-direction:column;gap:8px;margin:0;";
const STYLE_CHOICE_BTN =
  "display:flex;gap:12px;align-items:center;width:100%;padding:13px 16px;border-radius:12px;background:#1a1812;color:#efe7d7;border:1px solid rgba(245,78,0,0.30);font:500 14px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:left;letter-spacing:0.01em;transition:border-color 0.12s ease, background 0.12s ease;";
const STYLE_CHOICE_TAG =
  "font:600 11px 'Berkeley Mono',ui-monospace,monospace;color:#c08532;letter-spacing:0.12em;flex-shrink:0;min-width:24px;";
const STYLE_FOOTER =
  "display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:12px;font:500 11px 'Berkeley Mono',ui-monospace,monospace;color:#8a7556;letter-spacing:0.04em;";
const STYLE_BACK =
  "padding:8px 14px;border-radius:10px;background:transparent;color:#a89072;border:1px solid rgba(168,144,114,0.35);font:500 12px 'Berkeley Mono',ui-monospace,monospace;cursor:pointer;letter-spacing:0.06em;";

export function createAnswerPanel(container: HTMLElement): AnswerPanel {
  const overlay = document.createElement("div");
  overlay.id = "answer-panel";
  overlay.style.cssText = STYLE_OVERLAY;
  container.appendChild(overlay);

  const panel = document.createElement("div");
  panel.style.cssText = STYLE_PANEL;
  overlay.appendChild(panel);

  const promptEl = document.createElement("h2");
  promptEl.style.cssText = STYLE_PROMPT;
  panel.appendChild(promptEl);

  const subEl = document.createElement("p");
  subEl.style.cssText = STYLE_SUB;
  subEl.textContent = "One line is consistent with every cipher you cracked.";
  panel.appendChild(subEl);

  const evidenceEl = document.createElement("p");
  evidenceEl.style.cssText = STYLE_HINT;
  panel.appendChild(evidenceEl);

  const choiceList = document.createElement("div");
  choiceList.style.cssText = STYLE_CHOICE_LIST;
  panel.appendChild(choiceList);

  const formErr = document.createElement("p");
  formErr.style.cssText = STYLE_FORM_ERR;
  panel.appendChild(formErr);

  const footer = document.createElement("div");
  footer.style.cssText = STYLE_FOOTER;
  panel.appendChild(footer);

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.textContent = "← back to desk";
  backBtn.style.cssText = STYLE_BACK;
  footer.appendChild(backBtn);

  const escHint = document.createElement("span");
  escHint.textContent = "esc · back to desk";
  footer.appendChild(escHint);

  let choiceHandler:
    | ((result: { correct: boolean; index: number }) => void)
    | null = null;
  let cancelHandler: (() => void) | null = null;
  let correctIndex = -1;

  function setFormHint(message: string | null): void {
    formErr.textContent = message ?? "";
  }

  /** Two-letter case tag for each row; deliberately not "A/B/C/D" so the
   *  copy reads like an evidence file rather than a quiz. */
  function tagFor(index: number): string {
    return `0${index + 1}`;
  }

  function clearChoices(): void {
    choiceList.replaceChildren();
  }

  function buildChoiceButton(text: string, index: number): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = STYLE_CHOICE_BTN;
    const tag = document.createElement("span");
    tag.style.cssText = STYLE_CHOICE_TAG;
    tag.textContent = tagFor(index);
    const label = document.createElement("span");
    label.textContent = text;
    btn.append(tag, label);
    btn.addEventListener("mouseenter", () => {
      btn.style.borderColor = "rgba(245,78,0,0.65)";
      btn.style.background = "#221d12";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.borderColor = "rgba(245,78,0,0.30)";
      btn.style.background = "#1a1812";
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const correct = index === correctIndex;
      choiceHandler?.({ correct, index });
    });
    return btn;
  }

  function show(args: {
    prompt: string;
    evidenceLine?: string;
    choices: readonly string[];
    correctIndex: number;
  }): void {
    promptEl.textContent = args.prompt;
    if (args.evidenceLine && args.evidenceLine.length > 0) {
      evidenceEl.style.display = "";
      evidenceEl.textContent = `cipher · ${args.evidenceLine}`;
    } else {
      evidenceEl.style.display = "none";
      evidenceEl.textContent = "";
    }
    correctIndex = args.correctIndex;
    clearChoices();
    args.choices.forEach((c, i) => {
      choiceList.appendChild(buildChoiceButton(c, i));
    });
    setFormHint(null);
    overlay.style.display = "flex";
  }

  function hide(): void {
    overlay.style.display = "none";
    setFormHint(null);
  }

  function onSubmitChoice(
    h: (result: { correct: boolean; index: number }) => void,
  ): void {
    choiceHandler = h;
  }

  function onCancel(h: () => void): void {
    cancelHandler = h;
  }

  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    cancelHandler?.();
  });

  // Capture-phase Esc handler so the panel always wins over deeper
  // listeners (some host browsers route keys oddly during overlays).
  const onKey = (e: KeyboardEvent): void => {
    if (overlay.style.display === "none") return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelHandler?.();
    }
  };
  window.addEventListener("keydown", onKey, true);

  function destroy(): void {
    window.removeEventListener("keydown", onKey, true);
    overlay.remove();
  }

  return {
    element: overlay,
    show,
    hide,
    setFormHint,
    onSubmitChoice,
    onCancel,
    destroy,
  };
}
