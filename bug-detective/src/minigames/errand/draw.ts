/** Cursor Agents task triage — Errand Race rendered as a pick-card UI. */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import {
  drawAiAvatar,
  drawAiButton,
  drawAiCard,
  drawAiProgressLine,
  inRect,
  type Rect,
} from "../desk/aiCard";
import { type Drawer, type DrawerContent, type HintIcon } from "./types";

// ---------------------------------------------------------------------
// Layout (512 × 320 internal canvas)
// ---------------------------------------------------------------------
const TASK_CARD_DROP_PAD = 8;

export const ERRAND_LAYOUT = {
  tasksX: 18,
  tasksY: 40,
  tasksW: 478,
  tasksH: 128,
  agentsX: 18,
  agentsY: 176,
  agentsW: 478,
  agentsH: 128,
  taskCardW: 86,
  taskCardH: 96,
  taskCardGap: 8,
  watchActionH: 18,
  watchActionW: 24,
  watchActionGap: 4,
} as const;

export function taskCardRect(idx: number): Rect {
  const L = ERRAND_LAYOUT;
  // 5 cards centered inside the tasks card with 12px inner pad.
  const total = 5 * L.taskCardW + 4 * L.taskCardGap;
  const x0 = L.tasksX + (L.tasksW - total) / 2;
  const y = L.tasksY + 28; // inset under the card title
  return {
    x: x0 + idx * (L.taskCardW + L.taskCardGap),
    y,
    w: L.taskCardW,
    h: L.taskCardH,
  };
}

// ---------------------------------------------------------------------
// Hint icon — kept simple, inline with the Cursor product palette
// ---------------------------------------------------------------------
export function drawHintIcon(
  ctx: CanvasRenderingContext2D,
  hint: HintIcon,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = CURSOR_AI.inkMute;
  ctx.fillStyle = CURSOR_AI.inkMute;
  switch (hint) {
    case "cup":
      ctx.beginPath();
      ctx.moveTo(-size / 2, -size / 4);
      ctx.lineTo(size / 2, -size / 4);
      ctx.lineTo(size / 3, size / 2);
      ctx.lineTo(-size / 3, size / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size / 2 + 4, 0, 5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    case "feather":
      ctx.beginPath();
      ctx.moveTo(-size / 3, size / 2);
      ctx.lineTo(size / 3, -size / 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const ax = -size / 3 + ((size * 2) / 3) * t;
        const ay = size / 2 - size * t;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 6, ay - 5);
      }
      ctx.stroke();
      break;
    case "key":
      ctx.beginPath();
      ctx.arc(-size / 4, 0, size / 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size / 2, 0);
      ctx.moveTo(size / 3, 0);
      ctx.lineTo(size / 3, size / 4);
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size / 4);
      ctx.stroke();
      break;
    case "question":
      ctx.fillStyle = CURSOR_AI.inkMute;
      ctx.font = `700 ${size}px 'Cursor Mono', ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillText("?", 0, size / 3);
      break;
    case "warn":
      ctx.fillStyle = CURSOR_AI.accent;
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${size * 0.55}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", 0, size / 5);
      break;
    default: {
      const _: never = hint;
      void _;
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
}

// ---------------------------------------------------------------------
// Tasks card (top): 5 task cards in a row
// ---------------------------------------------------------------------
export function taskCardDropRect(idx: number): Rect {
  const r = taskCardRect(idx);
  return {
    x: r.x - TASK_CARD_DROP_PAD,
    y: r.y - TASK_CARD_DROP_PAD,
    w: r.w + TASK_CARD_DROP_PAD * 2,
    h: r.h + TASK_CARD_DROP_PAD * 2,
  };
}

export function drawTasksCard(
  ctx: CanvasRenderingContext2D,
  drawers: readonly Drawer[],
  revealedTasks: ReadonlyMap<number, DrawerContent>,
  hoverTaskIdx: number | null,
  agentsRemaining: number,
): void {
  const L = ERRAND_LAYOUT;
  drawAiCard(ctx, L.tasksX, L.tasksY, L.tasksW, L.tasksH);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("TASKS — pick a card", L.tasksX + 14, L.tasksY + 18);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    `${agentsRemaining} agents left`,
    L.tasksX + L.tasksW - 14,
    L.tasksY + 18,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(
    "find clues · skip noise · avoid the trap",
    L.tasksX + 14,
    L.tasksY + L.tasksH - 8,
  );

  for (let i = 0; i < drawers.length; i++) {
    const d = drawers[i] as Drawer;
    const r = taskCardRect(i);
    drawTaskCard(ctx, d, r, revealedTasks.get(d.index), hoverTaskIdx === i);
  }
}

function drawTaskCard(
  ctx: CanvasRenderingContext2D,
  drawer: Drawer,
  r: Rect,
  revealed: DrawerContent | undefined,
  isHovered: boolean,
): void {
  const tone = taskTone(revealed);
  drawAiCard(ctx, r.x, r.y, r.w, r.h, {
    radius: 8,
    fill: tone.fill,
    stroke: isHovered && !revealed ? CURSOR_AI.blue : tone.stroke,
    shadow: isHovered && !revealed,
  });
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`task #${drawer.index + 1}`, r.x + 8, r.y + 14);
  drawHintIcon(ctx, drawer.hint, r.x + r.w / 2, r.y + 34, 18);
  if (revealed === undefined) {
    const rel = drawer.signalProfile.relevance01;
    const risk = 1 - drawer.signalProfile.safety01;
    drawRelRiskMeters(ctx, r.x + 8, r.y + 52, r.w - 16, rel, risk);
    ctx.fillStyle = tone.text;
    ctx.font = "700 11px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("PICK", r.x + r.w / 2, r.y + 86);
  } else {
    ctx.fillStyle = tone.text;
    ctx.font = "700 13px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(taskStatusLabel(revealed), r.x + r.w / 2, r.y + 74);
  }
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "8px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(taskHintText(drawer.hint), r.x + r.w / 2, r.y + 96);
  ctx.textAlign = "left";
}

function taskStatusLabel(content: DrawerContent | undefined): string {
  switch (content) {
    case "clue":
      return "CLUE";
    case "junk":
      return "NOISE";
    case "trap":
      return "TRAP";
    case undefined:
      return "PICK";
    default: {
      const _: never = content;
      return _;
    }
  }
}

function drawRelRiskMeters(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  relevance01: number,
  risk01: number,
): void {
  const barH = 4;
  const gap = 3;
  ctx.textAlign = "left";
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "6px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("REL", x, y);
  ctx.fillStyle = "rgba(80,120,200,0.25)";
  ctx.fillRect(x + 18, y - 4, w - 18, barH);
  ctx.fillStyle = CURSOR_AI.blue;
  ctx.fillRect(x + 18, y - 4, (w - 18) * relevance01, barH);
  const y2 = y + gap + 8;
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.fillText("RISK", x, y2);
  ctx.fillStyle = "rgba(200,100,80,0.25)";
  ctx.fillRect(x + 18, y2 - 4, w - 18, barH);
  ctx.fillStyle = CURSOR_AI.accent;
  ctx.fillRect(x + 18, y2 - 4, (w - 18) * risk01, barH);
}

function taskTone(content: DrawerContent | undefined): {
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
} {
  switch (content) {
    case "clue":
      return {
        fill: CURSOR_AI.greenMute,
        stroke: CURSOR_AI.green,
        text: CURSOR_AI.green,
      };
    case "junk":
      return {
        fill: CURSOR_AI.surface,
        stroke: CURSOR_AI.border,
        text: CURSOR_AI.inkSubtle,
      };
    case "trap":
      return {
        fill: CURSOR_AI.redMute,
        stroke: CURSOR_AI.red,
        text: CURSOR_AI.red,
      };
    case undefined:
      return {
        fill: CURSOR_AI.surface,
        stroke: CURSOR_AI.border,
        text: CURSOR_AI.blue,
      };
    default: {
      const _: never = content;
      return _;
    }
  }
}

function taskHintText(hint: Drawer["hint"]): string {
  switch (hint) {
    case "cup":
    case "key":
      return "clue lead";
    case "warn":
      return "risky";
    case "feather":
    case "question":
      return "unclear";
    default: {
      const _: never = hint;
      return _;
    }
  }
}

// ---------------------------------------------------------------------
// Agents card (bottom): agents-left tokens + legend
// ---------------------------------------------------------------------
export function drawAgentsCard(
  ctx: CanvasRenderingContext2D,
  agentsRemaining: number,
  picksMade: number,
  cluesFound: number,
  trapsHit: number,
): void {
  const L = ERRAND_LAYOUT;
  drawAiCard(ctx, L.agentsX, L.agentsY, L.agentsW, L.agentsH);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("AGENTS LEFT", L.agentsX + 14, L.agentsY + 18);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    `picked ${picksMade}/3 · clues ${cluesFound} · traps ${trapsHit}`,
    L.agentsX + L.agentsW - 14,
    L.agentsY + 18,
  );
  ctx.textAlign = "left";

  for (let i = 0; i < 3; i++) {
    const x = L.agentsX + 44 + i * 56;
    const y = L.agentsY + 58;
    ctx.save();
    if (i >= agentsRemaining) ctx.globalAlpha = 0.28;
    drawAiAvatar(ctx, x, y, { size: 28 });
    ctx.restore();
    ctx.fillStyle = i < agentsRemaining ? CURSOR_AI.ink : CURSOR_AI.inkSubtle;
    ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(i < agentsRemaining ? "ready" : "spent", x, y + 30);
  }
  ctx.textAlign = "left";

  const legendX = L.agentsX + 230;
  drawLegendItem(
    ctx,
    legendX,
    L.agentsY + 48,
    CURSOR_AI.green,
    "CLUE",
    "earns evidence",
  );
  drawLegendItem(
    ctx,
    legendX,
    L.agentsY + 72,
    CURSOR_AI.inkSubtle,
    "NOISE",
    "no progress",
  );
  drawLegendItem(
    ctx,
    legendX,
    L.agentsY + 96,
    CURSOR_AI.red,
    "TRAP",
    "loses an agent",
  );
}

function drawLegendItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  detail: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(label, x + 14, y);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(detail, x + 64, y);
}

// ---------------------------------------------------------------------
// Modal — system-prompt-style
// ---------------------------------------------------------------------
export function drawAbortModal(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  helperIdx: number,
  secondsLeft01: number,
): { abort: Rect; push: Rect } {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 360;
  const h = 156;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 12 });
  drawAiAvatar(ctx, x + 28, y + 28, { size: 22 });
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("Cursor Agents", x + 56, y + 22);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 13px 'Cursor Gothic', ui-sans-serif, sans-serif";
  ctx.fillText(
    `agent-0${helperIdx + 1} hit a tripwire — push or abort?`,
    x + 56,
    y + 40,
  );
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText("Abort returns the agent safely (no clue).", x + 24, y + 70);
  ctx.fillText(
    "Push runs the trap — 50/50 clue or lose the agent.",
    x + 24,
    y + 88,
  );
  // Buttons
  const bw = 144;
  const bh = 32;
  const by = y + h - bh - 22;
  const abort: Rect = { x: x + 24, y: by, w: bw, h: bh };
  const push: Rect = { x: x + w - bw - 24, y: by, w: bw, h: bh };
  drawAiButton(ctx, abort, "Abort", { tone: "secondary", leading: "✗" });
  drawAiButton(ctx, push, "Push run", { tone: "reject", leading: "→" });
  drawAiProgressLine(ctx, x + 24, y + h - 12, w - 48, secondsLeft01, {
    tone: "alert",
  });
  ctx.restore();
  return { abort, push };
}

// ---------------------------------------------------------------------
// Intro + Result cards
// ---------------------------------------------------------------------
export function drawErrandIntro(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 150;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  drawAiAvatar(ctx, x + 32, y + 36, { size: 28 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.fillText("Cursor Agents — task triage", x + 60, y + 30);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText("3 agents · 5 tasks · pick wisely", x + 60, y + 48);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.fillText("Click task cards to spend your 3 agents.", x + 24, y + 80);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "Find at least one clue. Cup / key help; warning signs are risky.",
    x + 24,
    y + 100,
  );
  drawAiProgressLine(ctx, x + 24, y + h - 22, w - 48, progress01);
  ctx.restore();
}

export function drawErrandResult(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  totals: { clues: number; helpersSafe: number; helpersLost: number },
  score: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 200;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("RUN SUMMARY", x + 24, y + 28);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 36px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(String(score), x + 24, y + 70);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("score", x + 24, y + 86);
  // Stat strip on the right
  const stripX = x + w - 168;
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`agents      3`, stripX, y + 56);
  ctx.fillText(`clues       ${totals.clues}`, stripX, y + 76);
  ctx.fillText(`safe        ${totals.helpersSafe}`, stripX, y + 96);
  ctx.fillText(`lost        ${totals.helpersLost}`, stripX, y + 116);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("click anywhere to close", x + 24, y + h - 16);
  ctx.restore();
}

// ---------------------------------------------------------------------
// Tutorial diagram
// ---------------------------------------------------------------------
export function drawErrandTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = y + h / 2;
  drawAiAvatar(ctx, x + 12, cy, { size: 16 });
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("click →", x + 28, cy);
  // Mini task card mock
  drawAiCard(ctx, x + 76, cy - 16, 50, 32, {
    radius: 6,
    shadow: false,
  });
  drawHintIcon(ctx, "cup", x + 76 + 25, cy - 4, 12);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("task", x + 76 + 14, cy + 8);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("REVEAL OUTCOME", x + 138, cy);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

export function taskCardAt(
  drawers: readonly Drawer[],
  x: number,
  y: number,
): number | null {
  for (let i = 0; i < drawers.length; i++) {
    const r = taskCardDropRect(i);
    if (inRect(x, y, r)) return i;
  }
  return null;
}
