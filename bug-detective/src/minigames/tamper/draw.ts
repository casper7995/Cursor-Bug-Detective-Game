/** Canvas rendering for Spot the Tampering. Pure draw helpers. */

import { CURSOR } from "../../ui/cursorTheme";
import type { TamperCall, TamperScene, TamperSpot } from "./types";
import { spotById } from "./round";

const PANEL_W = 222;
const PANEL_H = 180;
const PANEL_Y = 70;
const PANEL_GAP = 18;
/** ORIGINAL panel x; TONIGHT panel x is `originalPanelX + PANEL_W + PANEL_GAP`. */
export const ORIGINAL_PANEL_X = 24;
export const TONIGHT_PANEL_X = ORIGINAL_PANEL_X + PANEL_W + PANEL_GAP;
export const PANEL_TOP_Y = PANEL_Y;
export const PANEL_BOX = { w: PANEL_W, h: PANEL_H } as const;

/** Map a spot's panel-local coords into TONIGHT-panel canvas coords. */
export function spotCanvasXY(spot: TamperSpot): { x: number; y: number } {
  return { x: TONIGHT_PANEL_X + spot.x, y: PANEL_Y + spot.y };
}

export function originalSpotCanvasXY(spot: TamperSpot): {
  x: number;
  y: number;
} {
  return { x: ORIGINAL_PANEL_X + spot.x, y: PANEL_Y + spot.y };
}

export function drawTamperFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: TamperScene,
  call: TamperCall | null,
  showRealTamper: boolean,
): void {
  // Background
  ctx.fillStyle = CURSOR.bgTop;
  ctx.fillRect(0, 0, W, H);

  // Title strip — top-left, kept above the panels.
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "600 12px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`TAMPERING · ${scene.displayName}`, 28, 28);

  drawPanel(
    ctx,
    ORIGINAL_PANEL_X,
    PANEL_Y,
    "ORIGINAL",
    scene,
    /*tonight*/ false,
    null,
    false,
  );
  drawPanel(
    ctx,
    TONIGHT_PANEL_X,
    PANEL_Y,
    "TONIGHT",
    scene,
    /*tonight*/ true,
    call?.bugbotPointsAtSpotId ?? null,
    showRealTamper,
  );
}

function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  scene: TamperScene,
  tonight: boolean,
  highlightSpotId: string | null,
  showRealTamper: boolean,
): void {
  ctx.save();
  // Frame
  ctx.fillStyle = CURSOR.warmCream;
  ctx.strokeStyle = "rgba(245,78,0,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, PANEL_W, PANEL_H, 6);
  ctx.fill();
  ctx.stroke();

  // Label tab
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "600 10px 'Cursor Gothic', sans-serif";
  ctx.fillText(label, x + 8, y - 4);

  // Faint scene "photo" — desk tones
  const grad = ctx.createLinearGradient(x, y, x, y + PANEL_H);
  grad.addColorStop(0, "rgba(192,133,50,0.18)");
  grad.addColorStop(1, "rgba(20,18,11,0.22)");
  ctx.fillStyle = grad;
  ctx.fillRect(x + 6, y + 6, PANEL_W - 12, PANEL_H - 12);

  // Desk surface (brown stripe)
  ctx.fillStyle = "rgba(101,73,42,0.55)";
  ctx.fillRect(x + 6, y + PANEL_H - 36, PANEL_W - 12, 30);

  // Each candidate spot rendered as a soft chip with a tiny prop sketch.
  for (const spot of scene.spots) {
    const cx = x + spot.x;
    const cy = y + spot.y;
    const isTampered = tonight && spot.tampered;
    const fill = isTampered ? "rgba(245,78,0,0.18)" : "rgba(80,80,80,0.22)";
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, spot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,18,11,0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    drawPropSketch(ctx, spot.label, cx, cy, Math.min(spot.r - 4, 18));
    // Tiny caption below
    ctx.fillStyle = "rgba(20,18,11,0.55)";
    ctx.font = "8px 'Cursor Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(spot.label, cx, cy + spot.r + 8);
  }

  // Bugbot pointer ring on TONIGHT panel
  if (tonight && highlightSpotId) {
    const target = spotById(scene, highlightSpotId);
    if (target) {
      const cx = x + target.x;
      const cy = y + target.y;
      ctx.strokeStyle = CURSOR.orange;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, target.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, target.r + 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // After-the-fact reveal of the real tamper after a wrong call.
  if (showRealTamper && tonight) {
    const target = scene.spots.find((s) => s.tampered);
    if (target) {
      const cx = x + target.x;
      const cy = y + target.y;
      ctx.strokeStyle = "rgba(80,180,80,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, target.r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export interface BugbotBubblePos {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Snarky one-liners cycled deterministically off the call index. */
const BUGBOT_QUIPS_TAMPERED: readonly string[] = [
  "Suspect! 100% suspect.",
  "I knew it. I always know.",
  "This is the one. Trust me.",
  "Smells fishy. Like, code-smell fishy.",
  "Tampered. Pretty sure. Mostly sure.",
  "Don't touch — it might bite.",
];
const BUGBOT_QUIPS_CLEAN: readonly string[] = [
  "Looks clean. Boring, even.",
  "Nothing here. Move along.",
  "I checked. It's fine. Probably.",
  "Spotless. Suspiciously spotless?",
  "Just vibes. Good ones.",
  "All good. Reviewed and approved.",
];

function bugbotQuip(call: TamperCall): string {
  const pool =
    call.bugbotClaim === "tampered" ? BUGBOT_QUIPS_TAMPERED : BUGBOT_QUIPS_CLEAN;
  const idx = (call.callIndex * 7919 + call.bugbotConfidencePct * 17) % pool.length;
  return pool[idx] as string;
}

export function drawBugbotBubble(
  ctx: CanvasRenderingContext2D,
  W: number,
  call: TamperCall,
  scene: TamperScene,
): BugbotBubblePos {
  const target = spotById(scene, call.bugbotPointsAtSpotId);
  const claim = call.bugbotClaim === "tampered" ? "TAMPERED" : "CLEAN";
  const quip = bugbotQuip(call);
  const text = `Bugbot: ${claim}`;
  const conf = `“${quip}” · ${call.bugbotConfidencePct}%`;
  const w = 248;
  const h = 50;
  const baseX = TONIGHT_PANEL_X + (target ? target.x : 96) - w / 2;
  const baseY = PANEL_Y - h - 6;
  const x = Math.max(8, Math.min(W - w - 8, baseX));
  const y = Math.max(6, baseY);
  ctx.fillStyle = "rgba(20,18,11,0.92)";
  ctx.strokeStyle = CURSOR.orange;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  // Cursor-mascot avatar tile inside the bubble
  ctx.fillStyle = "rgba(247,247,244,0.95)";
  ctx.fillRect(x + 8, y + 8, 26, 26);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 14);
  ctx.lineTo(x + 30, y + 14);
  ctx.lineTo(x + 22, y + 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "700 12px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(text, x + 42, y + 20);
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "10px 'Cursor Mono', monospace";
  ctx.fillText(conf, x + 42, y + 38);

  // Pointer triangle to target
  if (target) {
    const tx = TONIGHT_PANEL_X + target.x;
    const ty = PANEL_Y + target.y - target.r;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h);
    ctx.lineTo(x + w / 2 - 6, y + h + 6);
    ctx.lineTo(x + w / 2 + 6, y + h + 6);
    ctx.closePath();
    ctx.fillStyle = "rgba(20,18,11,0.92)";
    ctx.fill();
    ctx.strokeStyle = CURSOR.orange;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h + 6);
    ctx.lineTo(tx, ty - 4);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  return { x, y, w, h };
}

export interface ButtonRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly label: string;
}

export function getAgreeDisagreeButtons(W: number, H: number): {
  agree: ButtonRect;
  disagree: ButtonRect;
} {
  const bw = 120;
  const bh = 36;
  const y = H - bh - 14;
  const totalW = bw * 2 + 18;
  const x0 = (W - totalW) / 2;
  return {
    agree: { x: x0, y, w: bw, h: bh, label: "Agree" },
    disagree: { x: x0 + bw + 18, y, w: bw, h: bh, label: "Disagree" },
  };
}

export function drawAgreeDisagreeButtons(
  ctx: CanvasRenderingContext2D,
  rects: { agree: ButtonRect; disagree: ButtonRect },
  hoverAgree: boolean,
  hoverDisagree: boolean,
  secondsLeft01: number,
): void {
  drawButton(ctx, rects.agree, hoverAgree, "rgba(80,180,80,0.95)");
  drawButton(ctx, rects.disagree, hoverDisagree, CURSOR.orange);
  // Timer bar across the bottom
  const totalW =
    rects.disagree.x + rects.disagree.w - rects.agree.x;
  const barX = rects.agree.x;
  const barY = rects.agree.y + rects.agree.h + 6;
  const barH = 4;
  ctx.fillStyle = "rgba(20,18,11,0.5)";
  ctx.fillRect(barX, barY, totalW, barH);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillRect(barX, barY, totalW * Math.max(0, Math.min(1, secondsLeft01)), barH);
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  r: ButtonRect,
  hover: boolean,
  accent: string,
): void {
  ctx.fillStyle = hover ? accent : "rgba(20,18,11,0.85)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = hover ? "#fff" : CURSOR.textHi;
  ctx.font = "600 14px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(r.label, r.x + r.w / 2, r.y + 23);
  ctx.textAlign = "left";
}

export function drawDisagreePointPrompt(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  secondsLeft01: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(245,78,0,0.85)";
  const w = 320;
  const h = 30;
  const x = (W - w) / 2;
  const y = H - 70;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "600 12px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Then where IS the tampering? Tap the spot on TONIGHT.",
    x + w / 2,
    y + 19,
  );
  // Timer dots
  const dotY = y + h + 8;
  const dotCount = 12;
  const fillCount = Math.round(dotCount * Math.max(0, Math.min(1, secondsLeft01)));
  for (let i = 0; i < dotCount; i++) {
    ctx.fillStyle = i < fillCount ? CURSOR.orange : "rgba(245,240,232,0.3)";
    ctx.beginPath();
    ctx.arc(x + 14 + i * ((w - 28) / (dotCount - 1)), dotY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: TamperScene,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.92)";
  ctx.fillRect(0, 0, W, H);
  const w = 360;
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
  ctx.fillText("TAMPERING — agree or disagree with Bugbot", x + w / 2, y + 28);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(`Scene: ${scene.displayName}`, x + w / 2, y + 50);
  ctx.fillStyle = CURSOR.text;
  ctx.font = "11px sans-serif";
  ctx.fillText(
    "Bugbot points at one spot per call. Sometimes it lies.",
    x + w / 2,
    y + 70,
  );
  ctx.fillText(
    "Agree, disagree — or disagree and tap the real tampering.",
    x + w / 2,
    y + 86,
  );
  // Progress bar
  const barW = w - 40;
  const barX = x + 20;
  const barY = y + h - 24;
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.fillRect(barX, barY, barW, 4);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillRect(barX, barY, barW * Math.min(1, Math.max(0, progress01)), 4);
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawResultCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  result: { score: number; rightCalls: number; caughtLies: number },
  total: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.94)";
  ctx.fillRect(0, 0, W, H);
  const w = 360;
  const h = 170;
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
  ctx.fillText("CASE NOTES — TAMPERING", x + w / 2, y + 28);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "700 36px 'Cursor Mono', monospace";
  ctx.fillText(String(result.score), x + w / 2, y + 76);
  ctx.fillStyle = CURSOR.text;
  ctx.font = "11px 'Cursor Gothic', sans-serif";
  ctx.fillText(`accuracy ${result.rightCalls}/${total}`, x + w / 2, y + 100);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillText(`caught lying ${result.caughtLies}`, x + w / 2, y + 118);
  ctx.fillStyle = "rgba(247,247,244,0.7)";
  ctx.font = "10px sans-serif";
  ctx.fillText("click to close", x + w / 2, y + h - 14);
  ctx.restore();
  ctx.textAlign = "left";
}

/** Tiny vector glyph for each known prop-name; renders inside a spot chip. */
function drawPropSketch(
  ctx: CanvasRenderingContext2D,
  label: string,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = CURSOR.ink;
  ctx.fillStyle = CURSOR.ink;
  switch (label) {
    case "stamp":
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.fillStyle = "rgba(245,78,0,0.9)";
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
      ctx.fillStyle = "rgba(80,180,80,0.75)";
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
        ctx.moveTo(-size * 0.3, -size * 0.4 + (i * size * 0.2));
        ctx.lineTo(size * 0.3, -size * 0.4 + (i * size * 0.2));
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
      ctx.fillStyle = CURSOR.ink;
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
      ctx.fillStyle = CURSOR.ink;
      ctx.font = "600 11px 'Cursor Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label.charAt(0).toUpperCase(), 0, size * 0.3);
      break;
  }
  ctx.restore();
  ctx.textAlign = "left";
}

/** Tutorial diagram for the gate — a tiny scene with one circled spot. */
export function drawTamperTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = y + h / 2;
  ctx.fillStyle = "rgba(192,133,50,0.3)";
  ctx.fillRect(x, cy - 14, 56, 28);
  ctx.strokeStyle = CURSOR.gold;
  ctx.strokeRect(x, cy - 14, 56, 28);
  ctx.fillStyle = "rgba(192,133,50,0.3)";
  ctx.fillRect(x + 70, cy - 14, 56, 28);
  ctx.strokeStyle = CURSOR.orange;
  ctx.strokeRect(x + 70, cy - 14, 56, 28);
  ctx.strokeStyle = CURSOR.orange;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 92, cy + 2, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "10px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("AGREE / DISAGREE", x + 138, cy + 4);
  ctx.restore();
}
