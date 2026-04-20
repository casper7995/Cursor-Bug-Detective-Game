/**
 * Fullscreen-ish rect for desk mini-games (24px margin; diorama visible behind scrim).
 */

import { RUNNER_DRAW } from "../runner/sim";

export const DESK_MARGIN = 24;

/** Dark overlay behind the mini-game card. */
export const DESK_SCRIM = "rgba(6,5,4,0.86)";

export interface DeskFullRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function getDeskFullRect(cssW: number, cssH: number): DeskFullRect {
  const m = DESK_MARGIN;
  return {
    x: m,
    y: m,
    w: Math.max(120, cssW - m * 2),
    h: Math.max(120, cssH - m * 2),
  };
}

const W = RUNNER_DRAW.canvasW;
const H = RUNNER_DRAW.canvasH;

/** Hit target for the [X] close control in internal canvas space (512×320). */
export function getDeskCloseButtonRect(): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return { x: W - 44, y: 10, w: 34, h: 26 };
}

export function hitDeskCloseButton(gameX: number, gameY: number): boolean {
  const r = getDeskCloseButtonRect();
  return (
    gameX >= r.x && gameX <= r.x + r.w && gameY >= r.y && gameY <= r.y + r.h
  );
}

/**
 * Paint the standard desk-mini chrome (help [?] + close [✕] buttons) using a
 * font that's guaranteed to have both glyphs across browsers. Each session
 * still owns its own background; this only stamps the two top-right pills.
 */
export function drawDeskChrome(ctx: CanvasRenderingContext2D): void {
  const hb = { x: W - 82, y: 10, w: 30, h: 26 };
  const cb = getDeskCloseButtonRect();
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(245,78,0,0.6)";
  ctx.fillStyle = "rgba(20,18,11,0.72)";
  ctx.beginPath();
  ctx.roundRect(hb.x, hb.y, hb.w, hb.h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(cb.x, cb.y, cb.w, cb.h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f7f7f4";
  ctx.font = "700 14px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", hb.x + hb.w / 2, hb.y + hb.h / 2 + 1);
  // Use ASCII × instead of U+2715 — wider font coverage, renders reliably.
  ctx.fillText("\u00d7", cb.x + cb.w / 2, cb.y + cb.h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Map pointer to internal mini-game canvas coordinates. */
export function clientToDeskGame(
  clientX: number,
  clientY: number,
  overlayCtx: CanvasRenderingContext2D,
  getOverlayViewport: () => { cssW: number; cssH: number },
): { x: number; y: number } {
  const { cssW, cssH } = getOverlayViewport();
  const pr = getDeskFullRect(cssW, cssH);
  const scale = Math.min(pr.w / W, pr.h / H);
  const dw = W * scale;
  const dh = H * scale;
  const dx = pr.x + (pr.w - dw) / 2;
  const dy = pr.y + (pr.h - dh) / 2;
  const canvas = overlayCtx.canvas.getBoundingClientRect();
  const lx = clientX - canvas.left;
  const ly = clientY - canvas.top;
  return { x: ((lx - dx) / dw) * W, y: ((ly - dy) / dh) * H };
}
