/**
 * Settings panel — small gear-icon button in the top-right corner. Opens
 * a panel with mute toggle, restart button, skip-intro toggle, hotkey
 * reference, and an "About" blurb. Wires through to the audio module's
 * mute state and to caller-supplied callbacks for restart / skip-intro.
 *
 * Style: minimal, reuses the dark-on-charcoal aesthetic from the mobile
 * gate / answer panel. No external CSS.
 */

import { isMuted, setMuted } from "../audio/audio";
import { isSkipIntro, setSkipIntro } from "./skipIntroPref";

export interface SettingsPanelOptions {
  /** Called when the user clicks "Restart" inside the panel. */
  onRestart: () => void;
}

export interface SettingsPanel {
  /** The gear button + panel root. */
  readonly element: HTMLElement;
  /** Show/hide the gear button (e.g. hide during intro). */
  setVisible(v: boolean): void;
}

export function createSettingsPanel(
  container: HTMLElement,
  opts: SettingsPanelOptions,
): SettingsPanel {
  ensureStyle();

  const wrapper = document.createElement("div");
  wrapper.className = "bd-settings";

  const button = document.createElement("button");
  button.className = "bd-settings__btn";
  button.type = "button";
  button.title = "Settings";
  button.textContent = "⚙";

  const panel = document.createElement("div");
  panel.className = "bd-settings__panel";
  panel.innerHTML = `
    <div class="bd-settings__row">
      <span>Sound</span>
      <button class="bd-settings__toggle bd-settings__sound" type="button"
        data-on="${(!isMuted()).toString()}">
        ${isMuted() ? "Off" : "On"}
      </button>
    </div>
    <div class="bd-settings__row">
      <span>Skip intro next load</span>
      <button class="bd-settings__toggle bd-settings__skip" type="button"
        data-on="${isSkipIntro().toString()}">
        ${isSkipIntro() ? "On" : "Off"}
      </button>
    </div>
    <div class="bd-settings__row">
      <span>Restart round</span>
      <button class="bd-settings__action bd-settings__restart" type="button">
        Restart
      </button>
    </div>
    <div class="bd-settings__sep"></div>
    <div class="bd-settings__row">
      <span>Mute hotkey</span>
      <kbd>M</kbd>
    </div>
    <div class="bd-settings__row">
      <span>Submit answer</span>
      <kbd>Enter</kbd>
    </div>
    <div class="bd-settings__row">
      <span>Restart hotkey</span>
      <kbd>R</kbd>
    </div>
    <div class="bd-settings__about">
      Bug Detective · Vibe Jam 2026 · Built with Three.js
    </div>
  `;
  panel.style.display = "none";

  wrapper.appendChild(button);
  wrapper.appendChild(panel);
  container.appendChild(wrapper);

  let open = false;
  const setOpen = (v: boolean): void => {
    open = v;
    panel.style.display = v ? "block" : "none";
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!open);
  });
  document.addEventListener("click", (e) => {
    if (!open) return;
    if (e.target instanceof Node && wrapper.contains(e.target)) return;
    setOpen(false);
  });

  const soundToggle = panel.querySelector<HTMLButtonElement>(".bd-settings__sound");
  if (soundToggle) {
    soundToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const willMute = !isMuted();
      setMuted(willMute);
      soundToggle.dataset.on = (!willMute).toString();
      soundToggle.textContent = willMute ? "Off" : "On";
    });
  }

  const skipToggle = panel.querySelector<HTMLButtonElement>(".bd-settings__skip");
  if (skipToggle) {
    skipToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = !isSkipIntro();
      setSkipIntro(next);
      skipToggle.dataset.on = next.toString();
      skipToggle.textContent = next ? "On" : "Off";
    });
  }

  const restartBtn = panel.querySelector<HTMLButtonElement>(".bd-settings__restart");
  if (restartBtn) {
    restartBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(false);
      opts.onRestart();
    });
  }

  // Update sound toggle label if M hotkey changes mute while panel is open.
  window.setInterval(() => {
    if (!open || !soundToggle) return;
    const wantOn = (!isMuted()).toString();
    if (soundToggle.dataset.on !== wantOn) {
      soundToggle.dataset.on = wantOn;
      soundToggle.textContent = isMuted() ? "Off" : "On";
    }
  }, 250);

  return {
    element: wrapper,
    setVisible: (v: boolean) => {
      wrapper.style.display = v ? "block" : "none";
    },
  };
}

function ensureStyle(): void {
  const id = "bd-settings-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-settings {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 800;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .bd-settings__btn {
      appearance: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(20, 22, 30, 0.7);
      color: #f1f3f7;
      border: 1px solid rgba(255,255,255,0.15);
      font-size: 18px;
      cursor: pointer;
      display: grid;
      place-items: center;
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
    }
    .bd-settings__btn:hover { background: rgba(40, 44, 56, 0.85); }
    .bd-settings__panel {
      position: absolute;
      top: 44px;
      right: 0;
      min-width: 240px;
      background: #1a1d24;
      border: 1px solid #2a2e3a;
      border-radius: 10px;
      padding: 12px 14px;
      color: #f1f3f7;
      font-size: 14px;
      box-shadow: 0 16px 36px rgba(0,0,0,0.55);
    }
    .bd-settings__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .bd-settings__sep {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 6px 0;
    }
    .bd-settings__row kbd {
      background: #2a2e3a;
      border: 1px solid #3a3f4d;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 12px;
      font-family: ui-monospace, "SF Mono", monospace;
    }
    .bd-settings__toggle,
    .bd-settings__action {
      appearance: none;
      background: #2a2e3a;
      border: 1px solid #3a3f4d;
      border-radius: 4px;
      color: #f1f3f7;
      padding: 2px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .bd-settings__toggle[data-on="true"] {
      background: #1d9bf0;
      border-color: #1d9bf0;
    }
    .bd-settings__action:hover { background: #3a3f4d; }
    .bd-settings__about {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 11px;
      opacity: 0.55;
      letter-spacing: 0.04em;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}
