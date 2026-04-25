/**
 * Shared in-canvas practice UI: Skip control, ready confirmation, coach captions.
 */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import { inRect, type Rect } from "./aiCard";
import { RUNNER_DRAW } from "../runner/sim";

export type CoachRect = Rect;

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

/** Top strip — left of the [?] help control. */
export function practiceSkipRect(canvasW: number = W): CoachRect {
  return { x: canvasW - 178, y: 10, w: 86, h: 26 };
}

export function hitPracticeSkip(
  gameX: number,
  gameY: number,
  canvasW: number = W,
): boolean {
  return inRect(gameX, gameY, practiceSkipRect(canvasW));
}

export function drawPracticeSkipButton(
  ctx: CanvasRenderingContext2D,
  canvasW: number = W,
): void {
  const r = practiceSkipRect(canvasW);
  ctx.save();
  ctx.fillStyle = "rgba(253,253,250,0.95)";
  ctx.strokeStyle = CURSOR_AI.borderStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 13);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 11px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Skip → round", r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

export interface PracticeConfirmLayout {
  readonly panel: CoachRect;
  readonly startRound: CoachRect;
  readonly again: CoachRect;
}

export function layoutPracticeConfirm(
  canvasW: number = W,
  canvasH: number = H,
): PracticeConfirmLayout {
  const pw = Math.min(380, canvasW - 48);
  const ph = 118;
  const panel: CoachRect = {
    x: (canvasW - pw) / 2,
    y: (canvasH - ph) / 2,
    w: pw,
    h: ph,
  };
  const btnW = 150;
  const btnH = 34;
  const gap = 14;
  const y = panel.y + panel.h - btnH - 18;
  const total = btnW * 2 + gap;
  const x0 = panel.x + (panel.w - total) / 2;
  return {
    panel,
    startRound: { x: x0, y, w: btnW, h: btnH },
    again: { x: x0 + btnW + gap, y, w: btnW, h: btnH },
  };
}

export function drawPracticeConfirm(
  ctx: CanvasRenderingContext2D,
  canvasW: number = W,
  canvasH: number = H,
): PracticeConfirmLayout {
  const L = layoutPracticeConfirm(canvasW, canvasH);
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.55)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  const { panel, startRound, again } = L;
  ctx.fillStyle = CURSOR_AI.surface;
  ctx.strokeStyle = CURSOR_AI.borderStrong;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 13px 'Cursor Gothic', ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Nice — that's how it works.",
    panel.x + panel.w / 2,
    panel.y + 28,
  );
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "Start the real round, or run practice once more.",
    panel.x + panel.w / 2,
    panel.y + 50,
  );

  const drawConfirmBtn = (
    r: CoachRect,
    label: string,
    fill: string,
    textLight: boolean,
  ): void => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = CURSOR_AI.border;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textLight ? "#fff" : CURSOR_AI.ink;
    ctx.font = "600 12px 'Cursor Gothic', sans-serif";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 4);
  };
  drawConfirmBtn(startRound, "Start round", CURSOR_AI.accent, true);
  drawConfirmBtn(again, "One more practice", "rgba(253,253,250,0.92)", false);
  ctx.textAlign = "left";
  ctx.restore();
  return L;
}

export function hitPracticeConfirmStart(
  gameX: number,
  gameY: number,
  canvasW: number = W,
  canvasH: number = H,
): boolean {
  const { startRound } = layoutPracticeConfirm(canvasW, canvasH);
  return inRect(gameX, gameY, startRound);
}

export function hitPracticeConfirmAgain(
  gameX: number,
  gameY: number,
  canvasW: number = W,
  canvasH: number = H,
): boolean {
  const { again } = layoutPracticeConfirm(canvasW, canvasH);
  return inRect(gameX, gameY, again);
}

const COACH_CAPTION_FONT =
  "600 11px 'Cursor Gothic', ui-sans-serif, sans-serif";
const COACH_SUB_FONT = "10px 'Cursor Mono', ui-monospace, monospace";

function wrapCoachLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxInner: number,
): string[] {
  if (ctx.measureText(text).width <= maxInner) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(cand).width <= maxInner) cur = cand;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

/** Lower-left coach caption + optional arrow toward `pointTo` (canvas coords). */
export function drawPracticeCoachCaption(
  ctx: CanvasRenderingContext2D,
  caption: string,
  sublines: readonly string[],
  pointTo?: { x: number; y: number },
): void {
  const pad = 12;
  /** Outer width cap; long copy wraps so text is not clipped at the panel edge. */
  const maxBoxOuter = 340;
  const innerMax = maxBoxOuter - pad * 2;
  ctx.save();

  const rows: { readonly t: string; readonly caption: boolean }[] = [];
  ctx.font = COACH_CAPTION_FONT;
  for (const line of wrapCoachLine(ctx, caption, innerMax)) {
    rows.push({ t: line, caption: true });
  }
  ctx.font = COACH_SUB_FONT;
  for (const sub of sublines) {
    for (const line of wrapCoachLine(ctx, sub, innerMax)) {
      rows.push({ t: line, caption: false });
    }
  }

  let tw = 0;
  for (const row of rows) {
    ctx.font = row.caption ? COACH_CAPTION_FONT : COACH_SUB_FONT;
    tw = Math.max(tw, ctx.measureText(row.t).width);
  }
  const lineH = 16;
  const boxW = Math.min(maxBoxOuter, tw + pad * 2);
  const boxH = pad * 2 + rows.length * lineH;
  const bx = 14;
  const by = H - boxH - 36;
  ctx.fillStyle = "rgba(26,24,18,0.92)";
  ctx.strokeStyle = "rgba(245,78,0,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7f6f3";
  ctx.textAlign = "left";
  let ly = by + pad + 12;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    ctx.font = row.caption ? COACH_CAPTION_FONT : COACH_SUB_FONT;
    ctx.fillStyle = row.caption ? "#f7f6f3" : "rgba(247,246,243,0.75)";
    ctx.fillText(row.t, bx + pad, ly);
    ly += lineH;
  }
  if (pointTo) {
    ctx.strokeStyle = CURSOR_AI.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + boxW, by + boxH / 2);
    ctx.lineTo(pointTo.x - 8, pointTo.y);
    ctx.stroke();
    ctx.fillStyle = CURSOR_AI.accent;
    ctx.beginPath();
    ctx.arc(pointTo.x - 4, pointTo.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawIdleExitFooter(
  ctx: CanvasRenderingContext2D,
  remainingSec: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `still here? closing in ${remainingSec}s — press anything`,
    W / 2,
    H - 10,
  );
  ctx.textAlign = "left";
  ctx.restore();
}
