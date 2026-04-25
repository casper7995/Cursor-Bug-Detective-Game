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
import {
  ERRAND_TRIPWIRE_ABORT_S,
  type Drawer,
  type Helper,
  type HintIcon,
  type InterventionKind,
  type TaskSignalProfile,
} from "./types";

// ---------------------------------------------------------------------
// Layout (512 × 320 internal canvas)
// ---------------------------------------------------------------------
/** Extra hit padding so pickup/drop matches fat-finger UX (drawing unchanged). */
const AGENT_ROW_HIT_PAD_Y = 6;
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
  agentRowH: 34,
  agentRowGap: 4,
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

const SIGNAL_LABELS: Array<keyof TaskSignalProfile> = [
  "relevance01",
  "safety01",
  "urgency01",
] as const;

const SIGNAL_LABEL: Record<keyof TaskSignalProfile, string> = {
  relevance01: "rel",
  safety01: "safe",
  urgency01: "urg",
};

function drawTaskSignalMeters(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  profile: TaskSignalProfile,
): void {
  const barW = 3;
  const gap = 4;
  const barH = 28;
  for (let s = 0; s < SIGNAL_LABELS.length; s++) {
    const k = SIGNAL_LABELS[s]!;
    const v = profile[k] as number;
    const x = x0 + s * (barW + gap);
    ctx.fillStyle = CURSOR_AI.surfaceMute;
    ctx.beginPath();
    ctx.roundRect(x, y0, barW, barH, 1);
    ctx.fill();
    ctx.fillStyle = CURSOR_AI.blue;
    const fillH = Math.max(0, v * barH);
    ctx.beginPath();
    ctx.roundRect(x, y0 + barH - fillH, barW, fillH, 1);
    ctx.fill();
  }
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "6px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "left";
  let lx = x0;
  for (const k of SIGNAL_LABELS) {
    ctx.fillText(SIGNAL_LABEL[k], lx, y0 + barH + 6);
    lx += barW + gap;
  }
}

function watchActionRowLayout(r: Rect): { x0: number; y: number } {
  const L = ERRAND_LAYOUT;
  const w = L.watchActionW;
  const g = L.watchActionGap;
  const h = L.watchActionH;
  const total = 3 * w + 2 * g;
  return {
    x0: r.x + (r.w - total) / 2,
    y: r.y + r.h - h - 3,
  };
}

const TRIAGE_CHIP_TONES = {
  primary: {
    bg: CURSOR_AI.blue,
    bgH: "#1858c9",
    bd: CURSOR_AI.blue,
    tx: "#fff",
  },
  secondary: {
    bg: CURSOR_AI.surface,
    bgH: CURSOR_AI.surfaceMute,
    bd: CURSOR_AI.border,
    tx: CURSOR_AI.ink,
  },
  approve: {
    bg: CURSOR_AI.greenMute,
    bgH: CURSOR_AI.green,
    bd: CURSOR_AI.green,
    tx: CURSOR_AI.green,
  },
  reject: {
    bg: CURSOR_AI.redMute,
    bgH: CURSOR_AI.red,
    bd: CURSOR_AI.red,
    tx: CURSOR_AI.red,
  },
  ghost: {
    bg: "transparent",
    bgH: CURSOR_AI.surfaceMute,
    bd: CURSOR_AI.border,
    tx: CURSOR_AI.inkMute,
  },
} as const;

function helpersByDrawerSlot(helpers: readonly Helper[]): (Helper | null)[] {
  const slot: (Helper | null)[] = [null, null, null, null, null];
  for (const h of helpers) {
    const a = h.drawerAssigned;
    if (a !== null) slot[a] = h;
  }
  return slot;
}

function drawTriageChip(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  opts: {
    readonly tone: "primary" | "secondary" | "approve" | "reject" | "ghost";
    readonly hovered?: boolean;
    readonly disabled?: boolean;
  },
): void {
  const spec = TRIAGE_CHIP_TONES[opts.tone];
  const hovered = opts.hovered === true && !opts.disabled;
  ctx.save();
  if (opts.disabled) ctx.globalAlpha = 0.45;
  const fill = hovered && spec.bg !== "transparent" ? spec.bgH : spec.bg;
  if (fill !== "transparent") {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
    ctx.fill();
  } else if (hovered) {
    ctx.fillStyle = spec.bgH;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
    ctx.fill();
  }
  ctx.strokeStyle = spec.bd;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
  ctx.stroke();
  const useLightText =
    hovered &&
    (opts.tone === "primary" ||
      opts.tone === "approve" ||
      opts.tone === "reject");
  ctx.fillStyle = useLightText ? "#ffffff" : spec.tx;
  ctx.font = "600 7px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

export function taskInterventionButtonRects(r: Rect): {
  readonly inspect: Rect;
  readonly abort: Rect;
  readonly push: Rect;
} {
  const L = ERRAND_LAYOUT;
  const w = L.watchActionW;
  const g = L.watchActionGap;
  const h = L.watchActionH;
  const { x0, y } = watchActionRowLayout(r);
  return {
    inspect: { x: x0, y, w, h },
    abort: { x: x0 + w + g, y, w, h },
    push: { x: x0 + 2 * (w + g), y, w, h },
  };
}

export function hitWatchIntervention(
  drawers: readonly Drawer[],
  helpers: readonly Helper[],
  x: number,
  y: number,
): { taskIdx: number; kind: InterventionKind } | null {
  const byDrawer = helpersByDrawerSlot(helpers);
  for (let i = 0; i < drawers.length; i++) {
    const d = drawers[i] as Drawer;
    const helper = byDrawer[d.index] ?? null;
    if (!helper) continue;
    if (helper.state !== "filling" && helper.state !== "alert") continue;
    const r = taskCardRect(i);
    const rects = taskInterventionButtonRects(r);
    if (inRect(x, y, rects.inspect)) return { taskIdx: i, kind: "inspect" };
    if (inRect(x, y, rects.abort)) return { taskIdx: i, kind: "abort" };
    if (inRect(x, y, rects.push)) return { taskIdx: i, kind: "push" };
  }
  return null;
}

export interface ErrandTaskDrawOptions {
  readonly getDisplaySignal: (taskIdx: number) => TaskSignalProfile;
  readonly watchMode: boolean;
  readonly watchHover: { taskIdx: number; kind: InterventionKind } | null;
  readonly inspectUsed: (taskIdx: number) => boolean;
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
  dropHighlightTaskIdx: number | null = null,
  watchOpts: ErrandTaskDrawOptions | null = null,
): void {
  const L = ERRAND_LAYOUT;
  drawAiCard(ctx, L.tasksX, L.tasksY, L.tasksW, L.tasksH);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("TASKS — triage + dispatch", L.tasksX + 14, L.tasksY + 18);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  let liveCount = 0;
  for (const h of helpers) {
    if (h.drawerAssigned !== null) liveCount++;
  }
  ctx.fillText(
    `${drawers.length} in queue · ${liveCount} live`,
    L.tasksX + L.tasksW - 14,
    L.tasksY + 18,
  );
  ctx.textAlign = "left";
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(
    "signals: rel / safe / urg · live: in · off · run",
    L.tasksX + 14,
    L.tasksY + L.tasksH - 8,
  );

  const byDrawer = helpersByDrawerSlot(helpers);
  const ro: ErrandTaskDrawOptions = watchOpts ?? {
    getDisplaySignal: (ix: number) => (drawers[ix] as Drawer).signalProfile,
    watchMode: false,
    watchHover: null,
    inspectUsed: () => false,
  };
  for (let i = 0; i < drawers.length; i++) {
    const d = drawers[i] as Drawer;
    const r = taskCardRect(i);
    const helper = byDrawer[i] ?? null;
    drawTaskCard(ctx, i, d, r, helper, dropHighlightTaskIdx === i, ro);
  }
}

function drawTaskCard(
  ctx: CanvasRenderingContext2D,
  taskIdx: number,
  drawer: Drawer,
  r: Rect,
  helper: Helper | null,
  isDropTarget: boolean,
  opts: ErrandTaskDrawOptions,
): void {
  const isActive = helper?.state === "filling" || helper?.state === "alert";
  const isAlerted = helper?.state === "alert";
  const showTriage = opts.watchMode && isActive;
  const prof = opts.getDisplaySignal(taskIdx);
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
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "600 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`task #${drawer.index + 1}`, r.x + 8, r.y + 14);
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.beginPath();
  ctx.roundRect(r.x + r.w - 22, r.y + 5, 16, 14, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.textAlign = "center";
  ctx.fillText(String(drawer.index + 1), r.x + r.w - 14, r.y + 15);
  ctx.textAlign = "left";

  drawTaskSignalMeters(ctx, r.x + 4, r.y + 20, prof);
  drawHintIcon(ctx, drawer.hint, r.x + r.w / 2 + 10, r.y + r.h / 2 - 2, 20);

  const { y: actionY } = watchActionRowLayout(r);
  const statusY = showTriage ? actionY - 11 : r.y + r.h - 8;
  const barY = showTriage ? actionY - 7 : r.y + r.h - 4;
  if (helper) {
    ctx.fillStyle = isAlerted ? CURSOR_AI.accent : CURSOR_AI.blue;
    ctx.font = "600 8px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      isAlerted ? "TRIP" : `ag${helper.index + 1} · ${helper.trait.label}`,
      r.x + r.w / 2,
      statusY,
    );
    ctx.textAlign = "left";
    if (helper.state === "filling" || helper.state === "alert") {
      const barX = r.x + 10;
      drawAiProgressLine(ctx, barX, barY, r.w - 20, helper.fillProgress, {
        tone: helper.state === "alert" ? "alert" : "default",
        thickness: 2,
      });
    }
  } else {
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("idle", r.x + r.w / 2, statusY);
    ctx.textAlign = "left";
  }

  if (showTriage) {
    const rec = taskInterventionButtonRects(r);
    const inUsed = opts.inspectUsed(taskIdx);
    const hov = opts.watchHover;
    const hIn =
      hov && hov.taskIdx === taskIdx && hov.kind === "inspect" ? hov : null;
    const hAb =
      hov && hov.taskIdx === taskIdx && hov.kind === "abort" ? hov : null;
    const hPu =
      hov && hov.taskIdx === taskIdx && hov.kind === "push" ? hov : null;
    drawTriageChip(ctx, rec.inspect, inUsed ? "in✓" : "in", {
      tone: inUsed ? "ghost" : "primary",
      hovered: hIn !== null,
      disabled: inUsed,
    });
    drawTriageChip(ctx, rec.abort, "off", {
      tone: "secondary",
      hovered: hAb !== null,
    });
    drawTriageChip(ctx, rec.push, "run", {
      tone: isAlerted ? "reject" : "approve",
      hovered: hPu !== null,
    });
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
  hoverRowIdx: number | null,
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
    "drag → task · fast/steady/careful paces (ETA)",
    L.agentsX + L.agentsW - 14,
    L.agentsY + 18,
  );
  ctx.textAlign = "left";

  for (let i = 0; i < helpers.length; i++) {
    const h = helpers[i] as Helper;
    const highlight = hoverRowIdx === i && pickedIndex === null;
    drawAgentRow(ctx, h, agentRowRect(i), drawers, highlight);
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
  rowHover: boolean,
): void {
  if (rowHover) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 106, 255, 0.05)";
    ctx.beginPath();
    ctx.roundRect(r.x + 2, r.y, r.w - 4, r.h, 5);
    ctx.fill();
    ctx.restore();
  }
  // Avatar
  drawAiAvatar(ctx, r.x + 14, r.y + r.h / 2, { size: 18 });
  // Name
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(`ag${helper.index + 1}`, r.x + 32, r.y + r.h / 2);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "600 8px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`· ${helper.trait.label}`, r.x + 64, r.y + r.h / 2);

  // Status pill
  const pillX = r.x + 120;
  let label = "idle";
  let tone: "neutral" | "active" | "alert" | "done" | "lost" = "neutral";
  if (helper.state === "filling") {
    const taskN =
      helper.drawerAssigned !== null ? helper.drawerAssigned + 1 : "?";
    label = `run #${taskN}`;
    tone = "active";
  } else if (helper.state === "alert") {
    label = "TRIP";
    tone = "alert";
  } else if (helper.state === "returning") {
    label = helper.result === "clue" ? "clue" : "empty";
    tone = helper.result === "clue" ? "done" : "neutral";
  } else if (helper.state === "lost") {
    label = "lost";
    tone = "lost";
  } else if (helper.state === "waiting") {
    label = "ready";
    tone = "neutral";
  } else {
    label = "moving";
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
    if (helper.drawerAssigned !== null) {
      const drawer = drawers[helper.drawerAssigned];
      if (drawer) {
        ctx.fillStyle = CURSOR_AI.inkSubtle;
        ctx.font = "9px 'Cursor Mono', ui-monospace, monospace";
        ctx.textAlign = "right";
        if (helper.state === "filling") {
          const effMs = drawer.fillRateMs * helper.trait.paceScale;
          const etaMs = effMs * (1 - helper.fillProgress);
          ctx.fillText(`≈${(etaMs / 1000).toFixed(1)}s`, barX + barW, barY - 4);
        } else {
          const left = Math.max(0, ERRAND_TRIPWIRE_ABORT_S - helper.tripwireT);
          ctx.fillText(`abort in ${left.toFixed(1)}s`, barX + barW, barY - 4);
        }
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
