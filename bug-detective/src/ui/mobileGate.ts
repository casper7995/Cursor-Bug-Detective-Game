/**
 * Mobile-fallback gate.
 *
 * Bug Detective is designed around a desktop mouse cursor: the wow-opener
 * tracks the mouse to project the mascot onto the page, hover-to-find
 * works only with hover, and the keyboard shortcuts (1/2/3, Enter, R)
 * have no touch equivalent. Rather than ship a half-broken touch path,
 * we show a friendly "open on desktop" screen on small / coarse-pointer
 * devices and let the player share the link to themselves.
 *
 * This module never throws; if `document` isn't available (server-side
 * pre-render, never used here) or matchMedia isn't supported, isMobile()
 * just returns false and we proceed normally.
 */

export interface MobileGate {
  /** True if we're showing the mobile fallback (so main.ts can skip init). */
  readonly active: boolean;
}

/**
 * Detect "this device probably can't play". Returns true when:
 *   - The primary pointer is coarse (touch), AND
 *   - The viewport is narrow (< 720px).
 *
 * Either alone is unreliable (Surface tablets have coarse pointer + big
 * screens; some tiny laptop windows are narrow but mouse-driven). The
 * combination catches phones / portrait tablets without false-positiving
 * on small desktop windows.
 */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  return coarse && narrow;
}

/**
 * Mount a full-screen "open on desktop" panel into the given container
 * and return a MobileGate handle. Caller should bail out of normal init
 * when active=true.
 */
export function mountMobileGate(container: HTMLElement): MobileGate {
  const panel = document.createElement("div");
  panel.className = "bd-mobile-gate";
  panel.innerHTML = `
    <div class="bd-mobile-gate__card">
      <div class="bd-mobile-gate__icon">🐛🔎</div>
      <h1>Bug Detective is built for desktop</h1>
      <p>
        This game uses your mouse to peel back the page and inspect the desk
        for anomalies. Touch isn’t supported (yet). Open this URL on a laptop
        or desktop to play today’s case.
      </p>
      <div class="bd-mobile-gate__row">
        <button class="bd-mobile-gate__copy" type="button">Copy link</button>
        <a class="bd-mobile-gate__share" href="#" target="_blank" rel="noopener">
          Share on X
        </a>
      </div>
      <p class="bd-mobile-gate__small">
        Tip: send yourself this link, then open it on desktop to play.
      </p>
    </div>
  `;
  container.appendChild(panel);

  const styleId = "bd-mobile-gate-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
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
      }
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

  return { active: true };
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
      // Fallback for older browsers without clipboard API.
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
