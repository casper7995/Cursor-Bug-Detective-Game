export interface ResultsView {
  readonly correct: boolean;
  readonly score: number;
  readonly cluesUsed: number;
  readonly elapsedMs: number;
  readonly revealText: string;
  /** Optional rank from leaderboard worker. */
  readonly rank: number | null;
}

export interface ResultsPanel {
  readonly element: HTMLElement;
  show(view: ResultsView): void;
  hide(): void;
  onRestart(handler: () => void): void;
  onShare(handler: () => void): void;
  setLeaderboardSlot(node: HTMLElement | null): void;
  setCountdownSlot(node: HTMLElement | null): void;
  destroy(): void;
}

const STYLE_OVERLAY =
  "position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(20,20,28,0.86);backdrop-filter:blur(6px);pointer-events:auto;z-index:11;padding:24px;font-family:ui-sans-serif,system-ui,sans-serif;";
const STYLE_PANEL =
  "background:#1a1d24;color:#e8efff;padding:28px 32px;border-radius:20px;border:1px solid rgba(232,239,255,0.18);box-shadow:0 20px 56px rgba(0,0,0,0.6);width:min(560px,92vw);";
const STYLE_HEADLINE =
  "font:700 26px ui-sans-serif,system-ui,sans-serif;margin:0 0 6px;letter-spacing:0.02em;";
const STYLE_REVEAL =
  "font:400 15px ui-sans-serif,system-ui,sans-serif;margin:0 0 20px;color:#a9c4ff;line-height:1.45;";
const STYLE_STATS =
  "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:0 0 20px;font:500 13px ui-monospace,monospace;";
const STYLE_STAT_BOX =
  "background:#252a36;border:1px solid rgba(232,239,255,0.08);border-radius:10px;padding:10px 12px;";
const STYLE_STAT_LABEL =
  "display:block;font-size:11px;color:#8696b6;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;";
const STYLE_STAT_VALUE =
  "display:block;font-size:18px;color:#e8efff;font-weight:600;";
const STYLE_BTN_ROW = "display:flex;gap:10px;justify-content:flex-end;";
const STYLE_BTN =
  "padding:11px 18px;border-radius:10px;border:1px solid rgba(232,239,255,0.18);background:#252a36;color:#e8efff;font:600 14px ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:background 80ms;";
const STYLE_BTN_PRIMARY =
  "padding:11px 18px;border-radius:10px;border:1px solid rgba(255,244,138,0.45);background:#fff48a;color:#1a1d24;font:700 14px ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:background 80ms;";

export function createResultsPanel(container: HTMLElement): ResultsPanel {
  const overlay = document.createElement("div");
  overlay.id = "results-panel";
  overlay.style.cssText = STYLE_OVERLAY;
  container.appendChild(overlay);

  const panel = document.createElement("div");
  panel.style.cssText = STYLE_PANEL;
  overlay.appendChild(panel);

  const headline = document.createElement("h2");
  headline.style.cssText = STYLE_HEADLINE;
  panel.appendChild(headline);

  const reveal = document.createElement("p");
  reveal.style.cssText = STYLE_REVEAL;
  panel.appendChild(reveal);

  const stats = document.createElement("div");
  stats.style.cssText = STYLE_STATS;
  panel.appendChild(stats);
  const statScore = makeStat("score");
  const statClues = makeStat("clues");
  const statTime = makeStat("time");
  stats.appendChild(statScore.box);
  stats.appendChild(statClues.box);
  stats.appendChild(statTime.box);

  const lbSlot = document.createElement("div");
  panel.appendChild(lbSlot);

  const countdownSlot = document.createElement("div");
  panel.appendChild(countdownSlot);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = STYLE_BTN_ROW;
  panel.appendChild(btnRow);

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.textContent = "share";
  shareBtn.style.cssText = STYLE_BTN;
  btnRow.appendChild(shareBtn);

  const restartBtn = document.createElement("button");
  restartBtn.type = "button";
  restartBtn.textContent = "play again (R)";
  restartBtn.style.cssText = STYLE_BTN_PRIMARY;
  btnRow.appendChild(restartBtn);

  let restartHandler: (() => void) | null = null;
  let shareHandler: (() => void) | null = null;
  restartBtn.addEventListener("click", () => restartHandler?.());
  shareBtn.addEventListener("click", () => shareHandler?.());

  const onKey = (e: KeyboardEvent): void => {
    if (overlay.style.display === "none") return;
    if (e.key === "r" || e.key === "R" || e.key === "Enter") {
      restartHandler?.();
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);

  function show(view: ResultsView): void {
    headline.textContent = view.correct ? "you found it" : "wrong call";
    headline.style.color = view.correct ? "#7adf7a" : "#ff8a7a";
    reveal.textContent = view.revealText;
    statScore.value.textContent = String(view.score);
    statClues.value.textContent = String(view.cluesUsed);
    statTime.value.textContent = formatTime(view.elapsedMs);
    overlay.style.display = "flex";
  }

  function hide(): void {
    overlay.style.display = "none";
  }

  function setLeaderboardSlot(node: HTMLElement | null): void {
    lbSlot.innerHTML = "";
    if (node) lbSlot.appendChild(node);
  }

  function setCountdownSlot(node: HTMLElement | null): void {
    countdownSlot.innerHTML = "";
    if (node) countdownSlot.appendChild(node);
  }

  function destroy(): void {
    window.removeEventListener("keydown", onKey);
    overlay.remove();
  }

  return {
    element: overlay,
    show,
    hide,
    onRestart(h) {
      restartHandler = h;
    },
    onShare(h) {
      shareHandler = h;
    },
    setLeaderboardSlot,
    setCountdownSlot,
    destroy,
  };
}

function makeStat(label: string): { box: HTMLElement; value: HTMLElement } {
  const box = document.createElement("div");
  box.style.cssText = STYLE_STAT_BOX;
  const labelEl = document.createElement("span");
  labelEl.style.cssText = STYLE_STAT_LABEL;
  labelEl.textContent = label;
  box.appendChild(labelEl);
  const valueEl = document.createElement("span");
  valueEl.style.cssText = STYLE_STAT_VALUE;
  valueEl.textContent = "—";
  box.appendChild(valueEl);
  return { box, value: valueEl };
}

function formatTime(ms: number): string {
  const sec = Math.max(0, ms / 1000);
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}
