import type { LeaderboardEntry } from "../api/scoreClient";
import { formatTime } from "../game/timer";

const STYLE_WRAP =
  "margin:0 0 16px;padding:12px 14px;background:#0f1218;border:1px solid rgba(232,239,255,0.08);border-radius:12px;font:13px ui-sans-serif,system-ui,sans-serif;";
const STYLE_TITLE =
  "font:600 12px ui-sans-serif,system-ui,sans-serif;text-transform:uppercase;letter-spacing:0.06em;color:#8696b6;margin:0 0 8px;";
const STYLE_ROW =
  "display:grid;grid-template-columns:28px 1fr 64px 56px 64px;gap:8px;padding:5px 4px;border-radius:6px;align-items:center;";
const STYLE_HEADER_ROW = STYLE_ROW + "color:#5a6580;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;";
const STYLE_ROW_HIGHLIGHT = STYLE_ROW + "background:rgba(255,244,138,0.12);border:1px solid rgba(255,244,138,0.3);";
const STYLE_EMPTY =
  "color:#5a6580;font-style:italic;padding:8px 4px;font-size:13px;";

export interface LeaderboardPanelView {
  entries: readonly LeaderboardEntry[];
  myRank: number | null;
  myScore: number | null;
}

/** Builds an HTMLElement node — append it to the results panel slot. */
export function renderLeaderboardPanel(view: LeaderboardPanelView): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = STYLE_WRAP;

  const title = document.createElement("div");
  title.style.cssText = STYLE_TITLE;
  title.textContent = "today's leaderboard";
  wrap.appendChild(title);

  if (view.entries.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = STYLE_EMPTY;
    empty.textContent = "no scores yet — be first.";
    wrap.appendChild(empty);
    return wrap;
  }

  const header = document.createElement("div");
  header.style.cssText = STYLE_HEADER_ROW;
  for (const cell of ["#", "name", "score", "clues", "time"]) {
    const c = document.createElement("span");
    c.textContent = cell;
    header.appendChild(c);
  }
  wrap.appendChild(header);

  const top = view.entries.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    if (!e) continue;
    const isMine = view.myRank != null && view.myRank === i + 1;
    const row = document.createElement("div");
    row.style.cssText = isMine ? STYLE_ROW_HIGHLIGHT : STYLE_ROW;
    appendCell(row, String(i + 1));
    appendCell(row, e.name);
    appendCell(row, String(e.score));
    appendCell(row, String(e.cluesUsed));
    appendCell(row, formatTime(e.elapsedMs));
    wrap.appendChild(row);
  }

  // If "my" rank is below the top 10, show a separator + my row.
  if (view.myRank != null && view.myRank > 10) {
    const sep = document.createElement("div");
    sep.style.cssText = "color:#5a6580;text-align:center;padding:4px 0;font-size:11px;";
    sep.textContent = "···";
    wrap.appendChild(sep);
    const mine = view.entries[view.myRank - 1];
    if (mine) {
      const row = document.createElement("div");
      row.style.cssText = STYLE_ROW_HIGHLIGHT;
      appendCell(row, String(view.myRank));
      appendCell(row, mine.name);
      appendCell(row, String(mine.score));
      appendCell(row, String(mine.cluesUsed));
      appendCell(row, formatTime(mine.elapsedMs));
      wrap.appendChild(row);
    }
  }

  return wrap;
}

function appendCell(row: HTMLElement, text: string): void {
  const c = document.createElement("span");
  c.textContent = text;
  c.style.color = "#e8efff";
  c.style.fontFamily = "ui-monospace, monospace";
  c.style.fontSize = "13px";
  c.style.overflow = "hidden";
  c.style.textOverflow = "ellipsis";
  c.style.whiteSpace = "nowrap";
  row.appendChild(c);
}

