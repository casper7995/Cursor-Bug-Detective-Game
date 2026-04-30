/** Tab autocomplete — Finish the Sentence rendered as a Cursor editor. */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import {
  drawAiAvatar,
  drawAiCard,
  drawAiProgressLine,
  inRect,
  wrapLines,
  type Rect,
} from "../desk/aiCard";
import type { EndingKind, PickColor, SentenceSlot } from "./types";

const COLOR_BY_PICK: Record<PickColor, string> = {
  blue: CURSOR_AI.blue,
  purple: CURSOR_AI.purple,
  orange: CURSOR_AI.accent,
};
const DEFAULT_ROW_ORDER: readonly PickColor[] = ["blue", "purple", "orange"];

// ---------------------------------------------------------------------
// Editor surface — Cursor IDE styling
// ---------------------------------------------------------------------
export const SENTENCE_LAYOUT = {
  editorX: 16,
  editorY: 44,
  editorW: 480,
  /** Slightly shorter so the pick popover + footer fit in 320px canvas. */
  editorH: 172,
  /** Suggestion popover positioned beneath the editor. */
  popoverX: 28,
  popoverY: 220,
  popoverW: 358,
  popoverRowH: 22,
} as const;

export interface EditorScenePos {
  /** End-of-typed-text position (caret), in canvas coords. */
  caretX: number;
  caretY: number;
}

export function drawEditorScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  paragraph: string,
  typingProgress01: number,
  showCaret: boolean,
): EditorScenePos {
  const L = SENTENCE_LAYOUT;
  // Page background
  ctx.fillStyle = "#eceae3";
  ctx.fillRect(0, 0, W, H);

  drawAiCard(ctx, L.editorX, L.editorY, L.editorW, L.editorH, { radius: 8 });

  // File-tab strip
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.fillRect(L.editorX + 1, L.editorY + 1, L.editorW - 2, 22);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.beginPath();
  ctx.moveTo(L.editorX + 1, L.editorY + 23);
  ctx.lineTo(L.editorX + L.editorW - 1, L.editorY + 23);
  ctx.stroke();
  // Filename pill
  ctx.fillStyle = CURSOR_AI.surface;
  const tabW = 134;
  ctx.fillRect(L.editorX + 8, L.editorY + 1, tabW, 22);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.beginPath();
  ctx.moveTo(L.editorX + 8 + tabW, L.editorY + 1);
  ctx.lineTo(L.editorX + 8 + tabW, L.editorY + 23);
  ctx.stroke();
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("case_file.md", L.editorX + 18, L.editorY + 12);
  // Right-side breadcrumb
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    "Tab · cycle · Enter · accept",
    L.editorX + L.editorW - 12,
    L.editorY + 12,
  );
  ctx.textAlign = "left";

  // Gutter (line numbers)
  const gutterW = 32;
  const bodyX = L.editorX + gutterW;
  const bodyY = L.editorY + 32;
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.fillRect(L.editorX + 1, bodyY - 8, gutterW, L.editorH - 32);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";

  // Body text
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "12px 'Cursor Mono', ui-monospace, monospace";
  const totalChars = paragraph.length;
  const visibleChars = Math.floor(
    totalChars * Math.max(0, Math.min(1, typingProgress01)),
  );
  const visible = paragraph.slice(0, visibleChars);
  const lines = wrapLines(ctx, visible, L.editorW - gutterW - 24);

  // Render visible lines + line numbers
  let yLine = bodyY + 6;
  let lastLineW = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(String(i + 1), L.editorX + gutterW - 6, yLine);
    ctx.textAlign = "left";
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "12px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(line, bodyX + 8, yLine);
    lastLineW = ctx.measureText(line).width;
    yLine += 16;
    if (yLine > L.editorY + L.editorH - 6) break;
  }

  // Caret position — end of last rendered line
  const caretX = bodyX + 8 + lastLineW + 1;
  const caretY = yLine - 16;
  if (showCaret) {
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) {
      ctx.fillStyle = CURSOR_AI.accent;
      ctx.fillRect(caretX, caretY - 10, 2, 14);
    }
  }
  ctx.textBaseline = "alphabetic";
  return { caretX, caretY };
}

// ---------------------------------------------------------------------
// Suggestion popover — Cursor inline-completions style
// ---------------------------------------------------------------------
export interface SuggestionRowRect extends Rect {
  readonly color: PickColor;
  readonly word: string;
  readonly index: number;
}

/** Per-slot row shuffle; must match `pickTemplate` in `templates.ts`. */
export { getSuggestionRowOrder } from "./templates";

export function getSuggestionRowRects(
  ctx: CanvasRenderingContext2D,
  options: { blue: string; purple: string; orange: string },
  rowOrder: readonly PickColor[] = DEFAULT_ROW_ORDER,
): readonly SuggestionRowRect[] {
  const L = SENTENCE_LAYOUT;
  ctx.font = "12px 'Cursor Mono', ui-monospace, monospace";
  const rows: SuggestionRowRect[] = [];
  for (let i = 0; i < 3; i++) {
    const c = rowOrder[i] as PickColor;
    const word = options[c];
    rows.push({
      x: L.popoverX,
      y: L.popoverY + i * L.popoverRowH,
      w: L.popoverW,
      h: L.popoverRowH,
      color: c,
      word,
      index: i,
    });
  }
  const widths = rows.map((r) => ctx.measureText(r.word).width);
  const popW = Math.max(L.popoverW, Math.max(...widths) + 100);
  for (const r of rows) (r as { w: number }).w = popW;
  return rows;
}

export function drawSuggestionPopover(
  ctx: CanvasRenderingContext2D,
  rows: readonly SuggestionRowRect[],
  highlightRow: number | null,
  secondsLeft01: number,
): void {
  if (rows.length === 0) return;
  const first = rows[0] as SuggestionRowRect;
  const last = rows[rows.length - 1] as SuggestionRowRect;
  const popW = first.w;
  /** Space for hint line, gap, timer track, and bottom inset (fits 512×320). */
  const FOOTER_PAD = 34;
  const popH = last.y + last.h - first.y + FOOTER_PAD;
  // Soft popover card
  drawAiCard(ctx, first.x, first.y, popW, popH, { radius: 8 });
  // Each row
  for (const r of rows) {
    const isHL = highlightRow === r.index;
    if (isHL) {
      ctx.fillStyle = CURSOR_AI.surfaceMute;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h);
      ctx.strokeStyle = CURSOR_AI.borderStrong;
      ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    // Leading arrow icon in row color
    ctx.fillStyle = COLOR_BY_PICK[r.color];
    ctx.font = "700 12px 'Cursor Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText("→", r.x + 12, r.y + r.h / 2 + 1);
    // Word
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "12px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(r.word, r.x + 30, r.y + r.h / 2 + 1);
    // Number badge — display row, not the answer. (No "case/alt/nope"
    // hint badge: that was an answer-key spoiler that defeated the
    // read-the-clue puzzle.)
    ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
    const badgeW = 30;
    const badgeX = r.x + r.w - badgeW - 8;
    const badgeY = r.y + (r.h - 14) / 2;
    ctx.fillStyle = CURSOR_AI.surfaceMute;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, 14, 4);
    ctx.fill();
    ctx.strokeStyle = CURSOR_AI.border;
    ctx.stroke();
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.textAlign = "center";
    ctx.fillText(String(r.index + 1), badgeX + badgeW / 2, badgeY + 8);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  const cardBottom = first.y + popH;
  const trackH = 4;
  const progressTop = cardBottom - 2 - trackH;
  const hintBaseline = progressTop - 5;
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let hint = "Tab cycles · Enter accepts · read the clue";
  const hintMax = popW - 24;
  if (ctx.measureText(hint).width > hintMax) {
    hint = "Tab / Enter — read the clue";
  }
  ctx.fillText(hint, first.x + 8, hintBaseline);
  // Idle timer line at the bottom of the popover
  drawAiProgressLine(ctx, first.x + 8, progressTop, popW - 16, secondsLeft01, {
    tone: secondsLeft01 < 0.25 ? "alert" : "default",
  });
}

// ---------------------------------------------------------------------
// Intro / result cards
// ---------------------------------------------------------------------
export function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 160;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  drawAiAvatar(ctx, x + 32, y + 36, { size: 28 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.fillText("Case file — Tab autocomplete", x + 60, y + 30);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText("8 beats · 3 suggestions (shuffled order)", x + 60, y + 48);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.fillText("Read the clue. Tab cycles rows.", x + 24, y + 80);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "1 / 2 / 3 or click. The correct line is not always on top.",
    x + 24,
    y + 98,
  );
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.fillText(
    "Idle and the typewriter picks the bad option for you.",
    x + 24,
    y + 116,
  );
  drawAiProgressLine(ctx, x + 24, y + h - 22, w - 48, progress01);
  ctx.restore();
}

/**
 * Render the four-ending share card embedded inside the AI surface.
 * Keeps the kitsch art for "cursed" / "improv" / "typewriter" — only
 * the surrounding chrome is product-grade.
 */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ending: EndingKind,
  paragraph: string,
  score: number,
  revealT: number = 1,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 440;
  const h = 300;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });

  // Top header strip — ending stamp
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.fillRect(x + 1, y + 1, w - 2, 28);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("RESULT", x + 14, y + 18);
  const endingLabel: Record<EndingKind, string> = {
    "by-the-book": "BY THE BOOK DETECTIVE",
    "cursed-case-file": "CURSED CASE FILE",
    improv: "IMPROV DETECTIVE",
    "typewriter-wrote-it": "THE TYPEWRITER WROTE IT FOR YOU",
  };
  const endingColor =
    ending === "by-the-book"
      ? CURSOR_AI.green
      : ending === "cursed-case-file"
        ? CURSOR_AI.accent
        : ending === "improv"
          ? CURSOR_AI.blue
          : CURSOR_AI.inkMute;
  // S-13: ending headline pulses softly for the first ~25% of reveal so
  // the player's eye lands on it before the paragraph + score.
  const headlinePulse =
    revealT < 0.25 ? 1 + 0.18 * Math.sin(revealT * Math.PI * 8) : 1;
  ctx.fillStyle = endingColor;
  // S-10: long ending labels (e.g. "THE TYPEWRITER WROTE IT FOR YOU")
  // overflow at 11px. Auto-shrink to fit the right portion of the header.
  const headerMaxW = w - 80; // leaves room for "RESULT" on the left
  const baseSize = 11 * headlinePulse;
  ctx.font = `700 ${baseSize.toFixed(1)}px 'Cursor Gothic', sans-serif`;
  let labelText = endingLabel[ending];
  if (ctx.measureText(labelText).width > headerMaxW) {
    const shrunk = (baseSize * headerMaxW) / ctx.measureText(labelText).width;
    ctx.font = `700 ${Math.max(8.5, shrunk).toFixed(1)}px 'Cursor Gothic', sans-serif`;
  }
  ctx.textAlign = "right";
  ctx.fillText(labelText, x + w - 14, y + 18);
  ctx.textAlign = "left";

  // Paragraph body (longer 8-beat runs)
  drawParagraph(ctx, paragraph, x + 22, y + 50, w - 44, 14);

  // Footer score row — count-up tween on the big number.
  // S-13: 0 → score over the first 70% of reveal, then steady.
  const scoreT = Math.min(1, revealT / 0.7);
  const easedT = 1 - (1 - scoreT) * (1 - scoreT); // ease-out quad
  const shownScore = Math.round(score * easedT);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("score", x + 22, y + h - 32);
  ctx.fillStyle = scoreT >= 1 ? endingColor : CURSOR_AI.ink;
  ctx.font = "700 22px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(String(shownScore), x + 22, y + h - 14);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText("click anywhere to close", x + w - 22, y + h - 16);
  ctx.textAlign = "left";

  ctx.restore();
}

function drawParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineH: number,
): void {
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "12px 'Cursor Mono', ui-monospace, monospace";
  const lines = wrapLines(ctx, text, width);
  let yy = y;
  for (const line of lines) {
    ctx.fillText(line, x, yy);
    yy += lineH;
    if (yy > y + 210) break;
  }
}

// ---------------------------------------------------------------------
// Tutorial diagram + paragraph assembly (carry-over)
// ---------------------------------------------------------------------
export function drawSentenceTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = y + h / 2;
  ctx.fillStyle = CURSOR_AI.surface;
  ctx.fillRect(x, cy - 12, 80, 22);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.strokeRect(x, cy - 12, 80, 22);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("the date", x + 6, cy);
  ctx.fillStyle = CURSOR_AI.ghost;
  ctx.fillText("…", x + 56, cy);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("Tab cycles", x + 100, cy);
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.fillRect(x + 164, cy - 8, 30, 16);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.strokeRect(x + 164, cy - 8, 30, 16);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("Enter", x + 179, cy + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Build the full assembled paragraph from picked options. */
export function assembleParagraph(
  slots: readonly SentenceSlot[],
  picks: readonly { color: PickColor | "idle" }[],
  pickedNamePrefix: readonly string[],
): string {
  const out: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] as SentenceSlot;
    const pick = picks[i];
    const prefix = pickedNamePrefix[i] ?? slot.prefix;
    let chosen = slot.options.orange;
    if (pick) {
      switch (pick.color) {
        case "blue":
          chosen = slot.options.blue;
          break;
        case "purple":
          chosen = slot.options.purple;
          break;
        case "orange":
        case "idle":
          chosen = slot.options.orange;
          break;
      }
    }
    out.push(`${prefix}${chosen}${slot.suffix}`);
  }
  return out.join(" ");
}

/** Pure helper exported for tests. */
export function inSuggestionRect(
  rows: readonly SuggestionRowRect[],
  x: number,
  y: number,
): SuggestionRowRect | null {
  for (const r of rows) if (inRect(x, y, r)) return r;
  return null;
}
