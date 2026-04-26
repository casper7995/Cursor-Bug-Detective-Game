export interface AnswerPanel {
  readonly element: HTMLElement;
  show(prompt: string, evidenceLine?: string): void;
  hide(): void;
  setFormHint(message: string | null): void;
  onSubmitText(handler: (text: string) => void): void;
  focusInput(): void;
  destroy(): void;
}

const STYLE_OVERLAY =
  "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(26,24,18,0.88);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);pointer-events:auto;z-index:10;";
const STYLE_PANEL =
  "background:#14120b;color:#efe7d7;padding:24px 28px;border-radius:18px;border:1px solid rgba(245,78,0,0.35);box-shadow:0 18px 48px rgba(0,0,0,0.55);min-width:360px;max-width:520px;width:90%;font-family:'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;";
const STYLE_PROMPT =
  "font:600 18px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;margin:0 0 18px;color:#f54e00;letter-spacing:0.02em;";
const STYLE_HINT =
  "font:500 12px 'Berkeley Mono',ui-monospace,monospace;margin:0 0 8px;color:#c08532;letter-spacing:0.02em;line-height:1.4;min-height:1.2em;";
const STYLE_FORM_ERR =
  "font:500 12px 'Berkeley Mono',ui-monospace,monospace;margin:8px 0 0;color:#e8a050;letter-spacing:0.02em;line-height:1.4;min-height:1.2em;";
const STYLE_TA =
  "width:100%;min-height:88px;max-height:200px;resize:vertical;padding:12px 14px;border-radius:12px;background:#1a1812;color:#efe7d7;border:1px solid rgba(245,78,0,0.45);font:500 15px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;box-sizing:border-box;";
const STYLE_SUBMIT =
  "display:block;width:100%;margin:14px 0 0;padding:14px 16px;border-radius:12px;background:#1a1812;color:#efe7d7;border:1px solid rgba(245,78,0,0.45);font:500 15px 'Cursor Gothic',ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-align:center;";

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

  const evidenceEl = document.createElement("p");
  evidenceEl.style.cssText = STYLE_HINT;
  panel.appendChild(evidenceEl);

  const textarea = document.createElement("textarea");
  textarea.setAttribute("autocomplete", "off");
  textarea.setAttribute("autocapitalize", "sentences");
  textarea.style.cssText = STYLE_TA;
  textarea.placeholder = "Name the object and the wrong detail…";
  panel.appendChild(textarea);

  const formErr = document.createElement("p");
  formErr.style.cssText = STYLE_FORM_ERR;
  panel.appendChild(formErr);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = "Submit accusation";
  submitBtn.style.cssText = STYLE_SUBMIT;
  panel.appendChild(submitBtn);

  let handler: ((text: string) => void) | null = null;

  function setFormHint(message: string | null): void {
    formErr.textContent = message ?? "";
  }

  function show(prompt: string, evidenceLine?: string): void {
    promptEl.textContent = prompt;
    if (evidenceLine && evidenceLine.length > 0) {
      evidenceEl.style.display = "";
      evidenceEl.textContent = `four clues, one culprit: ${evidenceLine}`;
    } else {
      evidenceEl.style.display = "none";
      evidenceEl.textContent = "";
    }
    textarea.value = "";
    setFormHint(null);
    overlay.style.display = "flex";
    window.setTimeout(() => textarea.focus(), 0);
  }

  function focusInput(): void {
    textarea.focus();
  }

  function hide(): void {
    overlay.style.display = "none";
    setFormHint(null);
  }

  function onSubmitText(h: (text: string) => void): void {
    handler = h;
  }

  function doSubmit(): void {
    const t = textarea.value.replace(/\r\n/g, "\n").trim();
    handler?.(t);
  }

  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    doSubmit();
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      doSubmit();
    }
  });

  const onKey = (e: KeyboardEvent): void => {
    if (overlay.style.display === "none") return;
    if (e.key === "Escape") {
      e.stopPropagation();
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
    onSubmitText,
    focusInput,
    destroy,
  };
}
