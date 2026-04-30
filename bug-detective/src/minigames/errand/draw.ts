/** Cursor Agents lane defense — PvZ-style horizontal lanes + Agent Queue (slot `errand`). */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import {
  drawAiAvatar,
  drawAiCard,
  drawAiProgressLine,
  inRect,
  type Rect,
} from "../desk/aiCard";
import { bossWarningActive, queueHead, type LaneDefenseRuntime } from "./round";
import {
  AGENT_TRAY,
  LANE_COUNT,
  LANE_DEFENSE,
  type AgentKind,
  type EnemyKind,
  type EnemyUnit,
  type LaneIndex,
} from "./types";

export const ERRAND_LAYOUT = {
  panelX: 14,
  panelY: 34,
  panelW: 486,
  panelH: 252,
  fieldPadX: 12,
  /** Y-offset from panel top to first lane row (below meters). */
  fieldTopOffset: 62,
  laneRowH: 48,
  laneGap: 15,
  deskZoneW: 42,
  spawnZoneW: 54,
  queueW: 112,
  queueLaneGap: 12,
  queueCardH: 48,
  queueCardGap: 15,
} as const;

const LANE_KEY_LABELS = ["1", "2", "3"] as const;
const NEON_BG = "#0b0d12";
const NEON_GRID = "rgba(123,224,255,0.12)";
const NEON_CYAN = "#7be0ff";
const NEON_GREEN = "#3cff9a";

function playFieldOrigin(): { x: number; y: number; innerW: number } {
  const L = ERRAND_LAYOUT;
  return {
    x: L.panelX + L.fieldPadX + L.queueW + L.queueLaneGap,
    y: L.panelY + L.fieldTopOffset,
    innerW: L.panelW - L.fieldPadX * 2 - L.queueW - L.queueLaneGap,
  };
}

function laneRowY(i: number): number {
  const L = ERRAND_LAYOUT;
  const o = playFieldOrigin();
  return o.y + i * (L.laneRowH + L.laneGap);
}

/** Queue card rects — visual order depends on runtime, static fallback matches AGENT_TRAY. */
export function laneDefenseQueueRects(): Rect[] {
  const L = ERRAND_LAYOUT;
  return AGENT_TRAY.map((_, i) => ({
    x: L.panelX + L.fieldPadX,
    y: L.panelY + L.fieldTopOffset + i * (L.queueCardH + L.queueCardGap),
    w: L.queueW,
    h: L.queueCardH,
  }));
}

export function laneDefenseTrayRects(): Rect[] {
  return laneDefenseQueueRects();
}

export function laneDefenseLaneRects(): Rect[] {
  const L = ERRAND_LAYOUT;
  const o = playFieldOrigin();
  const rects: Rect[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    rects.push({
      x: o.x,
      y: laneRowY(i),
      w: o.innerW,
      h: L.laneRowH,
    });
  }
  return rects;
}

/** Horizontal march segment per lane: desk line (x=0) .. spawn (x=1). */
export function laneDefenseRowPlaySpan(_lane: LaneIndex): {
  playLeft: number;
  playRight: number;
} {
  const L = ERRAND_LAYOUT;
  const o = playFieldOrigin();
  const playW = o.innerW - L.deskZoneW - L.spawnZoneW;
  const playX0 = o.x + L.deskZoneW;
  return { playLeft: playX0, playRight: playX0 + playW };
}

function queueDisplayOrder(rt?: LaneDefenseRuntime): AgentKind[] {
  if (!rt) return AGENT_TRAY.map((a) => a.kind);
  return rt.queue
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const ar = a.entry.readyAt <= rt.elapsed;
      const br = b.entry.readyAt <= rt.elapsed;
      if (ar !== br) return ar ? -1 : 1;
      if (a.entry.promoted !== b.entry.promoted) {
        return a.entry.promoted ? -1 : 1;
      }
      if (!ar && a.entry.readyAt !== b.entry.readyAt) {
        return a.entry.readyAt - b.entry.readyAt;
      }
      return a.index - b.index;
    })
    .map(({ entry }) => entry.kind);
}

export function hitLaneDefenseQueueKind(
  x: number,
  y: number,
  rt?: LaneDefenseRuntime,
): AgentKind | null {
  const rects = laneDefenseQueueRects();
  const order = queueDisplayOrder(rt);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (inRect(x, y, r)) return order[i] ?? null;
  }
  return null;
}

export function hitLaneDefenseTrayKind(x: number, y: number): AgentKind | null {
  return hitLaneDefenseQueueKind(x, y);
}

export function hitLaneDefenseLane(x: number, y: number): LaneIndex | null {
  const rects = laneDefenseLaneRects();
  for (let i = 0; i < rects.length; i++) {
    if (inRect(x, y, rects[i]!)) return i as LaneIndex;
  }
  return null;
}

function meter(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  cur: number,
  max: number,
  hue: string,
): void {
  ctx.fillStyle = "rgba(231,250,255,0.72)";
  ctx.font = "500 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(label, x, y + 10);
  const bw = w - 54;
  const bx = x + 50;
  const bh = 8;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(bx, y + 2, bw, bh);
  const t = Math.min(1, max <= 0 ? 0 : cur / max);
  ctx.fillStyle = hue;
  ctx.fillRect(bx, y + 2, bw * t, bh);
}

function enemyHue(kind: EnemyKind): string {
  switch (kind) {
    case "zeroDay":
      return CURSOR_AI.accent;
    case "ransomwareBlob":
      return "#c47035";
    case "regressionBug":
      return "#6d52ff";
    case "phishingPacket":
      return "#329696";
    case "syntaxBug":
      return CURSOR_AI.inkMute;
  }
}

function drawEnemyGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  e: EnemyUnit,
): void {
  const col = enemyHue(e.kind);
  const scale = e.isBoss ? 1.35 : e.kind === "ransomwareBlob" ? 1.15 : 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  switch (e.kind) {
    case "syntaxBug": {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 1, 8, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-2, -2, 1.5, 4);
      ctx.fillRect(1, -2, 1.5, 4);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(-5, 6);
      ctx.lineTo(-7, 10);
      ctx.moveTo(5, 6);
      ctx.lineTo(7, 10);
      ctx.stroke();
      break;
    }
    case "phishingPacket": {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(10, -3);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.lineTo(-10, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(-6, -2, 12, 2);
      break;
    }
    case "regressionBug": {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 2, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f5d000";
      ctx.beginPath();
      ctx.moveTo(5, -4);
      ctx.lineTo(11, -4);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 8px 'Cursor Mono', monospace";
      ctx.fillText("!", 6, -2);
      break;
    }
    case "ransomwareBlob": {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 9, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(-3, 0, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "zeroDay": {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(-14, -12, 28, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px 'Cursor Mono', monospace";
      ctx.fillText("0D", -9, 4);
      break;
    }
  }
  ctx.restore();
}

function drawDefenderGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  kind: AgentKind,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  switch (kind) {
    case "fixer": {
      ctx.fillStyle = "#e8f4ee";
      ctx.fillRect(-10, -8, 20, 14);
      ctx.strokeRect(-10, -8, 20, 14);
      ctx.fillStyle = "#22aa66";
      ctx.fillRect(-2, -12, 4, 18);
      break;
    }
    case "reviewer": {
      ctx.fillStyle = "#eef2ff";
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#6d52ff";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "firewall": {
      ctx.fillStyle = "rgba(68,136,238,0.2)";
      ctx.fillRect(-10, -10, 20, 18);
      ctx.strokeRect(-10, -10, 20, 18);
      ctx.strokeStyle = "#4488ee";
      for (let i = -6; i <= 6; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, -10);
        ctx.lineTo(i, 8);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawTerminalBackdrop(ctx: CanvasRenderingContext2D): void {
  const L = ERRAND_LAYOUT;
  ctx.save();
  ctx.fillStyle = NEON_BG;
  ctx.fillRect(L.panelX, L.panelY, L.panelW, L.panelH);
  ctx.strokeStyle = "rgba(123,224,255,0.28)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(L.panelX + 0.5, L.panelY + 0.5, L.panelW - 1, L.panelH - 1);

  ctx.fillStyle = NEON_GRID;
  for (let x = L.panelX + 18; x < L.panelX + L.panelW; x += 18) {
    for (let y = L.panelY + 54; y < L.panelY + L.panelH - 8; y += 18) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = L.panelY + 2; y < L.panelY + L.panelH; y += 4) {
    ctx.fillRect(L.panelX + 1, y, L.panelW - 2, 1);
  }
  ctx.restore();
}

function drawQueueCard(
  ctx: CanvasRenderingContext2D,
  rt: LaneDefenseRuntime,
  kind: AgentKind,
  r: Rect,
  hot: boolean,
  isHead: boolean,
): void {
  const def = AGENT_TRAY.find((a) => a.kind === kind)!;
  const entry = rt.queue.find((q) => q.kind === kind)!;
  const ready = entry.readyAt <= rt.elapsed;
  const remaining = Math.max(0, entry.readyAt - rt.elapsed);
  const recharge01 = ready ? 1 : 1 - Math.min(1, remaining / def.recharge);
  const canAfford = rt.focus >= def.cost;

  ctx.save();
  ctx.globalAlpha = canAfford || isHead ? 1 : 0.6;
  ctx.shadowColor = isHead ? NEON_CYAN : hot ? CURSOR_AI.accent : "transparent";
  ctx.shadowBlur = isHead ? 16 : hot ? 10 : 0;
  ctx.fillStyle = isHead
    ? "rgba(123,224,255,0.13)"
    : hot
      ? "rgba(245,78,0,0.12)"
      : "rgba(255,255,255,0.045)";
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.strokeStyle = isHead
    ? NEON_CYAN
    : entry.promoted
      ? CURSOR_AI.accent
      : "rgba(123,224,255,0.28)";
  ctx.lineWidth = isHead ? 2 : 1;
  ctx.stroke();
  ctx.shadowBlur = 0;

  drawDefenderGlyph(ctx, r.x + 20, r.y + r.h / 2 + 3, kind);

  ctx.fillStyle = "#e9fbff";
  ctx.font = "700 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(def.label, r.x + 40, r.y + 17);
  ctx.fillStyle = ready ? NEON_GREEN : "rgba(231,250,255,0.55)";
  ctx.font = "600 8px 'Cursor Mono', ui-monospace, monospace";
  // Status text must fit between glyph (r.x + 40) and recharge ring
  // (r.x + r.w - 27). Keep strings short to avoid clipping into the ring.
  const status = isHead ? "GO" : ready ? "READY" : `${remaining.toFixed(1)}s`;
  ctx.fillText(status, r.x + 40, r.y + 30);

  ctx.fillStyle = canAfford ? "rgba(245,78,0,0.25)" : "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.roundRect(r.x + 40, r.y + r.h - 14, 48, 10, 4);
  ctx.fill();
  ctx.fillStyle = canAfford ? "#ffd7c7" : "rgba(231,250,255,0.5)";
  ctx.font = "700 7px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`${def.cost} FOCUS`, r.x + 45, r.y + r.h - 6);

  const cx = r.x + r.w - 17;
  const cy = r.y + r.h / 2;
  ctx.strokeStyle = "rgba(123,224,255,0.2)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = ready ? NEON_GREEN : NEON_CYAN;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * recharge01);
  ctx.stroke();
  ctx.restore();
}

function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

function drawDeployLaunchFx(
  ctx: CanvasRenderingContext2D,
  rt: LaneDefenseRuntime,
  lane: LaneIndex,
  playLeft: number,
  playRight: number,
  cy: number,
): void {
  const laneFx = rt.deployFx.filter((fx) => fx.lane === lane);
  if (laneFx.length === 0) return;

  const L = ERRAND_LAYOUT;
  const startX = L.panelX + L.fieldPadX + L.queueW + 8;
  const targetX = playLeft + 22;
  for (const fx of laneFx) {
    const rawT = Math.max(
      0,
      Math.min(1, (rt.elapsed - fx.startedAt) / fx.duration),
    );
    const t = easeOutCubic(rawT);
    const x = startX + (targetX - startX) * t;
    const y = cy - Math.sin(rawT * Math.PI) * 7;
    const alpha = Math.max(0, 1 - rawT * 0.55);
    const beamEnd = Math.min(playRight, x + 22 + rawT * 46);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = NEON_CYAN;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = NEON_CYAN;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(beamEnd, cy);
    ctx.stroke();

    ctx.strokeStyle = CURSOR_AI.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.max(startX, x - 32), cy + 6);
    ctx.lineTo(Math.min(playRight, x + 18), cy + 1);
    ctx.stroke();

    ctx.globalAlpha = alpha * (1 - rawT * 0.25);
    ctx.strokeStyle = "rgba(60,255,154,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(targetX, cy, 7 + rawT * 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    drawDefenderGlyph(ctx, x, y, fx.kind);
    ctx.restore();
  }
}

/** Primary playfield (lanes + Agent Queue + meters). */
export function drawLaneDefenseField(
  ctx: CanvasRenderingContext2D,
  rt: LaneDefenseRuntime,
  hover: {
    queue?: AgentKind | null;
    tray?: AgentKind | null;
    lane: LaneIndex | null;
    /** First-pick placement hint timer (seconds). */
    firstPlaceHintT?: number;
  },
): void {
  const L = ERRAND_LAYOUT;
  const hoverQueue = hover.queue ?? hover.tray ?? null;
  drawTerminalBackdrop(ctx);

  // Wave indicator pill replaces the redundant terminal heading; the desk
  // breadcrumb already says "Cursor Agents · lane defense".
  const waveLabel = `WAVE ${rt.wave}`;
  ctx.fillStyle = "rgba(123,224,255,0.16)";
  ctx.beginPath();
  ctx.roundRect(L.panelX + 14, L.panelY + 8, 70, 16, 5);
  ctx.fill();
  ctx.strokeStyle = NEON_CYAN;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#e9fbff";
  ctx.font = "700 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(waveLabel, L.panelX + 22, L.panelY + 19);

  meter(
    ctx,
    "BASE",
    L.panelX + 14,
    L.panelY + 26,
    164,
    rt.baseHealth,
    LANE_DEFENSE.baseHealthMax,
    NEON_GREEN,
  );
  meter(
    ctx,
    "CAP",
    L.panelX + 178,
    L.panelY + 26,
    164,
    rt.capacity,
    LANE_DEFENSE.capacityMax,
    NEON_CYAN,
  );

  const waveTxt = rt.defeated
    ? "DEFEAT"
    : rt.wavePause > 0
      ? `Wave pause · next ${rt.wave + 1}`
      : `Wave ${rt.wave} · clue ${rt.clueLocked ? "LOCKED" : "open"}`;
  ctx.fillStyle = "rgba(245,78,0,0.18)";
  ctx.beginPath();
  ctx.roundRect(L.panelX + L.panelW - 142, L.panelY + 12, 126, 18, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,78,0,0.45)";
  ctx.stroke();
  ctx.fillStyle = "#ffd7c7";
  ctx.font = "700 8px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(waveTxt.toUpperCase(), L.panelX + L.panelW - 135, L.panelY + 24);
  ctx.fillStyle = "rgba(231,250,255,0.8)";
  ctx.font = "700 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(
    `FOCUS ${Math.floor(rt.focus).toString().padStart(3, "0")}`,
    L.panelX + L.panelW - 138,
    L.panelY + 44,
  );

  ctx.fillStyle = "rgba(231,250,255,0.58)";
  ctx.font = "700 8px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("AGENT QUEUE", L.panelX + L.fieldPadX + 2, L.panelY + 54);

  const o = playFieldOrigin();

  // Boss warning ribbon — spans the play field top (between AGENT QUEUE
  // label and the lane rows). Pulses by elapsed time. Doesn't overlap
  // BASE/CAP meters or wave pill.
  if (bossWarningActive(rt)) {
    const ribW = o.innerW;
    const ribX = o.x;
    const ribY = L.panelY + L.fieldTopOffset - 14;
    const pulse = 0.55 + 0.25 * Math.sin(rt.elapsed * 6);
    ctx.fillStyle = `rgba(245,78,0,${0.22 * pulse + 0.18})`;
    ctx.beginPath();
    ctx.roundRect(ribX, ribY, ribW, 12, 4);
    ctx.fill();
    ctx.strokeStyle = `rgba(245,78,0,${0.95 * pulse})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffd7c7";
    ctx.font = "700 9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("⚠ ZERO-DAY INBOUND", ribX + ribW / 2, ribY + 9);
    ctx.textAlign = "left";
  }
  const playW = o.innerW - L.deskZoneW - L.spawnZoneW;
  const playX0 = o.x + L.deskZoneW;

  const enemiesByLane: [EnemyUnit[], EnemyUnit[], EnemyUnit[]] = [[], [], []];
  for (const e of rt.enemies) {
    enemiesByLane[e.lane].push(e);
  }

  const headKind = queueHead(rt)?.kind ?? null;
  const order = queueDisplayOrder(rt);
  const queueRects = laneDefenseQueueRects();
  for (let i = 0; i < order.length; i++) {
    const kind = order[i]!;
    drawQueueCard(
      ctx,
      rt,
      kind,
      queueRects[i]!,
      hoverQueue === kind,
      headKind === kind,
    );
  }

  for (let lane = 0; lane < LANE_COUNT; lane++) {
    const rowY = laneRowY(lane);
    const rowH = L.laneRowH;
    const hot = hover.lane === lane;

    ctx.fillStyle = hot ? "rgba(245,78,0,0.12)" : "rgba(255,255,255,0.035)";
    ctx.beginPath();
    ctx.roundRect(o.x, rowY, o.innerW, rowH, 8);
    ctx.fill();

    const spawnGlow = ctx.createLinearGradient(
      playX0 + playW,
      rowY,
      playX0 + playW + L.spawnZoneW,
      rowY,
    );
    spawnGlow.addColorStop(0, "rgba(245,78,0,0.04)");
    spawnGlow.addColorStop(1, "rgba(245,78,0,0.28)");
    ctx.fillStyle = spawnGlow;
    ctx.fillRect(playX0 + playW, rowY + 2, L.spawnZoneW - 2, rowH - 4);

    ctx.strokeStyle = hot ? CURSOR_AI.accent : "rgba(123,224,255,0.24)";
    ctx.lineWidth = hot ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(o.x + 0.5, rowY + 0.5, o.innerW - 1, rowH - 1, 8);
    ctx.stroke();

    ctx.strokeStyle = hot ? CURSOR_AI.accent : NEON_CYAN;
    ctx.globalAlpha = hot ? 0.72 : 0.36;
    ctx.beginPath();
    ctx.moveTo(playX0, rowY + rowH / 2);
    ctx.lineTo(playX0 + playW, rowY + rowH / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = hot ? CURSOR_AI.accent : NEON_CYAN;
    ctx.shadowColor = hot ? CURSOR_AI.accent : NEON_CYAN;
    ctx.shadowBlur = hot ? 10 : 5;
    ctx.font = "800 20px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(LANE_KEY_LABELS[lane]!, o.x + 12, rowY + rowH / 2 + 7);
    ctx.shadowBlur = 0;

    const agentHere = rt.placed.find((p) => p.lane === (lane as LaneIndex));
    const cy = rowY + rowH / 2 + 2;
    const launchActive = rt.deployFx.some((fx) => fx.lane === lane);
    if (agentHere && !launchActive) {
      drawDefenderGlyph(ctx, playX0 + 22, cy, agentHere.kind);
    }
    drawDeployLaunchFx(ctx, rt, lane as LaneIndex, playX0, playX0 + playW, cy);

    const laneAttackers = enemiesByLane[lane as LaneIndex];
    for (const e of laneAttackers) {
      const px = playX0 + e.x * playW;
      const rad = e.isBoss ? 15 : e.kind === "ransomwareBlob" ? 12 : 8;
      ctx.save();
      ctx.strokeStyle = "rgba(245,78,0,0.18)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 8, cy);
      ctx.lineTo(Math.min(playX0 + playW, px + 28), cy);
      ctx.stroke();
      ctx.shadowColor = enemyHue(e.kind);
      ctx.shadowBlur = 12;
      drawEnemyGlyph(ctx, px, cy, e);
      ctx.restore();
      const hw = Math.min(56, playW * 0.45);
      const hpT = e.hp / Math.max(1, e.maxHp);
      const barX = px - hw / 2;
      const barY = cy - rad - 9;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(barX, barY, hw, 4);
      ctx.fillStyle = e.isBoss ? CURSOR_AI.accent : NEON_GREEN;
      ctx.fillRect(barX, barY, hw * hpT, 4);
    }
  }
}

export function drawErrandIntro(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 392;
  const h = 178;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  drawAiAvatar(ctx, x + 30, y + 34, { size: 28 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.fillText("Cursor Agents — lane defense", x + 62, y + 28);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    "Three horizontal lanes · Zero-Day bosses · defend the desk",
    x + 62,
    y + 46,
  );
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.fillText(
    "Press 1 / 2 / 3 to deploy the ready queue head into a lane.",
    x + 22,
    y + 76,
  );
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "Click a left-rail Hero to promote it; bugs march right → left.",
    x + 22,
    y + 94,
  );
  ctx.fillText(
    "Evidence locks after 3 waves cleared or 60s — then score until defeat.",
    x + 22,
    y + 112,
  );
  drawAiProgressLine(ctx, x + 22, y + h - 22, w - 44, progress01);
  ctx.restore();
}

export function drawErrandResult(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  o: {
    deskScore: number;
    clueLocked: boolean;
    wavesFinished: number;
    bossesDefeated: number;
    elapsedSec: number;
  },
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 408;
  const h = 216;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("RUN END — DESK OVERRUN", x + 24, y + 28);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 36px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(String(o.deskScore), x + 24, y + 74);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("notebook tier score", x + 24, y + 88);

  const sx = x + w - 192;
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`waves cleared    ${o.wavesFinished}`, sx, y + 54);
  ctx.fillText(`boss kills       ${o.bossesDefeated}`, sx, y + 74);
  ctx.fillText(`held desk (s)    ${o.elapsedSec.toFixed(1)}`, sx, y + 94);

  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 12px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("Notebook evidence", x + 24, y + 118);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  if (!o.clueLocked) {
    ctx.fillText(
      "Clue did not lock — need 3 waves cleared or 60s survived before defeat.",
      x + 24,
      y + 138,
    );
    ctx.fillText("No cipher token is pinned from this run.", x + 24, y + 154);
  } else {
    ctx.fillText(
      "Clue was locked — cipher pins when you continue.",
      x + 24,
      y + 138,
    );
  }
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.fillText("click anywhere to continue", x + 24, y + h - 16);
  ctx.restore();
}

export function drawErrandTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  dx: number,
  dy: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = dy + h / 2;
  const L = ERRAND_LAYOUT;
  const scale = 0.38;
  const queueW = L.queueW * scale;
  const rowW = (L.panelW - L.fieldPadX * 2 - L.queueW - L.queueLaneGap) * scale;
  const rowH = L.laneRowH * scale;
  const gap = L.laneGap * scale;
  const x0 = dx + 16;
  const laneX = x0 + queueW + 12 * scale;
  const y0 = cy - (LANE_COUNT * rowH + (LANE_COUNT - 1) * gap) / 2;
  ctx.fillStyle = "rgba(11,13,18,0.92)";
  ctx.fillRect(
    x0 - 6,
    y0 - 10,
    queueW + rowW + 20 * scale,
    LANE_COUNT * (rowH + gap) + 12,
  );
  ctx.strokeStyle = NEON_CYAN;
  ctx.strokeRect(
    x0 - 6,
    y0 - 10,
    queueW + rowW + 20 * scale,
    LANE_COUNT * (rowH + gap) + 12,
  );
  ctx.fillStyle = "rgba(123,224,255,0.12)";
  ctx.fillRect(x0, y0, queueW, LANE_COUNT * rowH + (LANE_COUNT - 1) * gap);
  for (let i = 0; i < LANE_COUNT; i++) {
    const yy = y0 + i * (rowH + gap);
    ctx.strokeStyle = "rgba(123,224,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(laneX, yy, rowW, rowH);
    ctx.fillStyle = "rgba(245,78,0,0.24)";
    ctx.fillRect(laneX + rowW - 24 * scale, yy, 24 * scale, rowH);
    ctx.fillStyle = NEON_CYAN;
    ctx.font = `${Math.max(9, 10 * scale)}px 'Cursor Mono', monospace`;
    ctx.fillText(["1", "2", "3"][i]!, laneX + 5, yy + rowH / 2 + 4);
    ctx.fillStyle = "#e9fbff";
    ctx.fillText(["Fix", "Rev", "Wall"][i]!, x0 + 5, yy + rowH / 2 + 4);
  }
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(
    "left queue · 1/2/3 lanes · bugs march ←",
    x0,
    y0 + LANE_COUNT * (rowH + gap) + 18,
  );
  ctx.restore();
}
