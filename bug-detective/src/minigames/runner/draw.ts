import type { CodePlank } from "./sim";
import { PLAYER_SCREEN_X, RUNNER_DRAW } from "./sim";

/** Draw one frame of the code-runner to a 2D canvas (monitor texture). */
export function drawRunnerFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    scroll: number;
    playerY: number;
    planks: readonly CodePlank[];
    modeLabel: string;
    hint: string;
  },
): void {
  const W = RUNNER_DRAW.canvasW;
  const H = RUNNER_DRAW.canvasH;
  const { scroll, playerY, planks, modeLabel, hint } = opts;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1e2a44");
  bg.addColorStop(1, "#0c1018");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Parallax grid
  ctx.strokeStyle = "rgba(120,160,255,0.12)";
  ctx.lineWidth = 1;
  const off = (scroll * 0.15) % 40;
  for (let x = -off; x < W + 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Ground shadow band
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, RUNNER_DRAW.groundY + 6, W, H - RUNNER_DRAW.groundY);

  // Code planks (strings)
  const snippet = "const bug = await find();";
  ctx.font = "13px ui-monospace, monospace";
  for (const p of planks) {
    const sx0 = p.x0 - scroll;
    const sx1 = p.x1 - scroll;
    if (sx1 < -20 || sx0 > W + 20) continue;
    ctx.fillStyle = "#243048";
    ctx.fillRect(sx0, p.yTop, sx1 - sx0, H - p.yTop);
    ctx.strokeStyle = "rgba(160,200,255,0.45)";
    ctx.strokeRect(sx0, p.yTop, sx1 - sx0, H - p.yTop);
    ctx.fillStyle = "#9ec5ff";
    ctx.fillText(snippet, sx0 + 8, p.yTop - 6);
  }

  // Floor line
  ctx.fillStyle = "#2a3448";
  ctx.fillRect(0, RUNNER_DRAW.groundY, W, H - RUNNER_DRAW.groundY);

  // Player: chibi proportions — oversized tilted glass cube head, dominant
  // cursor wedge, small body, loupe held by the handle.
  const px = PLAYER_SCREEN_X;
  const py = playerY;

  // Faceted crystal head, closer to the 3D shell than a simple square box.
  ctx.fillStyle = "rgba(250,253,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 10);
  ctx.lineTo(px + 21, py + 0);
  ctx.lineTo(px + 36, py + 8);
  ctx.lineTo(px + 39, py + 34);
  ctx.lineTo(px + 21, py + 42);
  ctx.lineTo(px + 3, py + 35);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(225,235,248,0.82)";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.stroke();

  // Painted cursor logo inside the cube.
  // The dark shapes form the cursor logo, painted on the diagonal plane.
  // Left part (main pointer)
  ctx.fillStyle = "#0b0e14";
  ctx.beginPath();
  ctx.moveTo(px + 4, py + 16); // Top-left
  ctx.lineTo(px + 21, py + 16); // Top-center (M1)
  ctx.lineTo(px + 20, py + 38); // Bottom-center (FB)
  ctx.closePath();
  ctx.fill();

  // Right part (small wedge)
  ctx.beginPath();
  ctx.moveTo(px + 25, py + 16); // Top-center right (M2)
  ctx.lineTo(px + 36, py + 16); // Top-right
  ctx.lineTo(px + 30, py + 25); // Bottom tip (B2)
  ctx.closePath();
  ctx.fill();

  // Cute face on the front clear panel rather than on the internal slab.
  // Eyes slightly wider and larger
  ctx.fillStyle = "#0a0c10";
  ctx.beginPath();
  ctx.arc(px + 10, py + 30, 2.5, 0, Math.PI * 2);
  ctx.arc(px + 34, py + 30, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile is a smaller arc at the center
  ctx.strokeStyle = "#0a0c10";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px + 22, py + 34, 4, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Split body: one continuous rounded shape, colored left clear, right dark.
  const bw = 22;
  const bh = 16;
  const bx = px + 9;
  const by = py + 40;

  // Left half (clear)
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw / 2, bh);
  ctx.clip();
  ctx.fillStyle = "rgba(232,239,255,0.3)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.restore();

  // Right half (dark)
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx + bw / 2, by, bw / 2, bh);
  ctx.clip();
  ctx.fillStyle = "#151922";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 8);
  ctx.fill();
  ctx.restore();

  // Chunkier arms mirror the torso split.
  ctx.fillStyle = "rgba(232,239,255,0.3)";
  ctx.beginPath();
  ctx.roundRect(px + 3, py + 44, 8, 12, 4);
  ctx.fill();
  ctx.fillStyle = "#151922";
  ctx.beginPath();
  ctx.roundRect(px + 29, py + 44, 8, 12, 4);
  ctx.fill();

  // Hands (both white)
  ctx.fillStyle = "#f1f3f7";
  ctx.beginPath();
  ctx.arc(px + 7, py + 57, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + 33, py + 57, 4, 0, Math.PI * 2);
  ctx.fill();

  // Chunkier legs: left lighter/clear, right dark.
  ctx.fillStyle = "rgba(232,239,255,0.28)";
  ctx.beginPath();
  ctx.roundRect(px + 9, py + 54, 10, 11, 4);
  ctx.fill();
  ctx.fillStyle = "#151922";
  ctx.beginPath();
  ctx.roundRect(px + 21, py + 54, 10, 11, 4);
  ctx.fill();
  // Light soles.
  ctx.fillStyle = "#c8d4e8";
  ctx.fillRect(px + 9, py + 64, 10, 2);
  ctx.fillRect(px + 21, py + 64, 10, 2);

  // Magnifier — held by the handle at the left hand.
  ctx.strokeStyle = "#1a1d24";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 3, py + 50, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 7, py + 53);
  ctx.lineTo(px + 11, py + 47);
  ctx.stroke();

  // HUD strip
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, W, 36);
  ctx.fillStyle = "#e8efff";
  ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(modeLabel, 12, 23);
  ctx.fillStyle = "#9fb8e6";
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(hint, W - 12 - ctx.measureText(hint).width, 22);
}
