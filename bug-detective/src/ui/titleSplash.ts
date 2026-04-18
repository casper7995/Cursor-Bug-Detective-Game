/**
 * Title splash — full-screen intro shown before the page-peel kicks off.
 *
 * Shows the game title + a "press anything" prompt. Resolves the returned
 * promise when the user clicks, taps, or presses any key. The splash
 * fades out then removes itself from the DOM.
 *
 * Used by main.ts to wait for an explicit user gesture before starting
 * the audio context (browsers require it) and the choreographed intro.
 */

export interface TitleSplash {
  /** Resolves once the user dismisses the splash. */
  readonly ready: Promise<void>;
}

export function showTitleSplash(container: HTMLElement): TitleSplash {
  ensureStyle();

  const overlay = document.createElement("div");
  overlay.className = "bd-title";
  overlay.innerHTML = `
    <div class="bd-title__inner">
      <div class="bd-title__logo">
        <span class="bd-title__bug">🐛</span>
        <span class="bd-title__lens">🔎</span>
      </div>
      <h1 class="bd-title__h1">Bug Detective</h1>
      <p class="bd-title__sub">A daily 90-second anomaly hunt</p>
      <p class="bd-title__cta">Click anywhere to begin</p>
      <p class="bd-title__hint">Vibe Jam 2026</p>
    </div>
  `;
  container.appendChild(overlay);

  const ready = new Promise<void>((resolve) => {
    let dismissed = false;
    const dismiss = (): void => {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.add("bd-title--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 350);
      teardown();
    };
    const teardown = (): void => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("touchstart", dismiss);
    };
    window.addEventListener("pointerdown", dismiss, { once: true });
    window.addEventListener("keydown", dismiss, { once: true });
    window.addEventListener("touchstart", dismiss, { once: true });
  });

  return { ready };
}

function ensureStyle(): void {
  const id = "bd-title-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-title {
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse at center, #1a1d24 0%, #0a0b10 80%);
      color: #f1f3f7;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 900;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: opacity 320ms ease-out;
      cursor: pointer;
    }
    .bd-title--out { opacity: 0; pointer-events: none; }
    .bd-title__inner { text-align: center; max-width: 520px; padding: 24px; }
    .bd-title__logo { font-size: 72px; line-height: 1; margin-bottom: 12px; }
    .bd-title__bug, .bd-title__lens { display: inline-block; }
    .bd-title__lens { animation: bdTitleSpin 5s linear infinite; }
    @keyframes bdTitleSpin {
      0%   { transform: rotate(-12deg); }
      50%  { transform: rotate(12deg); }
      100% { transform: rotate(-12deg); }
    }
    .bd-title__h1 {
      font-size: clamp(36px, 7vw, 64px);
      letter-spacing: -0.02em;
      margin: 8px 0 4px;
    }
    .bd-title__sub {
      font-size: 18px;
      opacity: 0.78;
      margin: 0 0 28px;
    }
    .bd-title__cta {
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.85;
      animation: bdTitlePulse 1.6s ease-in-out infinite;
    }
    @keyframes bdTitlePulse {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1;    }
    }
    .bd-title__hint {
      margin-top: 28px;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0.4;
    }
  `;
  document.head.appendChild(style);
}
