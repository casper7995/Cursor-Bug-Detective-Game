/**
 * Mobile-fallback gate.
 *
 * Bug Detective is built for desktop mouse — the page-peel intro tracks
 * the cursor and the investigation phase is hover-driven. On phones we
 * show a dismissable card that explains the trade-off and offers two
 * options:
 *   - "Open on desktop" → copy/share the link.
 *   - "Play simplified"  → boot the simplified touch flow (no peel,
 *                          tap-to-investigate, no idle-bob).
 *
 * Returns a Promise that resolves with the user's choice. Caller
 * (main.ts) branches on that.
 *
 * This module never throws; if `document` isn't available or matchMedia
 * isn't supported, isMobile() just returns false and we proceed normally.
 */

export type MobileChoice = "simplified" | "desktop-only";

/**
 * Detect "this device probably can't run the desktop flow as designed".
 * Returns true when the primary pointer is coarse (touch) AND the
 * viewport is narrow (< 720px). Either alone is unreliable.
 */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  return coarse && narrow;
}

/**
 * Mount the mobile gate card. Resolves once the user clicks one of the
 * two buttons; the card is removed before resolving.
 *
 * `desktop-only` is the "I'll come back on desktop" path — main.ts will
 * not boot the game in that case.
 *
 * `simplified` is the "play it anyway, touch-mode" path — main.ts will
 * boot the simplified touch flow.
 */
export function mountMobileGate(
  container: HTMLElement,
): Promise<MobileChoice> {
  ensureStyle();
  return new Promise<MobileChoice>((resolve) => {
    const panel = document.createElement("div");
    panel.className = "bd-mobile-gate";
    panel.innerHTML = `
      <div class="bd-mobile-gate__card">
        <div class="bd-mobile-gate__icon">🐛🔎</div>
        <h1>Best played on desktop</h1>
        <p>
          Bug Detective uses the page-peel intro and hover-to-investigate
          mechanics designed for a mouse. You can play a simplified
          touch version below — tap a desk prop to inspect it.
        </p>
        <div class="bd-mobile-gate__row bd-mobile-gate__primary">
          <button class="bd-mobile-gate__play" type="button">
            Play simplified
          </button>
        </div>
        <div class="bd-mobile-gate__row">
          <button class="bd-mobile-gate__copy" type="button">Copy link</button>
          <a class="bd-mobile-gate__share" href="#" target="_blank" rel="noopener">
            Share on X
          </a>
        </div>
        <p class="bd-mobile-gate__small">
          Tip: send yourself this link, then open it on desktop for the
          full experience.
        </p>
      </div>
    `;
    container.appendChild(panel);

    const url = window.location.href;
    const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      "🐛 Bug Detective — daily 90-second anomaly hunt. Best on desktop:",
    )}&url=${encodeURIComponent(url)}`;
    const shareLink = panel.querySelector<HTMLAnchorElement>(".bd-mobile-gate__share");
    if (shareLink) shareLink.href = tweet;

    const copyBtn = panel.querySelector<HTMLButtonElement>(".bd-mobile-gate__copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        void copyToClipboard(url, copyBtn);
      });
    }

    const playBtn = panel.querySelector<HTMLButtonElement>(".bd-mobile-gate__play");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        panel.classList.add("bd-mobile-gate--out");
        window.setTimeout(() => {
          panel.remove();
          resolve("simplified");
        }, 240);
      });
    }
  });
}

function ensureStyle(): void {
  const id = "bd-mobile-gate-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-mobile-gate {
      position: fixed;
      inset: 0;
      background: #0e0f15;
      color: #f1f3f7;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      z-index: 1000;
      transition: opacity 220ms ease-out;
    }
    .bd-mobile-gate--out { opacity: 0; pointer-events: none; }
    .bd-mobile-gate__card {
      max-width: 460px;
      text-align: center;
      background: #1a1d24;
      border: 1px solid #2a2e3a;
      border-radius: 16px;
      padding: 28px 24px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6);
    }
    .bd-mobile-gate__icon { font-size: 56px; line-height: 1; margin-bottom: 8px; }
    .bd-mobile-gate h1 {
      font-size: 22px;
      line-height: 1.25;
      margin: 8px 0 12px;
    }
    .bd-mobile-gate p {
      font-size: 15px;
      line-height: 1.5;
      opacity: 0.85;
      margin: 0 0 16px;
    }
    .bd-mobile-gate__small {
      font-size: 13px;
      opacity: 0.6;
    }
    .bd-mobile-gate__row {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin: 12px 0 16px;
    }
    .bd-mobile-gate__primary { margin-top: 8px; }
    .bd-mobile-gate__play {
      appearance: none;
      background: #fff48a;
      color: #1a1d24;
      border: 1px solid #fff48a;
      border-radius: 10px;
      padding: 12px 22px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      max-width: 280px;
    }
    .bd-mobile-gate__play:active { transform: translateY(1px); }
    .bd-mobile-gate__copy,
    .bd-mobile-gate__share {
      appearance: none;
      background: #2a2e3a;
      color: #f1f3f7;
      border: 1px solid #3a3f4d;
      border-radius: 10px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .bd-mobile-gate__share { background: #1d9bf0; border-color: #1d9bf0; }
    .bd-mobile-gate__copy:active,
    .bd-mobile-gate__share:active { transform: translateY(1px); }
  `;
  document.head.appendChild(style);
}

async function copyToClipboard(
  text: string,
  btn: HTMLButtonElement,
): Promise<void> {
  const original = btn.textContent ?? "Copy link";
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    btn.textContent = "Copied!";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => {
    btn.textContent = original;
  }, 1500);
}
