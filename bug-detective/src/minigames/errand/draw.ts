/** Cloud agents queue — Errand Race rendered as a Cursor Agents UI. */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import {
  drawAiAvatar,
  drawAiButton,
  drawAiCard,
  drawAiProgressLine,
  drawAiStatusPill,
  inRect,
  type Rect,
} from "../desk/aiCard";
import type { Drawer, Helper, HintIcon } from "./types";

// ---------------------------------------------------------------------
// Layout (512 × 320 internal canvas)
// ---------------------------------------------------------------------
/** Extra hit padding so pickup/drop matches fat-finger UX (drawing unchanged). */
const AGENT_ROW_HIT_PAD_Y = 6;
const TASK_CARD_DROP_PAD = 8;

export const ERRAND_LAYOUT = {
  /** Top "Tasks" card. */
  tasksX: 18,
  tasksY: 44,
  tasksW: 478,
  tasksH: 116,
  /** Bottom "Agents" card. */
  agentsX: 18,
  agentsY: 168,
  agentsW: 478,
  agentsH: 124,
  /** Task card geometry. */
  taskCardW: 86,
  taskCardH: 78,
  taskCardGap: 8,
  /** Agent row geometry. */
  agentRowH: 30,
  agentRowGap: 4,
} as const;

export function taskCardRect(idx: number): Rect {
  const L = ERRAND_LAYOUT;
  // 5 cards centered inside the tasks card with 12px inner pad.
  const total = 5 * L.taskCardW + 4 * L.taskCardGap;
  const x0 = L.tasksX + (L.tasksW - total) / 2;
  const y = L.tasksY + 28; // inset under the card title
  return { x: x0 + idx * (L.taskCardW + L.taskCardGap), y, w: L.taskCardW, h: L.taskCardH };
}

export function agentRowRect(idx: number): Rect {
  const L = ERRAND_LAYOUT;
  const x = L.agentsX + 14;
  const w = L.agentsW - 28;
  const y = L.agentsY + 28 + idx * (L.agentRowH + L.agentRowGap);
  return { x, y, w, h: L.agentRowH };
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
export function agentRowHitRect(idx: number): Rect {
  const r = agentRowRect(idx);
  return {
    x: r.x,
    y: r.y - AGENT_ROW_HIT_PAD_Y,
    w: r.w,
    h: r.h + AGENT_ROW_HIT_PAD_Y * 2,
  };
}

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
  helpers: readonly Helper[],
  /** During drag: index of task (0..4) that would accept the current grab. */
  dropHighlightTaskIdx: number | null = null,
): void {
  const L = ERRAND_LAYOUT;
  drawAiCard(ctx, L.tasksX, L.tasksY, L.tasksW, L.tasksH);
  // Card title
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("TASKS", L.tasksX + 14, L.tasksY + 18);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    `${drawers.length} pending · ${helpers.filter((h) => h.drawerAssigned !== null).length} active`,
    L.tasksX + L.tasksW - 14,
    L.tasksY + 18,
  );
  ctx.textAlign = "left";

  for (let i = 0; i < drawers.length; i++) {
    const d = drawers[i] as Drawer;
    const r = taskCardRect(i);
    const helper = helpers.find((h) => h.drawerAssigned === d.index) ?? null;
    drawTaskCard(ctx, d, r, helper, dropHighlightTaskIdx === i);
  }
}

function drawTaskCard(
  ctx: CanvasRenderingContext2D,
  drawer: Drawer,
  r: Rect,
  helper: Helper | null,
  isDropTarget: boolean,
): void {
  const isActive = helper?.state === "filling" || helper?.state === "alert";
  const isAlerted = helper?.state === "alert";
  drawAiCard(ctx, r.x, r.y, r.w, r.h, {
    radius: 8,
    fill: isActive ? CURSOR_AI.surface : CURSOR_AI.surface,
    stroke: isDropTarget
      ? CURSOR_AI.blue
      : isAlerted
        ? CURSOR_AI.accent
        : isActive
          ? CURSOR_AI.borderStrong
          : CURSOR_AI.border,
    shadow: isDropTarget,
  });
  // Index chip top-left
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`task #${drawer.index + 1}`, r.x + 8, r.y + 14);
  // Hint icon centered
  drawHintIcon(ctx, drawer.hint, r.x + r.w / 2, r.y + r.h / 2 + 2, 22);
  // Status / agent badge bottom
  if (helper) {
    ctx.fillStyle = isAlerted ? CURSOR_AI.accent : CURSOR_AI.blue;
    ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      isAlerted ? "tripwire!" : `agent-0${helper.index + 1}`,
      r.x + r.w / 2,
      r.y + r.h - 8,
    );
    ctx.textAlign = "left";
  } else {
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("idle", r.x + r.w / 2, r.y + r.h - 8);
    ctx.textAlign = "left";
  }
}

// ---------------------------------------------------------------------
// Agents card (bottom): 3 agent rows
// ---------------------------------------------------------------------
export function drawAgentsCard(
  ctx: CanvasRenderingContext2D,
  helpers: readonly Helper[],
  drawers: readonly Drawer[],
  pickedIndex: number | null,
  pointerX: number,
  pointerY: number,
): void {
  const L = ERRAND_LAYOUT;
  drawAiCard(ctx, L.agentsX, L.agentsY, L.agentsW, L.agentsH);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("AGENTS", L.agentsX + 14, L.agentsY + 18);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    "drag an agent → onto a task to dispatch",
    L.agentsX + L.agentsW - 14,
    L.agentsY + 18,
  );
  ctx.textAlign = "left";

  for (let i = 0; i < helpers.length; i++) {
    const h = helpers[i] as Helper;
    drawAgentRow(ctx, h, agentRowRect(i), drawers);
  }

  // Drag ghost — render the picked agent at the pointer location.
  if (pickedIndex !== null) {
    drawAiAvatar(ctx, pointerX, pointerY, { size: 18 });
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "600 10px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(`agent-0${pickedIndex + 1}`, pointerX + 14, pointerY + 4);
  }
}

function drawAgentRow(
  ctx: CanvasRenderingContext2D,
  helper: Helper,
  r: Rect,
  drawers: readonly Drawer[],
): void {
  // Avatar
  drawAiAvatar(ctx, r.x + 14, r.y + r.h / 2, { size: 18 });
  // Name
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(`agent-0${helper.index + 1}`, r.x + 32, r.y + r.h / 2);

  // Status pill
  const pillX = r.x + 110;
  let label = "waiting";
  let tone: "neutral" | "active" | "alert" | "done" | "lost" = "neutral";
  if (helper.state === "filling") {
    const taskN =
      helper.drawerAssigned !== null ? helper.drawerAssigned + 1 : "?";
    label = `running task #${taskN}`;
    tone = "active";
  } else if (helper.state === "alert") {
    label = "tripwire";
    tone = "alert";
  } else if (helper.state === "returning") {
    label = helper.result === "clue" ? "delivered clue" : "returned empty";
    tone = helper.result === "clue" ? "done" : "neutral";
  } else if (helper.state === "lost") {
    label = "lost";
    tone = "lost";
  }
  drawAiStatusPill(ctx, pillX, r.y + r.h / 2, label, tone);

  // Progress line on the right (only when filling/alert)
  const barX = r.x + r.w - 160;
  const barW = 150;
  const barY = r.y + r.h / 2 + 4;
  if (helper.state === "filling" || helper.state === "alert") {
    drawAiProgressLine(ctx, barX, barY, barW, helper.fillProgress, {
      tone: helper.state === "alert" ? "alert" : "default",
      thickness: 3,
    });
    // ETA label above the bar
    if (helper.drawerAssigned !== null) {
      const drawer = drawers[helper.drawerAssigned];
      if (drawer) {
        const etaMs = drawer.fillRateMs * (1 - helper.fillProgress);
        ctx.fillStyle = CURSOR_AI.inkSubtle;
        ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          `${(etaMs / 1000).toFixed(1)}s`,
          barX + barW,
          barY - 4,
        );
        ctx.textAlign = "left";
      }
    }
  } else {
    // Spec line — three dashes
    ctx.strokeStyle = CURSOR_AI.border;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barW, barY);
    ctx.stroke();
  }
  ctx.textBaseline = "alphabetic";
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
  ctx.fillText(
    "Abort returns the agent safely (no clue).",
    x + 24,
    y + 70,
  );
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
  ctx.fillText("Cursor Agents — dispatch queue", x + 60, y + 30);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText("3 agents · 5 tasks · pick wisely", x + 60, y + 48);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.fillText("Drag each agent onto a task card to dispatch.", x + 24, y + 80);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "Cup / key tend to be clues. ⚠ tasks ping mid-run.",
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
  ctx.fillText("agent →", x + 28, cy);
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
  ctx.fillText("DRAG TO DISPATCH", x + 138, cy);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------------------------------------------------------------------
// Hit-test helpers exported for the session
// ---------------------------------------------------------------------
export function agentRowAt(
  helpers: readonly Helper[],
  x: number,
  y: number,
): number | null {
  for (let i = 0; i < helpers.length; i++) {
    const r = agentRowHitRect(i);
    if (inRect(x, y, r)) return i;
  }
  return null;
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
