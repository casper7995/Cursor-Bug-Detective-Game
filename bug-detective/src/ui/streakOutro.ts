/**
 * Session streak tracker + 3-streak outro card.
 *
 * Streak counter persists in localStorage under "bd:streak". Increments
 * on correct submit, resets on wrong / new round started after a wrong.
 *
 * When the streak hits 3, the next results phase shows a brief
 * "Detective Pro" outro card BEFORE the normal results panel. The card
 * auto-dismisses after 2.4s or on click.
 */

const KEY = "bd:streak";

export function getStreak(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function setStreak(n: number): void {
  try {
    if (n <= 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(n));
  } catch {
    // ignore
  }
}

/**
 * Returns the new streak after recording the round outcome.
 * - correct: streak += 1
 * - wrong:   streak = 0
 */
export function recordRound(correct: boolean): number {
  const next = correct ? getStreak() + 1 : 0;
  setStreak(next);
  return next;
}

/**
 * Show a centered "Detective Pro — N in a row" outro card. Resolves
 * when the card finishes (auto-dismiss after `holdMs`, or click).
 */
export function showStreakOutro(
  container: HTMLElement,
  streak: number,
  holdMs = 2400,
): Promise<void> {
  ensureStyle();
  const overlay = document.createElement("div");
  overlay.className = "bd-streak-outro";
  overlay.innerHTML = `
    <div class="bd-streak-outro__card">
      <div class="bd-streak-outro__badge">🏅</div>
      <h2 class="bd-streak-outro__title">Detective Pro</h2>
      <p class="bd-streak-outro__sub">${streak} in a row — share your streak</p>
    </div>
  `;
  container.appendChild(overlay);

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      overlay.classList.add("bd-streak-outro--out");
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, 280);
      overlay.removeEventListener("click", finish);
      window.clearTimeout(timer);
    };
    overlay.addEventListener("click", finish);
    const timer = window.setTimeout(finish, holdMs);
  });
}

function ensureStyle(): void {
  const id = "bd-streak-outro-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .bd-streak-outro {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at center, rgba(20,22,30,0.55) 0%, rgba(0,0,0,0.85) 80%);
      z-index: 950;
      transition: opacity 240ms ease-out;
      cursor: pointer;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      animation: bdStreakIn 280ms ease-out;
    }
    @keyframes bdStreakIn {
      0%   { opacity: 0; transform: scale(0.985); }
      100% { opacity: 1; transform: scale(1); }
    }
    .bd-streak-outro--out { opacity: 0; pointer-events: none; }
    .bd-streak-outro__card {
      background: #1a1d24;
      border: 1px solid #2a2e3a;
      border-radius: 18px;
      padding: 32px 40px;
      text-align: center;
      color: #f1f3f7;
      box-shadow: 0 28px 80px rgba(0,0,0,0.7);
      animation: bdStreakPop 380ms cubic-bezier(.18,1.2,.4,1);
    }
    @keyframes bdStreakPop {
      0%   { transform: scale(0.7); }
      60%  { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    .bd-streak-outro__badge {
      font-size: 64px;
      line-height: 1;
      margin-bottom: 8px;
      animation: bdStreakSpin 1.6s ease-in-out infinite;
      display: inline-block;
    }
    @keyframes bdStreakSpin {
      0%, 100% { transform: rotate(-8deg); }
      50%      { transform: rotate(8deg); }
    }
    .bd-streak-outro__title {
      margin: 4px 0 6px;
      font-size: 30px;
      letter-spacing: -0.02em;
    }
    .bd-streak-outro__sub {
      margin: 0;
      font-size: 16px;
      opacity: 0.8;
    }
  `;
  document.head.appendChild(style);
}
