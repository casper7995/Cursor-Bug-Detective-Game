/**
 * Canvas rendering for "Bugbot review" — spot-the-difference: stacked
 * ORIGINAL/TONIGHT on the left; Bugbot chat + Agree/Disagree/Point on the right.
 */

import { CURSOR_AI } from "../../ui/cursorAiTheme";
import {
  drawAiAvatar,
  drawAiButton,
  drawAiCard,
  drawAiProgressLine,
  inRect,
  type Rect,
} from "../desk/aiCard";
import type { TamperCall, TamperScene, TamperSpot } from "./types";
import { spotById } from "./round";

export type TamperChatActionMode =
  | "active"
  | "readBeat"
  | "pointPick"
  | "verdict"
  | "hidden"
  | "idle";

/** One-line label for the Bugbot call (plain language, matches row highlight). */
export function bugbotRowClaimLine(
  call: TamperCall,
  scene: TamperScene,
): string {
  const rowIdx = scene.spots.findIndex(
    (s) => s.id === call.bugbotPointsAtSpotId,
  );
  const n = rowIdx >= 0 ? rowIdx + 1 : "?";
  return call.bugbotClaim === "tampered"
    ? `Bugbot says: Row ${n} changed`
    : `Bugbot says: Row ${n} is clean`;
}

// ---------------------------------------------------------------------
// Layout (512 × 320 internal canvas)
// ---------------------------------------------------------------------
export const TAMPER_LAYOUT = {
  /** Diff card on the left. */
  diffX: 18,
  diffY: 44,
  diffW: 286,
  diffH: 246,
  /** Chat / actions card on the right. */
  chatX: 318,
  chatY: 44,
  chatW: 178,
  chatH: 246,
  /** Spot row height inside the diff card. */
  rowH: 18,
} as const;

/** Reference rect for a TONIGHT spot row — exported for future overlays. */
export function spotRowRect(
  _spot: TamperSpot,
  half: "original" | "tonight",
): Rect {
  const L = TAMPER_LAYOUT;
  const yBase =
    half === "original" ? L.diffY + 38 : L.diffY + 38 + L.rowH * 5 + 22;
  return { x: L.diffX + 12, y: yBase, w: L.diffW - 24, h: L.rowH };
}

// ---------------------------------------------------------------------
// Bugbot personality pool
// ---------------------------------------------------------------------
const BUGBOT_QUIPS_TAMPERED: readonly string[] = [
  "I'd reject this PR.",
  "Logic looks tampered. Easy catch.",
  "This change smells. Reject.",
  "Off-by-one of the soul.",
  "Trust me, this is the bug.",
  "Quick fix needed before merge.",
];
const BUGBOT_QUIPS_CLEAN: readonly string[] = [
  "Looks fine to me. Ship it.",
  "Reviewed. No notes.",
  "Clean diff. Approving.",
  "All green from here.",
  "Looks like the original. Approve.",
  "I see no problem here.",
];

function bugbotQuip(call: TamperCall): string {
  const pool =
    call.bugbotClaim === "tampered"
      ? BUGBOT_QUIPS_TAMPERED
      : BUGBOT_QUIPS_CLEAN;
  const idx =
    (call.callIndex * 7919 + call.bugbotConfidencePct * 17) % pool.length;
  return pool[idx] as string;
}

// ---------------------------------------------------------------------
// Diff card — ORIGINAL on top, TONIGHT below
// ---------------------------------------------------------------------
export function drawDiffCard(
  ctx: CanvasRenderingContext2D,
  scene: TamperScene,
  pointAtSpotId: string | null,
  showRealTamper: boolean,
  pickingSpot: boolean,
): void {
  const L = TAMPER_LAYOUT;
  drawAiCard(ctx, L.diffX, L.diffY, L.diffW, L.diffH);

  // Filename strip — flat rect (top corners stay sharp; the card border
  // sits on top so it still reads as a rounded card).
  ctx.save();
  ctx.fillStyle = CURSOR_AI.surfaceMute;
  ctx.fillRect(L.diffX + 1, L.diffY + 1, L.diffW - 2, 22);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.beginPath();
  ctx.moveTo(L.diffX + 1, L.diffY + 23);
  ctx.lineTo(L.diffX + L.diffW - 1, L.diffY + 23);
  ctx.stroke();
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${scene.displayName.toLowerCase().replace(/\s+/g, "-")}.diff`,
    L.diffX + 12,
    L.diffY + 12,
  );
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText("TONIGHT vs ORIGINAL", L.diffX + L.diffW - 12, L.diffY + 12);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();

  // Section header — ORIGINAL
  const origHeaderY = L.diffY + 32;
  drawHalfLabel(ctx, L.diffX + 12, origHeaderY, "ORIGINAL", CURSOR_AI.green);
  // Section header — TONIGHT (sits below the ORIGINAL block + 10px gap)
  const tonightHeaderY = origHeaderY + 6 + scene.spots.length * L.rowH + 12;
  drawHalfLabel(ctx, L.diffX + 12, tonightHeaderY, "TONIGHT", CURSOR_AI.accent);

  // Subtle column rule between the two halves
  ctx.save();
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.beginPath();
  const ruleY = tonightHeaderY - 6;
  ctx.moveTo(L.diffX + 12, ruleY);
  ctx.lineTo(L.diffX + L.diffW - 12, ruleY);
  ctx.stroke();
  ctx.restore();

  // Rows
  const spots = scene.spots;
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i] as TamperSpot;
    const oy = origHeaderY + 6 + i * L.rowH;
    const ty = tonightHeaderY + 6 + i * L.rowH;
    drawSpotRow(
      ctx,
      spot,
      L.diffX + 12,
      oy,
      L.diffW - 24,
      L.rowH,
      "original",
      false,
      false,
    );
    const bugbotHere = pointAtSpotId !== null && pointAtSpotId === spot.id;
    const isReveal = showRealTamper && spot.tampered;
    drawSpotRow(
      ctx,
      spot,
      L.diffX + 12,
      ty,
      L.diffW - 24,
      L.rowH,
      "tonight",
      bugbotHere,
      isReveal,
    );
    if (pickingSpot) {
      ctx.save();
      ctx.strokeStyle = CURSOR_AI.accent;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(L.diffX + 12, ty, L.diffW - 24, L.rowH);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

/** One-line micro-hint in the gap below the diff card (avoids crowding the rows). */
export function drawTamperDiffHintGutter(
  ctx: CanvasRenderingContext2D,
  line: string,
): void {
  if (!line) return;
  const L = TAMPER_LAYOUT;
  const maxW = L.diffW - 24;
  const x = L.diffX + 12;
  const y = L.diffY + L.diffH + 9;
  ctx.save();
  ctx.font = "8px 'Cursor Mono', ui-monospace, monospace";
  let t = line;
  while (t.length > 3 && ctx.measureText(`${t}…`).width > maxW) {
    t = t.slice(0, -1);
  }
  if (t !== line) t += "…";
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.textAlign = "left";
  ctx.fillText(t, x, y);
  ctx.restore();
}

function drawHalfLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  accent: string,
): void {
  ctx.save();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y - 5, 7, 7);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "700 9px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 12, y - 1);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawSpotRow(
  ctx: CanvasRenderingContext2D,
  spot: TamperSpot,
  x: number,
  y: number,
  w: number,
  h: number,
  half: "original" | "tonight",
  bugbotPointsHere: boolean,
  revealRealTamper: boolean,
): void {
  const lineText =
    half === "tonight" && spot.tampered
      ? spot.tonightIfThisTampered
      : spot.label;
  const sketchKey =
    half === "tonight" && spot.tampered && spot.tonightSketchKey
      ? spot.tonightSketchKey
      : spot.sketchKey;
  ctx.save();
  if (revealRealTamper) {
    ctx.fillStyle = CURSOR_AI.greenMute;
    ctx.fillRect(x, y, w, h);
  }
  if (bugbotPointsHere && half === "tonight") {
    ctx.strokeStyle = "rgba(245,78,0,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  drawPropSketch(ctx, sketchKey, x + 12, y + h / 2, 9);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  const textX = x + 28;
  const maxW = w - 34 - (bugbotPointsHere && half === "tonight" ? 42 : 0);
  let short = lineText;
  if (ctx.measureText(short).width > maxW) {
    for (let n = lineText.length; n >= 1; n--) {
      const cand = n < lineText.length ? `${lineText.slice(0, n)}…` : lineText;
      if (n === 1 || ctx.measureText(cand).width <= maxW) {
        short = cand;
        break;
      }
    }
  }
  ctx.fillText(short, textX, y + h / 2 + 1);
  if (bugbotPointsHere && half === "tonight") {
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "8px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText("bot", x + w - 4, y + h / 2 + 1);
  } else if (revealRealTamper) {
    ctx.fillStyle = CURSOR_AI.green;
    ctx.font = "700 8px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText("real", x + w - 4, y + h / 2 + 1);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------------------------------------------------------------------
// Chat / actions card
// ---------------------------------------------------------------------
export interface ChatHits {
  readonly approve: Rect;
  readonly reject: Rect;
  readonly suggestFix: Rect;
}

function emptyChatHits(): ChatHits {
  return {
    approve: { x: 0, y: 0, w: 0, h: 0 },
    reject: { x: 0, y: 0, w: 0, h: 0 },
    suggestFix: { x: 0, y: 0, w: 0, h: 0 },
  };
}

export function drawChatCard(
  ctx: CanvasRenderingContext2D,
  call: TamperCall | null,
  scene: TamperScene | null,
  hover: "approve" | "reject" | "suggestFix" | null,
  secondsLeft01: number,
  pickingSpot: boolean,
  actionMode: TamperChatActionMode = "active",
): ChatHits {
  const L = TAMPER_LAYOUT;
  drawAiCard(ctx, L.chatX, L.chatY, L.chatW, L.chatH);

  // Header with avatar + name + status pill
  drawAiAvatar(ctx, L.chatX + 22, L.chatY + 22, { size: 22 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Bugbot", L.chatX + 42, L.chatY + 19);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("code review · daily", L.chatX + 42, L.chatY + 33);

  if (actionMode === "hidden") {
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 12px 'Cursor Gothic', sans-serif";
    wrapAndDraw(
      ctx,
      "Bugbot’s timed row calls are next. Read the short how-to in the center to continue…",
      L.chatX + 14,
      L.chatY + 64,
      L.chatW - 28,
      16,
    );
    drawAiProgressLine(
      ctx,
      L.chatX + 14,
      L.chatY + L.chatH - 14,
      L.chatW - 28,
      1,
      { tone: "default" },
    );
    return emptyChatHits();
  }

  if (actionMode === "idle") {
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 12px 'Cursor Gothic', sans-serif";
    wrapAndDraw(
      ctx,
      "Quick intro on the left. The compare tools unlock after this splash.",
      L.chatX + 14,
      L.chatY + 64,
      L.chatW - 28,
      16,
    );
    drawAiProgressLine(
      ctx,
      L.chatX + 14,
      L.chatY + L.chatH - 14,
      L.chatW - 28,
      1,
      { tone: "default" },
    );
    return emptyChatHits();
  }

  if (call && scene) {
    const claim = bugbotRowClaimLine(call, scene);
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(claim, L.chatX + 14, L.chatY + 60);
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 11px 'Cursor Gothic', sans-serif";
    wrapAndDraw(
      ctx,
      `“${bugbotQuip(call)}”`,
      L.chatX + 14,
      L.chatY + 80,
      L.chatW - 28,
      14,
    );
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(
      `confidence ${call.bugbotConfidencePct}%`,
      L.chatX + 14,
      L.chatY + 122,
    );
  }

  // Buttons or alternate guidance
  const bx = L.chatX + 14;
  const bw = L.chatW - 28;
  const bh = 30;
  const approveY = L.chatY + 134;
  const rejectY = approveY + bh + 8;
  const suggestY = rejectY + bh + 8;
  const approve: Rect = { x: bx, y: approveY, w: bw, h: bh };
  const reject: Rect = { x: bx, y: rejectY, w: bw, h: bh };
  const suggestFix: Rect = { x: bx, y: suggestY, w: bw, h: bh };

  if (actionMode === "readBeat") {
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    wrapAndDraw(
      ctx,
      "Get ready — the timer starts on the first timed call. Scan ORIGINAL and TONIGHT first.",
      bx,
      approveY - 2,
      bw,
      12,
    );
  } else if (actionMode === "verdict") {
    // Call summary only; no action row.
  } else if (actionMode === "pointPick") {
    ctx.fillStyle = CURSOR_AI.accent;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    wrapAndDraw(
      ctx,
      "Click the real changed row in TONIGHT (left).",
      bx,
      approveY - 2,
      bw,
      12,
    );
  } else {
    drawAiButton(ctx, approve, "Bugbot is right", {
      tone: "approve",
      leading: "✓",
      hovered: hover === "approve",
      font: "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif",
    });
    drawAiButton(ctx, reject, "Bugbot is wrong", {
      tone: "reject",
      leading: "✗",
      hovered: hover === "reject",
      font: "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif",
    });
    drawAiButton(
      ctx,
      suggestFix,
      pickingSpot ? "Pick TONIGHT row…" : "Point to real change",
      {
        tone: "ghost",
        leading: "→",
        hovered: hover === "suggestFix",
        disabled: pickingSpot,
        font: "600 10px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif",
      },
    );
  }

  const lineTone: "alert" | "default" = pickingSpot ? "alert" : "default";
  drawAiProgressLine(
    ctx,
    L.chatX + 14,
    L.chatY + L.chatH - 14,
    L.chatW - 28,
    secondsLeft01,
    { tone: lineTone },
  );
  if (actionMode === "active") {
    return { approve, reject, suggestFix };
  }
  return emptyChatHits();
}

function wrapAndDraw(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineH: number,
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(cand).width <= width) cur = cand;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  let yy = y;
  for (const line of lines) {
    ctx.fillText(line, x, yy);
    yy += lineH;
  }
  return yy;
}

// ---------------------------------------------------------------------
// Cards: intro + result
// ---------------------------------------------------------------------
export function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: TamperScene,
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
  drawAiAvatar(ctx, x + 32, y + 38, { size: 28 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.fillText("Spot the real change", x + 60, y + 32);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(`scene · ${scene.displayName} · Bugbot review`, x + 60, y + 50);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    "Compare ORIGINAL vs TONIGHT. One row really changed. Bugbot can be wrong about a row.",
    x + 24,
    y + 82,
  );
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "If Bugbot is wrong, use Point to real change, then click the true changed row.",
    x + 24,
    y + 100,
  );
  drawAiProgressLine(ctx, x + 24, y + h - 22, w - 48, progress01);
  ctx.restore();
}

/** Full-screen how-to, after intro, before the read beat. */
export function drawInstructionCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 400;
  const h = 198;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  drawAiAvatar(ctx, x + 28, y + 36, { size: 28 });
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 15px 'Cursor Gothic', sans-serif";
  ctx.fillText("How this round works", x + 64, y + 30);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  const lines = [
    "First: find the one real change in TONIGHT.",
    "Then: Bugbot will call out rows. Say if Bugbot is right.",
    "If Bugbot is wrong, click the real changed TONIGHT row.",
  ];
  let ly = y + 70;
  for (const line of lines) {
    ctx.fillText(line, x + 28, ly);
    ly += 20;
  }
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(
    "Press Enter, Space, or click — or wait for the next step.",
    x + 28,
    y + h - 38,
  );
  drawAiProgressLine(ctx, x + 24, y + h - 22, w - 48, progress01, {
    tone: "default",
  });
  ctx.restore();
}

export function drawResultCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  result: { score: number; rightCalls: number; caughtLies: number },
  total: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 180;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("REVIEW SUMMARY", x + 24, y + 26);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 36px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(String(result.score), x + 24, y + 70);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("score", x + 24, y + 86);
  // Stat strip on the right
  const stripX = x + w - 152;
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(`accuracy   ${result.rightCalls}/${total}`, stripX, y + 56);
  ctx.fillText(`caught lying   ${result.caughtLies}`, stripX, y + 74);
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("click anywhere to close", x + 24, y + h - 16);
  ctx.restore();
}

// ---------------------------------------------------------------------
// Tutorial diagram
// ---------------------------------------------------------------------
export interface TamperTutorialDiagramLayout {
  readonly centerY: number;
  readonly avatar: {
    readonly cx: number;
    readonly cy: number;
    readonly size: number;
  };
  readonly label: {
    readonly x: number;
    readonly y: number;
  };
  readonly labelEndX: number;
  readonly agree: Rect;
  readonly disagree: Rect;
}

const TAMPER_TUTORIAL_LABEL = "Match panels";
const TAMPER_TUTORIAL_LABEL_WIDTH = 74;
const TAMPER_TUTORIAL_AVATAR_SIZE = 16;
const TAMPER_TUTORIAL_ICON_GAP = 10;
const TAMPER_TUTORIAL_LABEL_GAP = 12;
const TAMPER_TUTORIAL_BUTTON_GAP = 8;
const TAMPER_TUTORIAL_BUTTON_H = 26;
const TAMPER_TUTORIAL_AGREE_W = 68;
const TAMPER_TUTORIAL_DISAGREE_W = 82;

export function getTamperTutorialDiagramLayout(
  x: number,
  y: number,
  w: number,
  h: number,
  labelWidth = TAMPER_TUTORIAL_LABEL_WIDTH,
): TamperTutorialDiagramLayout {
  const centerY = y + h / 2;
  const rowW =
    TAMPER_TUTORIAL_AVATAR_SIZE +
    TAMPER_TUTORIAL_ICON_GAP +
    labelWidth +
    TAMPER_TUTORIAL_LABEL_GAP +
    TAMPER_TUTORIAL_AGREE_W +
    TAMPER_TUTORIAL_BUTTON_GAP +
    TAMPER_TUTORIAL_DISAGREE_W;
  const rowX = x + Math.max(0, (w - rowW) / 2);
  const labelX = rowX + TAMPER_TUTORIAL_AVATAR_SIZE + TAMPER_TUTORIAL_ICON_GAP;
  const labelEndX = labelX + labelWidth;
  const agreeX = labelEndX + TAMPER_TUTORIAL_LABEL_GAP;
  const disagreeX =
    agreeX + TAMPER_TUTORIAL_AGREE_W + TAMPER_TUTORIAL_BUTTON_GAP;
  const buttonY = centerY - TAMPER_TUTORIAL_BUTTON_H / 2;

  return {
    centerY,
    avatar: {
      cx: rowX + TAMPER_TUTORIAL_AVATAR_SIZE / 2,
      cy: centerY,
      size: TAMPER_TUTORIAL_AVATAR_SIZE,
    },
    label: { x: labelX, y: centerY },
    labelEndX,
    agree: {
      x: agreeX,
      y: buttonY,
      w: TAMPER_TUTORIAL_AGREE_W,
      h: TAMPER_TUTORIAL_BUTTON_H,
    },
    disagree: {
      x: disagreeX,
      y: buttonY,
      w: TAMPER_TUTORIAL_DISAGREE_W,
      h: TAMPER_TUTORIAL_BUTTON_H,
    },
  };
}

export function drawTamperTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  const layout = getTamperTutorialDiagramLayout(
    x,
    y,
    w,
    h,
    ctx.measureText(TAMPER_TUTORIAL_LABEL).width,
  );
  drawAiAvatar(ctx, layout.avatar.cx, layout.avatar.cy, {
    size: layout.avatar.size,
  });
  ctx.fillText(TAMPER_TUTORIAL_LABEL, layout.label.x, layout.label.y);
  drawAiButton(ctx, layout.agree, "Right", {
    tone: "approve",
    leading: "✓",
    font: "600 10px 'Cursor Gothic', sans-serif",
  });
  drawAiButton(ctx, layout.disagree, "Wrong", {
    tone: "reject",
    leading: "✗",
    font: "600 10px 'Cursor Gothic', sans-serif",
  });
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------------------------------------------------------------------
// Prop sketch library (re-used from the previous draw module)
// ---------------------------------------------------------------------
function drawPropSketch(
  ctx: CanvasRenderingContext2D,
  sketchKey: string,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = CURSOR_AI.ink;
  ctx.fillStyle = CURSOR_AI.ink;
  switch (sketchKey) {
    case "stamp":
    case "stamp_offset":
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.fillStyle = CURSOR_AI.accent;
      ctx.beginPath();
      ctx.arc(
        sketchKey === "stamp_offset" ? size * 0.12 : 0,
        0,
        size * 0.22,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      break;
    case "photo":
    case "photo_glare":
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.beginPath();
      ctx.arc(-size * 0.2, -size * 0.1, size * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.3);
      ctx.lineTo(0, -size * 0.05);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.stroke();
      if (sketchKey === "photo_glare") {
        ctx.strokeStyle = "rgba(245,78,0,0.5)";
        ctx.beginPath();
        ctx.moveTo(-size * 0.45, -size * 0.35);
        ctx.lineTo(size * 0.4, size * 0.25);
        ctx.stroke();
      }
      break;
    case "pen":
    case "pen_smudge":
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, -size * 0.4);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.stroke();
      ctx.fillRect(size * 0.35, size * 0.18, size * 0.18, size * 0.18);
      if (sketchKey === "pen_smudge") {
        ctx.fillStyle = "rgba(20,18,11,0.4)";
        ctx.beginPath();
        ctx.arc(-size * 0.1, -size * 0.1, size * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "paperclip":
    case "staple":
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.4);
      ctx.lineTo(-size * 0.3, size * 0.3);
      ctx.quadraticCurveTo(-size * 0.05, size * 0.55, size * 0.2, size * 0.3);
      ctx.lineTo(size * 0.2, -size * 0.2);
      ctx.quadraticCurveTo(size * 0.05, -size * 0.45, -size * 0.1, -size * 0.2);
      ctx.lineTo(-size * 0.1, size * 0.1);
      ctx.stroke();
      if (sketchKey === "staple") {
        ctx.beginPath();
        ctx.moveTo(size * 0.15, -size * 0.35);
        ctx.lineTo(-size * 0.1, size * 0.2);
        ctx.stroke();
      }
      break;
    case "signature":
    case "signature_loopy":
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.1);
      ctx.bezierCurveTo(
        -size * 0.2,
        -size * 0.6,
        size * 0.1,
        size * 0.4,
        size * 0.5,
        -size * 0.05,
      );
      ctx.stroke();
      if (sketchKey === "signature_loopy") {
        ctx.beginPath();
        ctx.arc(-size * 0.2, 0, size * 0.1, 0, Math.PI * 1.2);
        ctx.stroke();
      }
      break;
    case "vial":
    case "vial_empty":
      ctx.beginPath();
      ctx.moveTo(-size * 0.25, -size * 0.5);
      ctx.lineTo(-size * 0.25, size * 0.3);
      ctx.quadraticCurveTo(0, size * 0.55, size * 0.25, size * 0.3);
      ctx.lineTo(size * 0.25, -size * 0.5);
      ctx.stroke();
      if (sketchKey === "vial") {
        ctx.fillStyle = CURSOR_AI.green;
        ctx.fillRect(-size * 0.22, 0, size * 0.44, size * 0.3);
      } else {
        ctx.fillStyle = "rgba(24, 68, 40, 0.2)";
        ctx.fillRect(-size * 0.22, 0, size * 0.44, size * 0.12);
      }
      break;
    case "tag":
    case "tag_torn":
      ctx.beginPath();
      if (sketchKey === "tag_torn") {
        ctx.moveTo(-size * 0.4, -size * 0.32);
        ctx.lineTo(size * 0.2, -size * 0.28);
        ctx.lineTo(size * 0.5, 0);
        ctx.lineTo(size * 0.2, size * 0.3);
        ctx.lineTo(-size * 0.4, size * 0.3);
        ctx.closePath();
      } else {
        ctx.moveTo(-size * 0.4, -size * 0.3);
        ctx.lineTo(size * 0.2, -size * 0.3);
        ctx.lineTo(size * 0.5, 0);
        ctx.lineTo(size * 0.2, size * 0.3);
        ctx.lineTo(-size * 0.4, size * 0.3);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size * 0.18, 0, size * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "key":
    case "key_bent":
      if (sketchKey === "key_bent") ctx.rotate(0.25);
      ctx.beginPath();
      ctx.arc(-size * 0.25, 0, size * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.07, 0);
      ctx.lineTo(size * 0.5, 0);
      ctx.moveTo(size * 0.25, 0);
      ctx.lineTo(size * 0.25, size * 0.2);
      ctx.moveTo(size * 0.4, 0);
      ctx.lineTo(size * 0.4, size * 0.2);
      ctx.stroke();
      break;
    case "boot":
    case "boot print":
    case "boot_smear":
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, size * 0.3);
      ctx.lineTo(-size * 0.4, -size * 0.3);
      ctx.quadraticCurveTo(-size * 0.4, -size * 0.55, 0, -size * 0.45);
      ctx.lineTo(size * 0.5, -size * 0.05);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.closePath();
      ctx.stroke();
      if (sketchKey === "boot_smear") {
        ctx.fillStyle = "rgba(20,18,11,0.3)";
        ctx.beginPath();
        ctx.ellipse(
          size * 0.15,
          size * 0.25,
          size * 0.2,
          size * 0.08,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      break;
    case "ledger":
    case "ledger_fold":
      ctx.strokeRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(-size * 0.3, -size * 0.4 + i * size * 0.2);
        ctx.lineTo(size * 0.3, -size * 0.4 + i * size * 0.2);
      }
      ctx.stroke();
      if (sketchKey === "ledger_fold") {
        ctx.beginPath();
        ctx.moveTo(size * 0.25, -size * 0.4);
        ctx.lineTo(size * 0.35, -size * 0.25);
        ctx.lineTo(size * 0.25, -size * 0.1);
        ctx.stroke();
      }
      break;
    case "shade":
    case "lampshade":
    case "lampshade_tape":
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.4);
      ctx.lineTo(-size * 0.3, -size * 0.4);
      ctx.lineTo(size * 0.3, -size * 0.4);
      ctx.lineTo(size * 0.5, size * 0.4);
      ctx.closePath();
      ctx.stroke();
      if (sketchKey === "lampshade_tape") {
        ctx.fillStyle = "rgba(245,78,0,0.35)";
        ctx.fillRect(-size * 0.15, -size * 0.35, size * 0.12, size * 0.1);
      }
      break;
    case "switch":
    case "switch_scuff":
      ctx.strokeRect(-size * 0.3, -size * 0.4, size * 0.6, size * 0.8);
      ctx.fillStyle = CURSOR_AI.ink;
      ctx.fillRect(-size * 0.18, -size * 0.05, size * 0.36, size * 0.18);
      if (sketchKey === "switch_scuff") {
        ctx.strokeStyle = "rgba(20,18,11,0.45)";
        ctx.beginPath();
        ctx.moveTo(-size * 0.2, -size * 0.35);
        ctx.lineTo(size * 0.15, size * 0.25);
        ctx.moveTo(size * 0.1, -size * 0.32);
        ctx.lineTo(-size * 0.12, size * 0.2);
        ctx.stroke();
        ctx.strokeStyle = CURSOR_AI.ink;
      }
      break;
    case "wire":
    case "wire_cut":
      if (sketchKey === "wire_cut") {
        // Two zigzag segments with a visible gap in the middle.
        ctx.beginPath();
        ctx.moveTo(-size * 0.5, -size * 0.3);
        for (let i = 0; i <= 2; i++) {
          const xx = -size * 0.5 + (i * size) / 4;
          const yy = i % 2 === 0 ? -size * 0.3 : size * 0.3;
          ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(size * 0.05, -size * 0.3);
        for (let i = 0; i <= 2; i++) {
          const xx = size * 0.05 + (i * size) / 4;
          const yy = i % 2 === 0 ? -size * 0.3 : size * 0.3;
          ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-size * 0.05, 0);
        ctx.lineTo(size * 0.05, 0);
        ctx.moveTo(0, -size * 0.05);
        ctx.lineTo(0, size * 0.05);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(-size * 0.5, -size * 0.3);
        for (let i = 0; i <= 4; i++) {
          const xx = -size * 0.5 + (i * size) / 4;
          const yy = i % 2 === 0 ? -size * 0.3 : size * 0.3;
          ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      break;
    case "puddle":
    case "puddle_oil": {
      const fill =
        sketchKey === "puddle_oil"
          ? "rgba(192, 96, 32, 0.55)"
          : "rgba(20,18,11,0.55)";
      ctx.fillStyle = fill;
      if (sketchKey === "puddle_oil") {
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.55, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 200, 80, 0.2)";
        ctx.beginPath();
        ctx.ellipse(-size * 0.1, 0, size * 0.2, size * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.55, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "book":
    case "book_shifted":
      if (sketchKey === "book_shifted") {
        ctx.translate(size * 0.06, -size * 0.04);
        ctx.rotate(0.08);
      }
      ctx.strokeRect(-size * 0.4, -size * 0.3, size * 0.8, size * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.3);
      ctx.lineTo(0, size * 0.3);
      ctx.stroke();
      break;
    default:
      ctx.fillStyle = CURSOR_AI.ink;
      ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(sketchKey.charAt(0).toUpperCase(), 0, size * 0.3);
      break;
  }
  ctx.restore();
  ctx.textAlign = "left";
}

// ---------------------------------------------------------------------
// Hit-testing helpers exported for the session
// ---------------------------------------------------------------------
export interface SpotRowHit {
  readonly spotId: string;
}

export function spotRowAt(
  scene: TamperScene,
  x: number,
  y: number,
): SpotRowHit | null {
  const L = TAMPER_LAYOUT;
  const origHeaderY = L.diffY + 32;
  const tonightHeaderY = origHeaderY + 6 + scene.spots.length * L.rowH + 12;
  for (let i = 0; i < scene.spots.length; i++) {
    const spot = scene.spots[i] as TamperSpot;
    const ty = tonightHeaderY + 6 + i * L.rowH;
    const r: Rect = { x: L.diffX + 12, y: ty, w: L.diffW - 24, h: L.rowH };
    if (inRect(x, y, r)) return { spotId: spot.id };
  }
  return null;
}

export { spotById };
