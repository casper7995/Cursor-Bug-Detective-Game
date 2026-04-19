/** Finish the Sentence canvas drawing helpers. */

import { CURSOR } from "../../ui/cursorTheme";
import type { EndingKind, PickColor, SentenceSlot } from "./types";

const W_LIMIT = 460; // wrap width for typewriter text

/** Wrap a string into lines no wider than width px in the current font. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const COLOR_BY_PICK: Record<PickColor, string> = {
  blue: "#5d9bff",
  purple: "#b58aff",
  orange: "#ff8b3d",
};

export interface BalloonRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: PickColor;
  readonly word: string;
}

export function getBalloonRects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  options: { blue: string; purple: string; orange: string },
): readonly BalloonRect[] {
  ctx.font = "13px 'Cursor Mono', monospace";
  const colors: PickColor[] = ["blue", "purple", "orange"];
  const labels: string[] = [options.blue, options.purple, options.orange];
  const measured = labels.map(
    (l) => Math.max(72, Math.min(180, ctx.measureText(l).width + 28)),
  );
  const totalW = measured.reduce((a, b) => a + b, 0) + (colors.length - 1) * 12;
  const x0 = (W - totalW) / 2;
  const y = H - 88;
  let cur = x0;
  const rects: BalloonRect[] = [];
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i] as PickColor;
    const word = labels[i] as string;
    const w = measured[i] as number;
    rects.push({ x: cur, y, w, h: 36, color, word });
    cur += w + 12;
  }
  return rects;
}

export function drawTypewriterScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  paragraph: string,
  typingProgress01: number,
): void {
  // Background paper roll
  ctx.fillStyle = CURSOR.bgTop;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = CURSOR.warmCream;
  ctx.strokeStyle = "rgba(245,78,0,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(20, 50, W - 40, H - 90, 6);
  ctx.fill();
  ctx.stroke();

  // Title
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "600 12px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("CASE FILE — TYPEWRITER", 28, 30);
  ctx.fillStyle = CURSOR.text;
  ctx.font = "10px sans-serif";
  ctx.fillText("tap a suggestion · idle = typewriter picks for you", 28, 44);

  // Body text — typewriter-style
  ctx.fillStyle = CURSOR.ink;
  ctx.font = "13px 'Cursor Mono', monospace";
  const totalChars = paragraph.length;
  const visibleChars = Math.floor(totalChars * Math.max(0, Math.min(1, typingProgress01)));
  const visible = paragraph.slice(0, visibleChars);
  const lines = wrapText(ctx, visible, W_LIMIT);
  let yLine = 80;
  for (const line of lines) {
    ctx.fillText(line, 32, yLine);
    yLine += 18;
    if (yLine > H - 110) break;
  }
}

export function drawSuggestionBalloons(
  ctx: CanvasRenderingContext2D,
  rects: readonly BalloonRect[],
  hover: PickColor | null,
  secondsLeft01: number,
): void {
  for (const r of rects) {
    const color = COLOR_BY_PICK[r.color];
    const isHover = hover === r.color;
    ctx.fillStyle = isHover ? color : "rgba(20,18,11,0.85)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isHover ? "#fff" : color;
    ctx.font = "13px 'Cursor Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(r.word, r.x + r.w / 2, r.y + 23);
  }
  // Idle timer bar
  if (rects.length > 0) {
    const first = rects[0] as BalloonRect;
    const last = rects[rects.length - 1] as BalloonRect;
    const x = first.x;
    const w = last.x + last.w - first.x;
    const y = first.y + first.h + 6;
    ctx.fillStyle = "rgba(20,18,11,0.5)";
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = CURSOR.gold;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, secondsLeft01)), 4);
  }
  ctx.textAlign = "left";
}

export function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.55)";
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 130;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.fillStyle = "#1a1812";
  ctx.strokeStyle = CURSOR.orange;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "600 14px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FINISH THE SENTENCE", x + w / 2, y + 30);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    "The typewriter clack-types. You finish the blank.",
    x + w / 2,
    y + 54,
  );
  ctx.fillStyle = "#5d9bff";
  ctx.font = "11px 'Cursor Mono', monospace";
  ctx.fillText("blue = right", x + 100, y + 78);
  ctx.fillStyle = "#b58aff";
  ctx.fillText("purple = funny", x + w / 2, y + 78);
  ctx.fillStyle = "#ff8b3d";
  ctx.fillText("orange = oops", x + w - 100, y + 78);
  // Progress bar
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.fillRect(x + 20, y + h - 14, w - 40, 4);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillRect(
    x + 20,
    y + h - 14,
    (w - 40) * Math.max(0, Math.min(1, progress01)),
    4,
  );
  ctx.restore();
  ctx.textAlign = "left";
}

/**
 * Render the share-card ending.
 * Four visual variants per the spec:
 * - by-the-book: crisp, classy.
 * - cursed-case-file: comic-sans + ketchup stain.
 * - improv: marker on napkin.
 * - typewriter-wrote-it: sad font, single tear.
 */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ending: EndingKind,
  paragraph: string,
  score: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.85)";
  ctx.fillRect(0, 0, W, H);
  const w = 420;
  const h = 240;
  const x = (W - w) / 2;
  const y = (H - h) / 2;

  switch (ending) {
    case "by-the-book": {
      ctx.fillStyle = "#fbf6ec";
      ctx.strokeStyle = "#3a2d10";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#231a08";
      ctx.font = "700 16px 'Cursor Gothic', serif";
      ctx.textAlign = "center";
      ctx.fillText("BY THE BOOK DETECTIVE", x + w / 2, y + 28);
      drawParagraph(ctx, paragraph, x + 20, y + 50, w - 40, 14, "#231a08");
      drawScoreFooter(ctx, score, x, y, w, h, "#3a2d10");
      break;
    }
    case "cursed-case-file": {
      ctx.fillStyle = "#ffe8c1";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      // Ketchup stain
      ctx.fillStyle = "rgba(180,30,30,0.55)";
      ctx.beginPath();
      ctx.arc(x + w - 40, y + 28, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w - 56, y + 16, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a3a1a";
      ctx.font = "700 18px 'Comic Sans MS', 'Cursor Gothic', cursive";
      ctx.textAlign = "center";
      ctx.fillText("CURSED CASE FILE", x + w / 2, y + 28);
      drawParagraph(ctx, paragraph, x + 20, y + 54, w - 40, 14, "#3d2812");
      drawScoreFooter(ctx, score, x, y, w, h, "#7a3a1a");
      break;
    }
    case "improv": {
      // Napkin: off-white with diagonal hatch + marker
      ctx.fillStyle = "#f5f0df";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(180,150,90,0.35)";
      ctx.lineWidth = 1;
      for (let i = -h; i < w + h; i += 16) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
      }
      ctx.fillStyle = "#1d4173";
      ctx.font = "700 18px 'Marker Felt', 'Cursor Gothic', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("IMPROV DETECTIVE", x + w / 2, y + 28);
      drawParagraph(ctx, paragraph, x + 24, y + 54, w - 48, 14, "#1d4173");
      drawScoreFooter(ctx, score, x, y, w, h, "#1d4173");
      break;
    }
    case "typewriter-wrote-it": {
      ctx.fillStyle = "#e0e2e8";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.strokeStyle = "#3a4252";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#3a4252";
      ctx.font = "italic 700 16px 'Cursor Gothic', serif";
      ctx.textAlign = "center";
      ctx.fillText("THE TYPEWRITER WROTE IT FOR YOU", x + w / 2, y + 30);
      drawParagraph(ctx, paragraph, x + 20, y + 54, w - 40, 14, "#3a4252");
      // Single tear
      ctx.fillStyle = "rgba(80,140,200,0.7)";
      ctx.beginPath();
      ctx.moveTo(x + w - 40, y + 56);
      ctx.quadraticCurveTo(x + w - 36, y + 78, x + w - 40, y + 86);
      ctx.quadraticCurveTo(x + w - 44, y + 78, x + w - 40, y + 56);
      ctx.fill();
      drawScoreFooter(ctx, score, x, y, w, h, "#3a4252");
      break;
    }
    default: {
      const _: never = ending;
      void _;
    }
  }
  ctx.fillStyle = "rgba(247,247,244,0.7)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("click to close", W / 2, y + h + 20);
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
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = "12px 'Cursor Mono', monospace";
  ctx.textAlign = "left";
  const lines = wrapText(ctx, text, width);
  let yy = y;
  for (const line of lines) {
    ctx.fillText(line, x, yy);
    yy += lineH;
    if (yy > y + 120) break;
  }
  ctx.textAlign = "left";
}

function drawScoreFooter(
  ctx: CanvasRenderingContext2D,
  score: number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.font = "700 22px 'Cursor Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${score} pts`, x + w / 2, y + h - 14);
  ctx.textAlign = "left";
}

export function drawSentenceTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = y + h / 2;
  ctx.fillStyle = "rgba(245,240,232,0.95)";
  ctx.fillRect(x, cy - 14, 60, 28);
  ctx.strokeStyle = "rgba(60,60,60,0.6)";
  ctx.strokeRect(x, cy - 14, 60, 28);
  ctx.fillStyle = "#231a08";
  ctx.font = "12px 'Cursor Mono', monospace";
  ctx.fillText("…and the", x + 4, cy + 4);
  ctx.fillStyle = "#5d9bff";
  ctx.fillText("blank", x + 70, cy + 4);
  ctx.fillStyle = "#b58aff";
  ctx.fillText("blank", x + 110, cy + 4);
  ctx.fillStyle = "#ff8b3d";
  ctx.fillText("blank", x + 150, cy + 4);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "10px 'Cursor Gothic', sans-serif";
  ctx.fillText("PICK ONE", x + 200, cy + 4);
  ctx.restore();
  ctx.textAlign = "left";
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
