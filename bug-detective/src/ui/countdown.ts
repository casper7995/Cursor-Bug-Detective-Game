export interface Countdown {
  readonly element: HTMLElement;
  start(): void;
  stop(): void;
}

const STYLE_WRAP =
  "margin:0 0 18px;padding:10px 14px;background:linear-gradient(135deg,rgba(255,244,138,0.10),rgba(169,196,255,0.10));border:1px solid rgba(232,239,255,0.10);border-radius:12px;display:flex;justify-content:space-between;align-items:center;font-family:ui-sans-serif,system-ui,sans-serif;";
const STYLE_LABEL =
  "color:#a9c4ff;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;";
const STYLE_VALUE =
  "color:#fff48a;font-family:ui-monospace,monospace;font-size:18px;font-weight:700;";

/**
 * "Tomorrow's bug in HH:MM:SS" — counts down to next UTC midnight.
 */
export function createCountdown(): Countdown {
  const wrap = document.createElement("div");
  wrap.style.cssText = STYLE_WRAP;

  const label = document.createElement("span");
  label.style.cssText = STYLE_LABEL;
  label.textContent = "tomorrow's bug in";
  wrap.appendChild(label);

  const value = document.createElement("span");
  value.style.cssText = STYLE_VALUE;
  wrap.appendChild(value);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function nextUtcMidnight(): number {
    const d = new Date();
    return Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1,
      0,
      0,
      0,
    );
  }

  function tick(): void {
    const ms = nextUtcMidnight() - Date.now();
    if (ms <= 0) {
      value.textContent = "00:00:00";
      return;
    }
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    value.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function start(): void {
    tick();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(tick, 1000);
  }

  function stop(): void {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  return { element: wrap, start, stop };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
