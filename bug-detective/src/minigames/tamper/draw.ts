/**
 * Canvas rendering for "Bugbot review" — Spot the Tampering rendered as a
 * Cursor IDE side-panel: a stacked ORIGINAL/TONIGHT diff card on the left,
 * a Bugbot chat bubble + Approve/Reject/Suggest-fix buttons on the right.
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
export function spotRowRect(_spot: TamperSpot, half: "original" | "tonight"): Rect {
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
    call.bugbotClaim === "tampered" ? BUGBOT_QUIPS_TAMPERED : BUGBOT_QUIPS_CLEAN;
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
    drawSpotRow(ctx, spot, L.diffX + 12, oy, L.diffW - 24, L.rowH, false, false);
    const isHighlighted = pointAtSpotId === spot.id;
    const isReveal = showRealTamper && spot.tampered;
    drawSpotRow(
      ctx,
      spot,
      L.diffX + 12,
      ty,
      L.diffW - 24,
      L.rowH,
      isHighlighted,
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
  highlighted: boolean,
  revealRealTamper: boolean,
): void {
  ctx.save();
  if (highlighted) {
    ctx.fillStyle = CURSOR_AI.accentMute;
    ctx.fillRect(x, y, w, h);
  }
  if (revealRealTamper) {
    ctx.fillStyle = CURSOR_AI.greenMute;
    ctx.fillRect(x, y, w, h);
  }
  drawPropSketch(ctx, spot.label, x + 12, y + h / 2, 8);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(spot.label, x + 28, y + h / 2 + 1);
  if (highlighted) {
    ctx.fillStyle = CURSOR_AI.accent;
    ctx.font = "700 9px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText("← bugbot", x + w - 4, y + h / 2 + 1);
  } else if (revealRealTamper) {
    ctx.fillStyle = CURSOR_AI.green;
    ctx.font = "700 9px 'Cursor Mono', ui-monospace, monospace";
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

export function drawChatCard(
  ctx: CanvasRenderingContext2D,
  call: TamperCall | null,
  hover: "approve" | "reject" | "suggestFix" | null,
  secondsLeft01: number,
  pickingSpot: boolean,
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

  // Claim line
  if (call) {
    const claim = call.bugbotClaim === "tampered" ? "Looks tampered." : "Looks clean.";
    const target = "code line";
    void target;
    ctx.fillStyle = CURSOR_AI.ink;
    ctx.font = "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(claim, L.chatX + 14, L.chatY + 60);
    // Quip
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 11px 'Cursor Gothic', sans-serif";
    wrapAndDraw(ctx, `“${bugbotQuip(call)}”`, L.chatX + 14, L.chatY + 80, L.chatW - 28, 14);
    // Confidence
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(`confidence ${call.bugbotConfidencePct}%`, L.chatX + 14, L.chatY + 122);
  }

  // Buttons stacked
  const bx = L.chatX + 14;
  const bw = L.chatW - 28;
  const bh = 30;
  const approveY = L.chatY + 134;
  const rejectY = approveY + bh + 8;
  const suggestY = rejectY + bh + 8;
  const approve: Rect = { x: bx, y: approveY, w: bw, h: bh };
  const reject: Rect = { x: bx, y: rejectY, w: bw, h: bh };
  const suggestFix: Rect = { x: bx, y: suggestY, w: bw, h: bh };
  const claimWasTampered = call?.bugbotClaim === "tampered";
  drawAiButton(ctx, approve, claimWasTampered ? "Approve fix" : "Approve", {
    tone: "approve",
    leading: "✓",
    hovered: hover === "approve",
  });
  drawAiButton(ctx, reject, claimWasTampered ? "Reject fix" : "Reject", {
    tone: "reject",
    leading: "✗",
    hovered: hover === "reject",
  });
  drawAiButton(ctx, suggestFix, pickingSpot ? "Pick a row…" : "Suggest fix", {
    tone: "ghost",
    leading: "→",
    hovered: hover === "suggestFix",
    disabled: pickingSpot,
  });

  // Slim timer line at the very bottom of the card
  drawAiProgressLine(
    ctx,
    L.chatX + 14,
    L.chatY + L.chatH - 14,
    L.chatW - 28,
    secondsLeft01,
    { tone: pickingSpot ? "alert" : "default" },
  );
  return { approve, reject, suggestFix };
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
  ctx.fillText("Bugbot review", x + 60, y + 32);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(`scene · ${scene.displayName}`, x + 60, y + 50);
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText("Bugbot reviews 6 calls. Read the confidence, then trust yourself.", x + 24, y + 82);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.fillText(
    "Approve or Reject fast. Suggest fix only when you're ready to point at the lie.",
    x + 24,
    y + 100,
  );
  drawAiProgressLine(ctx, x + 24, y + h - 22, w - 48, progress01);
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
export function drawTamperTutorialDiagram(
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
  ctx.fillText("Bugbot →", x + 28, cy);
  drawAiButton(
    ctx,
    { x: x + 86, y: cy - 14, w: 60, h: 24 },
    "Approve",
    { tone: "approve", leading: "✓" },
  );
  drawAiButton(
    ctx,
    { x: x + 152, y: cy - 14, w: 60, h: 24 },
    "Reject",
    { tone: "reject", leading: "✗" },
  );
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------------------------------------------------------------------
// Prop sketch library (re-used from the previous draw module)
// ---------------------------------------------------------------------
function drawPropSketch(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = CURSOR_AI.ink;
  ctx.fillStyle = CURSOR_AI.ink;
  switch (label) {
    case "stamp":
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.fillStyle = CURSOR_AI.accent;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "photo":
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.beginPath();
      ctx.arc(-size * 0.2, -size * 0.1, size * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.3);
      ctx.lineTo(0, -size * 0.05);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.stroke();
      break;
    case "pen":
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, -size * 0.4);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.stroke();
      ctx.fillRect(size * 0.35, size * 0.18, size * 0.18, size * 0.18);
      break;
    case "paperclip":
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.4);
      ctx.lineTo(-size * 0.3, size * 0.3);
      ctx.quadraticCurveTo(-size * 0.05, size * 0.55, size * 0.2, size * 0.3);
      ctx.lineTo(size * 0.2, -size * 0.2);
      ctx.quadraticCurveTo(size * 0.05, -size * 0.45, -size * 0.1, -size * 0.2);
      ctx.lineTo(-size * 0.1, size * 0.1);
      ctx.stroke();
      break;
    case "signature":
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
      break;
    case "vial":
      ctx.beginPath();
      ctx.moveTo(-size * 0.25, -size * 0.5);
      ctx.lineTo(-size * 0.25, size * 0.3);
      ctx.quadraticCurveTo(0, size * 0.55, size * 0.25, size * 0.3);
      ctx.lineTo(size * 0.25, -size * 0.5);
      ctx.stroke();
      ctx.fillStyle = CURSOR_AI.green;
      ctx.fillRect(-size * 0.22, 0, size * 0.44, size * 0.3);
      break;
    case "tag":
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, -size * 0.3);
      ctx.lineTo(size * 0.2, -size * 0.3);
      ctx.lineTo(size * 0.5, 0);
      ctx.lineTo(size * 0.2, size * 0.3);
      ctx.lineTo(-size * 0.4, size * 0.3);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size * 0.18, 0, size * 0.06, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "key":
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
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, size * 0.3);
      ctx.lineTo(-size * 0.4, -size * 0.3);
      ctx.quadraticCurveTo(-size * 0.4, -size * 0.55, 0, -size * 0.45);
      ctx.lineTo(size * 0.5, -size * 0.05);
      ctx.lineTo(size * 0.5, size * 0.3);
      ctx.closePath();
      ctx.stroke();
      break;
    case "ledger":
      ctx.strokeRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(-size * 0.3, -size * 0.4 + i * size * 0.2);
        ctx.lineTo(size * 0.3, -size * 0.4 + i * size * 0.2);
      }
      ctx.stroke();
      break;
    case "shade":
    case "lampshade":
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, size * 0.4);
      ctx.lineTo(-size * 0.3, -size * 0.4);
      ctx.lineTo(size * 0.3, -size * 0.4);
      ctx.lineTo(size * 0.5, size * 0.4);
      ctx.closePath();
      ctx.stroke();
      break;
    case "switch":
      ctx.strokeRect(-size * 0.3, -size * 0.4, size * 0.6, size * 0.8);
      ctx.fillStyle = CURSOR_AI.ink;
      ctx.fillRect(-size * 0.18, -size * 0.05, size * 0.36, size * 0.18);
      break;
    case "wire":
      ctx.beginPath();
      ctx.moveTo(-size * 0.5, -size * 0.3);
      for (let i = 0; i <= 4; i++) {
        const xx = -size * 0.5 + (i * size) / 4;
        const yy = i % 2 === 0 ? -size * 0.3 : size * 0.3;
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      break;
    case "shadow":
      ctx.fillStyle = "rgba(20,18,11,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, size * 0.1, size * 0.55, size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "book":
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
      ctx.fillText(label.charAt(0).toUpperCase(), 0, size * 0.3);
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
