/**
 * Optional "How to Play" modal — not shown on first load by default (the case
 * file carries the same instructions). Use `?howto=1` or `force: true` to open.
 * `bd:hasSeenHowToPlay` still gates repeat visits unless forced.
 */

import { HOWTO_MODAL_STEPS } from "./gameInstructions";

const STORAGE_KEY = "bd:hasSeenHowToPlay";

export interface ShowHowToPlayOptions {
  /** When true, always show the modal (e.g. dev). */
  readonly force?: boolean;
}

export async function showHowToPlay(
  container: HTMLElement,
  opts?: ShowHowToPlayOptions,
): Promise<void> {
  if (!opts?.force) {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* ignore */
    }
  }

  ensureStyle();

  await new Promise<void>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "bd-howto";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "bd-howto-title");

    const inner = document.createElement("div");
    inner.className = "bd-howto__panel";

    inner.innerHTML = `
      <h2 id="bd-howto-title" class="bd-howto__h2">How to play</h2>
      <ol class="bd-howto__steps">
        ${HOWTO_MODAL_STEPS.map(
          (s, i) => `
          <li class="bd-howto__step">
            <span class="bd-howto__icon" aria-hidden="true">${s.icon}</span>
            <div>
              <div class="bd-howto__step-title">${i + 1}. ${s.title}</div>
              <p class="bd-howto__step-body">${s.body}</p>
            </div>
          </li>`,
        ).join("")}
      </ol>
      <label class="bd-howto__remember">
        <input type="checkbox" class="bd-howto__checkbox" checked />
        <span>Don't show again</span>
      </label>
      <button type="button" class="bd-howto__btn">Got it — let's play</button>
    `;

    overlay.appendChild(inner);
    container.appendChild(overlay);

    const btn = inner.querySelector<HTMLButtonElement>(".bd-howto__btn");
    const checkbox = inner.querySelector<HTMLInputElement>(
      ".bd-howto__checkbox",
    );

    function finish(): void {
      window.removeEventListener("keydown", onKey, true);
      if (checkbox?.checked) {
        try {
          localStorage.setItem(STORAGE_KEY, "1");
        } catch {
          /* ignore */
        }
      }
      overlay.classList.add("bd-howto--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 280);
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };

    window.addEventListener("keydown", onKey, true);
    btn?.addEventListener("click", finish);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish();
    });
  });
}

function ensureStyle(): void {
  const id = "bd-howto-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-howto {
      position: fixed;
      inset: 0;
      z-index: 100001;
      background: rgba(10, 11, 16, 0.72);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: opacity 280ms ease-out;
    }
    .bd-howto--out { opacity: 0; pointer-events: none; }
    .bd-howto__panel {
      max-width: 520px;
      width: 100%;
      background: linear-gradient(165deg, #1e2229 0%, #14161c 100%);
      border: 1px solid rgba(245, 120, 40, 0.35);
      border-radius: 14px;
      padding: 22px 24px 20px;
      color: #e8eaef;
      box-shadow: 0 24px 48px rgba(0,0,0,0.55);
    }
    .bd-howto__h2 {
      margin: 0 0 16px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #f07828;
    }
    .bd-howto__steps {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .bd-howto__step {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .bd-howto__icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(245, 120, 40, 0.12);
      border-radius: 8px;
      font-size: 18px;
    }
    .bd-howto__step-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 4px;
      color: #f1f3f7;
    }
    .bd-howto__step-body {
      margin: 0;
      font-size: 14px;
      line-height: 1.45;
      opacity: 0.88;
    }
    .bd-howto__remember {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 18px 0 14px;
      font-size: 13px;
      opacity: 0.85;
      cursor: pointer;
      user-select: none;
    }
    .bd-howto__checkbox { accent-color: #f07828; cursor: pointer; }
    .bd-howto__btn {
      width: 100%;
      padding: 12px 18px;
      border-radius: 10px;
      border: 1px solid rgba(245, 120, 40, 0.5);
      background: rgba(245, 120, 40, 0.18);
      color: #ffe8d4;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      transition: background 120ms, border-color 120ms;
    }
    .bd-howto__btn:hover {
      background: rgba(245, 120, 40, 0.28);
      border-color: rgba(245, 120, 40, 0.75);
    }
  `;
  document.head.appendChild(style);
}
