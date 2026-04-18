export interface AnswerPanel {
  readonly element: HTMLElement;
  show(prompt: string, choices: readonly string[]): void;
  hide(): void;
  onSubmit(handler: (choiceIndex: number) => void): void;
  destroy(): void;
}

const STYLE_OVERLAY =
  "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(20,20,28,0.78);backdrop-filter:blur(4px);pointer-events:auto;z-index:10;";
const STYLE_PANEL =
  "background:#1a1d24;color:#e8efff;padding:24px 28px;border-radius:18px;border:1px solid rgba(232,239,255,0.18);box-shadow:0 18px 48px rgba(0,0,0,0.55);min-width:360px;max-width:520px;width:90%;font-family:ui-sans-serif,system-ui,sans-serif;";
const STYLE_PROMPT =
  "font:600 18px ui-sans-serif,system-ui,sans-serif;margin:0 0 18px;color:#fff48a;letter-spacing:0.02em;";
const STYLE_BTN =
  "display:block;width:100%;margin:8px 0;padding:14px 16px;border-radius:12px;background:#252a36;color:#e8efff;border:1px solid rgba(232,239,255,0.12);font:500 15px ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:left;transition:background 80ms,border-color 80ms,transform 80ms;";
const STYLE_BTN_HOVER =
  "background:#2f3543;border-color:rgba(232,239,255,0.32);transform:translateY(-1px);";

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

  const buttons: HTMLButtonElement[] = [];
  let handler: ((choiceIndex: number) => void) | null = null;
  let focusedIndex = 0;

  function clearButtons(): void {
    for (const b of buttons) b.remove();
    buttons.length = 0;
  }

  function applyFocus(): void {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (!b) continue;
      b.style.cssText = STYLE_BTN + (i === focusedIndex ? STYLE_BTN_HOVER : "");
    }
  }

  function show(prompt: string, choices: readonly string[]): void {
    promptEl.textContent = prompt;
    clearButtons();
    focusedIndex = 0;
    for (let i = 0; i < choices.length; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = choices[i] ?? "";
      b.style.cssText = STYLE_BTN;
      b.addEventListener("mouseenter", () => {
        focusedIndex = i;
        applyFocus();
      });
      b.addEventListener("click", () => {
        handler?.(i);
      });
      panel.appendChild(b);
      buttons.push(b);
    }
    applyFocus();
    overlay.style.display = "flex";
  }

  function hide(): void {
    overlay.style.display = "none";
  }

  function onSubmit(h: (choiceIndex: number) => void): void {
    handler = h;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (overlay.style.display === "none") return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      focusedIndex = (focusedIndex + 1) % Math.max(1, buttons.length);
      applyFocus();
      e.preventDefault();
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      focusedIndex =
        (focusedIndex - 1 + buttons.length) % Math.max(1, buttons.length);
      applyFocus();
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      if (buttons.length > 0) handler?.(focusedIndex);
      e.preventDefault();
    } else if (e.key >= "1" && e.key <= "9") {
      const idx = Number.parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < buttons.length) handler?.(idx);
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);

  function destroy(): void {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  return { element: overlay, show, hide, onSubmit, destroy };
}
