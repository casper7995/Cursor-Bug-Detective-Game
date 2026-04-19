/**
 * Full case-file copy on demand — same text as the intro sheet, dismissible.
 */

import { CASE_FILE_BODY_LINES, CASE_FILE_TAGLINE } from "./gameInstructions";

const STYLE_ID = "bd-casefile-modal-style";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .bd-casefile-modal {
      position: fixed;
      inset: 0;
      z-index: 100002;
      background: rgba(10, 11, 16, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: opacity 240ms ease-out;
    }
    .bd-casefile-modal--out { opacity: 0; pointer-events: none; }
    .bd-casefile-modal__panel {
      max-width: 520px;
      max-height: min(82vh, 640px);
      overflow: auto;
      background: linear-gradient(180deg, #f7f4ed 0%, #ebe6dc 100%);
      border: 1px solid rgba(245, 78, 0, 0.35);
      border-radius: 14px;
      padding: 22px 26px 20px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.45);
      color: #2a2d36;
    }
    .bd-casefile-modal__h2 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 700;
      color: #c45a18;
      font-family: "Cursor Gothic", ui-sans-serif, sans-serif;
    }
    .bd-casefile-modal__pre {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .bd-casefile-modal__btn {
      margin-top: 18px;
      padding: 10px 20px;
      border-radius: 10px;
      border: 1px solid rgba(245, 78, 0, 0.45);
      background: rgba(26, 24, 18, 0.92);
      color: #efe7d7;
      font: 600 14px "Cursor Gothic", ui-sans-serif, sans-serif;
      cursor: pointer;
      width: 100%;
    }
    .bd-casefile-modal__btn:hover {
      background: rgba(245, 78, 0, 0.18);
      color: #1a1812;
    }
  `;
  document.head.appendChild(style);
}

export function showCaseFileModal(container: HTMLElement): Promise<void> {
  ensureStyle();
  return new Promise<void>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "bd-casefile-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "bd-casefile-title");

    const bodyText = [CASE_FILE_TAGLINE, "", ...CASE_FILE_BODY_LINES].join(
      "\n",
    );

    const panel = document.createElement("div");
    panel.className = "bd-casefile-modal__panel";
    panel.innerHTML = `
      <h2 id="bd-casefile-title" class="bd-casefile-modal__h2">Case file</h2>
      <pre class="bd-casefile-modal__pre"></pre>
      <button type="button" class="bd-casefile-modal__btn">Close</button>
    `;
    const pre = panel.querySelector<HTMLPreElement>(".bd-casefile-modal__pre");
    if (pre) pre.textContent = bodyText;

    overlay.appendChild(panel);
    container.appendChild(overlay);

    const finish = (): void => {
      window.removeEventListener("keydown", onKey, true);
      overlay.classList.add("bd-casefile-modal--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 260);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey, true);

    panel.querySelector("button")?.addEventListener("click", finish);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish();
    });
  });
}
