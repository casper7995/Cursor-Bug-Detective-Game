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
    const dismiss = (label: string): void => {
      if (dismissed) return;
      dismissed = true;
      console.info(`[bug-detective] title splash dismissed via ${label}`);
      overlay.classList.add("bd-title--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 350);
      teardown();
    };
    // Use document-level capture-phase listeners. Some embedded views
    // (Simple Browser, sandboxed iframes) only deliver one of
    // pointerdown/mousedown/click and may not bubble to window or to the
    // overlay element. Capture-phase on document is the most reliable
    // path: events are dispatched here BEFORE any element handler can
    // stopPropagation. We listen for several event types so whichever
    // the host browser emits will fire dismiss.
    const onPointerDown = (): void => dismiss("pointerdown");
    const onMouseDown = (): void => dismiss("mousedown");
    const onClick = (): void => dismiss("click");
    const onTouchStart = (): void => dismiss("touchstart");
    const onKeyDown = (): void => dismiss("keydown");
    const teardown = (): void => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", onKeyDown, true);
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
      z-index: 100000;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: opacity 320ms ease-out;
      cursor: pointer;
      touch-action: manipulation;
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
