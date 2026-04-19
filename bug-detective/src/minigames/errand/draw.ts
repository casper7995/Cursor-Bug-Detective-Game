/** Errand Race canvas drawing helpers. */

import { CURSOR } from "../../ui/cursorTheme";
import type { Drawer, Helper, HintIcon } from "./types";

/** Layout constants in 512×320 game canvas space. */
export const ERRAND_LAYOUT = {
  drawerY: 90,
  drawerW: 84,
  drawerH: 110,
  drawerGap: 10,
  drawerXStart: 20,
  helperRowY: 250,
  helperW: 56,
  helperH: 48,
  helperGap: 16,
} as const;

export function drawerRect(idx: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const L = ERRAND_LAYOUT;
  return {
    x: L.drawerXStart + idx * (L.drawerW + L.drawerGap),
    y: L.drawerY,
    w: L.drawerW,
    h: L.drawerH,
  };
}

export function helperHomeRect(idx: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const L = ERRAND_LAYOUT;
  // Center the 3 helpers across the bottom row.
  const total = 3 * L.helperW + 2 * L.helperGap;
  const x0 = (512 - total) / 2;
  return {
    x: x0 + idx * (L.helperW + L.helperGap),
    y: L.helperRowY,
    w: L.helperW,
    h: L.helperH,
  };
}

export function drawHintIcon(
  ctx: CanvasRenderingContext2D,
  hint: HintIcon,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CURSOR.gold;
  ctx.fillStyle = CURSOR.warmCream;
  switch (hint) {
    case "cup": {
      ctx.beginPath();
      ctx.moveTo(-size / 2, -size / 4);
      ctx.lineTo(size / 2, -size / 4);
      ctx.lineTo(size / 3, size / 2);
      ctx.lineTo(-size / 3, size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Handle
      ctx.beginPath();
      ctx.arc(size / 2 + 4, 0, 6, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    }
    case "feather": {
      ctx.beginPath();
      ctx.moveTo(-size / 3, size / 2);
      ctx.lineTo(size / 3, -size / 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const ax = -size / 3 + (size * 2 / 3) * t;
        const ay = size / 2 - size * t;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 8, ay - 6);
      }
      ctx.stroke();
      break;
    }
    case "key": {
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
    }
    case "question": {
      ctx.fillStyle = CURSOR.gold;
      ctx.font = `700 ${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("?", 0, size / 3);
      break;
    }
    case "warn": {
      ctx.fillStyle = "rgba(245,78,0,0.85)";
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${size * 0.6}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("!", 0, size / 4);
      break;
    }
    default: {
      const _: never = hint;
      void _;
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawDrawerRow(
  ctx: CanvasRenderingContext2D,
  drawers: readonly Drawer[],
  helpers: readonly Helper[],
): void {
  for (let i = 0; i < drawers.length; i++) {
    const d = drawers[i] as Drawer;
    const r = drawerRect(i);
    // Drawer body
    ctx.fillStyle = "rgba(20,18,11,0.45)";
    ctx.strokeStyle = "rgba(245,78,0,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.stroke();

    // Drawer handle
    ctx.strokeStyle = CURSOR.gold;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.3, r.y + r.h - 18);
    ctx.lineTo(r.x + r.w * 0.7, r.y + r.h - 18);
    ctx.stroke();

    // Hint icon
    drawHintIcon(ctx, d.hint, r.x + r.w / 2, r.y + 32, 22);

    // Drawer index number for accessibility
    ctx.fillStyle = "rgba(247,247,244,0.6)";
    ctx.font = "10px 'Cursor Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`#${i + 1}`, r.x + 6, r.y + 12);

    // Progress bar for any helper assigned here
    const helper = helpers.find((h) => h.drawerAssigned === d.index);
    if (helper) {
      const barX = r.x + 8;
      const barW = r.w - 16;
      const barY = r.y + r.h - 30;
      ctx.fillStyle = "rgba(20,18,11,0.6)";
      ctx.fillRect(barX, barY, barW, 6);
      const frac = Math.max(0, Math.min(1, helper.fillProgress));
      ctx.fillStyle =
        helper.state === "alert" ? CURSOR.orange : "rgba(80,180,80,0.9)";
      ctx.fillRect(barX, barY, barW * frac, 6);
      // Helper marker
      ctx.fillStyle = CURSOR.textHi;
      ctx.font = "9px 'Cursor Mono', monospace";
      ctx.fillText(`H${helper.index + 1}`, barX, barY - 4);
    }
  }
}

export function drawHelperHome(
  ctx: CanvasRenderingContext2D,
  helpers: readonly Helper[],
  pickedIndex: number | null,
  pointerX: number,
  pointerY: number,
): void {
  for (let i = 0; i < helpers.length; i++) {
    const h = helpers[i] as Helper;
    if (h.state !== "waiting") continue;
    const r = helperHomeRect(i);
    drawHelperSprite(
      ctx,
      i === pickedIndex ? pointerX : r.x + r.w / 2,
      i === pickedIndex ? pointerY : r.y + r.h / 2,
      h,
    );
  }
}

export function drawHelperSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  helper: Helper,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  // Round body
  const isLost = helper.state === "lost";
  ctx.fillStyle = isLost ? "rgba(120,120,120,0.6)" : "#1a1812";
  ctx.beginPath();
  ctx.arc(0, 4, 16, 0, Math.PI * 2);
  ctx.fill();
  // Cube head
  ctx.fillStyle = isLost ? "rgba(140,140,140,0.7)" : "rgba(247,247,244,0.95)";
  ctx.fillRect(-12, -16, 24, 18);
  ctx.strokeStyle = CURSOR.orange;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-12, -16, 24, 18);
  // Cursor wedge
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(-6, -10);
  ctx.lineTo(4, -10);
  ctx.lineTo(-1, -2);
  ctx.closePath();
  ctx.fill();
  // Number badge
  ctx.fillStyle = CURSOR.gold;
  ctx.font = "9px 'Cursor Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`H${helper.index + 1}`, 0, 25);
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawAbortModal(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  helperIdx: number,
  secondsLeft01: number,
): { abort: { x: number; y: number; w: number; h: number };
     push: { x: number; y: number; w: number; h: number } } {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.65)";
  ctx.fillRect(0, 0, W, H);
  const w = 320;
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
  ctx.fillStyle = CURSOR.orange;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `H${helperIdx + 1} hit a tripwire — push or abort?`,
    x + w / 2,
    y + 30,
  );
  ctx.fillStyle = CURSOR.text;
  ctx.font = "11px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    "ABORT — return safely, no clue.   PUSH — 50/50 clue or lose helper.",
    x + w / 2,
    y + 50,
  );
  // Buttons
  const bw = 130;
  const bh = 36;
  const by = y + h - bh - 24;
  const abort = { x: x + 18, y: by, w: bw, h: bh };
  const push = { x: x + w - bw - 18, y: by, w: bw, h: bh };
  drawErrandButton(ctx, abort, "ABORT", "rgba(80,180,80,0.95)");
  drawErrandButton(ctx, push, "PUSH", CURSOR.orange);
  // Timer
  const barX = x + 18;
  const barY = y + h - 12;
  const barW = w - 36;
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.fillRect(barX, barY, barW, 4);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillRect(
    barX,
    barY,
    barW * Math.max(0, Math.min(1, secondsLeft01)),
    4,
  );
  ctx.restore();
  ctx.textAlign = "left";
  return { abort, push };
}

function drawErrandButton(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  label: string,
  accent: string,
): void {
  ctx.fillStyle = "rgba(20,18,11,0.92)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = "700 14px 'Cursor Gothic', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, r.x + r.w / 2, r.y + 23);
  ctx.textAlign = "left";
}

export function drawErrandIntro(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress01: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.55)";
  ctx.fillRect(0, 0, W, H);
  const w = 360;
  const h = 110;
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
  ctx.fillText("ERRAND RACE", x + w / 2, y + 30);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "12px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    "Send 3 helpers to 5 drawers. Read the icons.",
    x + w / 2,
    y + 54,
  );
  ctx.fillStyle = CURSOR.text;
  ctx.font = "11px sans-serif";
  ctx.fillText(
    "Trapped drawers ping you mid-fill — abort or push.",
    x + w / 2,
    y + 72,
  );
  ctx.fillStyle = "rgba(245,240,232,0.3)";
  ctx.fillRect(x + 20, y + h - 14, w - 40, 4);
  ctx.fillStyle = CURSOR.gold;
  ctx.fillRect(
    x + 20,
    y + h - 14,
    (w - 40) * Math.min(1, Math.max(0, progress01)),
    4,
  );
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawErrandResult(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  totals: { clues: number; helpersSafe: number; helpersLost: number },
  score: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,7,5,0.78)";
  ctx.fillRect(0, 0, W, H);
  const w = 360;
  const h = 180;
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
  ctx.fillText("ERRAND REPORT", x + w / 2, y + 30);
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "700 36px 'Cursor Mono', monospace";
  ctx.fillText(String(score), x + w / 2, y + 80);
  ctx.fillStyle = CURSOR.text;
  ctx.font = "11px 'Cursor Gothic', sans-serif";
  ctx.fillText(
    `clues ${totals.clues} · safe ${totals.helpersSafe} · lost ${totals.helpersLost}`,
    x + w / 2,
    y + 110,
  );
  ctx.fillStyle = "rgba(247,247,244,0.7)";
  ctx.font = "10px sans-serif";
  ctx.fillText("click to close", x + w / 2, y + h - 14);
  ctx.restore();
  ctx.textAlign = "left";
}

export function drawErrandTutorialDiagram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _w: number,
  h: number,
): void {
  ctx.save();
  const cy = y + h / 2;
  // Helper sprite
  ctx.fillStyle = "#1a1812";
  ctx.beginPath();
  ctx.arc(x + 14, cy, 10, 0, Math.PI * 2);
  ctx.fill();
  // Drawer
  ctx.strokeStyle = CURSOR.orange;
  ctx.strokeRect(x + 100, cy - 14, 32, 28);
  drawHintIcon(ctx, "cup", x + 116, cy, 14);
  // Arrow
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.moveTo(x + 30, cy);
  ctx.lineTo(x + 96, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 96, cy);
  ctx.lineTo(x + 90, cy - 4);
  ctx.moveTo(x + 96, cy);
  ctx.lineTo(x + 90, cy + 4);
  ctx.stroke();
  ctx.fillStyle = CURSOR.textHi;
  ctx.font = "10px 'Cursor Gothic', sans-serif";
  ctx.fillText("DRAG TO ASSIGN", x + 138, cy + 4);
  ctx.restore();
  ctx.textAlign = "left";
}
