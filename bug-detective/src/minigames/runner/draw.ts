import type { AnomalyId } from "../../scene/anomalies";
import { clipToRect, wrapLines } from "../desk/aiCard";
import type { CodePlank } from "./sim";
import {
  endlessTierFromMaxClimbM,
  PLAYER_SCREEN_X,
  PLANK_LIFE_MS,
  pristineLifeMsForTier,
  RUNNER_DRAW,
  RUNNER_PROJECTILE_H,
  type RunnerProjectile,
} from "./sim";
import { snippetTextForPlankId, SNIPPET_MONO_FONT } from "./snippets";
import type { RunnerMode } from "./types";
import type { RunnerClueSet } from "./clueTokens";
import {
  activeTokensForHeight,
  matchTokenAt,
  plankHasClueToken,
} from "./clueTokens";

/** Cursor-inspired runner theme (warm dark + orange/gold). */
const CURSOR_BG_TOP = "#1a1812";
const CURSOR_BG_BOT = "#0a0907";
const CURSOR_GRID = "rgba(245,78,0,0.06)";
const CURSOR_TEXT = "#edecec";
const CURSOR_TEXT_HI = "#f7f7f4";
const CURSOR_ORANGE = "#f54e00";
const CURSOR_GOLD = "#c08532";
const CURSOR_BLACK = "#14120b";
const HUD_BAR = "rgba(20,18,11,0.94)";
const FONT_MONO = SNIPPET_MONO_FONT;
const FONT_MONO_HI =
  "600 13px 'Cursor Mono', 'Berkeley Mono', ui-monospace, monospace";
const FONT_MODE =
  "600 14px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
const FONT_HUD_SM =
  "12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
const FONT_CLUE_CHIP = "600 11px 'Berkeley Mono', ui-monospace, monospace";
/** Cap line at yTop; text baseline one em down so feet (yTop) sit on top of glyphs. */
const SNIPPET_BASELINE_OFFSET = 10;
/** Top HUD bar height; clue strip sits directly under it (same y offset). */
const RUNNER_HUD_TOP_PX = 36;
const CLUE_STRIP_H = 22;

export interface DrawRunnerOpts {
  scroll: number;
  playerY: number;
  playerVy?: number;
  planks: readonly CodePlank[];
  modeLabel: string;
  grounded: boolean;
  elapsedMs: number;
  maxClimbM: number;
  boost01: number;
  /** True while the player is actively burning boost — triggers speed-line FX. */
  boostActive?: boolean;
  clueSet: RunnerClueSet;
  anomalyId: AnomalyId;
  clueTooltipHint: string;
  onClueTokenSeen?: (token: string) => void;
  /** ms since a new 100m tier — ribbon fades over 1.2s (endless ramp). */
  tierRibbon?: { tier: number; ageMs: number };
  /** Endless gap hazards (error codes). */
  projectiles?: readonly RunnerProjectile[];
  /** Daily distance goal met; stay on monitor until Esc or retry. */
  dailyCleared?: boolean;
  /** Daily: world scroll distance for the finish line (HUD goal %). */
  dailyGoalScroll?: number;
  gameOver?: {
    peakHeightM: number;
    cluesSeen: readonly string[];
    mode: RunnerMode;
    /** ms since void fail — tumble/shake; card after 280ms. */
    failureAnimMs?: number;
  };
}

type Pose = "idle" | "run" | "jump";

function pickPose(scroll: number, grounded: boolean): Pose {
  if (!grounded) return "jump";
  if (scroll === 0) return "idle";
  return "run";
}

/**
 * Chibi 3/4-view Cursor mascot — big glass cube head, wedge logo, two eyes,
 * magnifier in front, tiny two-tone body (echoes 3D [mascotMesh.ts]).
 */
function drawChibiThreeQuarterMascot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  pose: Pose,
  runPhase: number,
): void {
  const runAlt = runPhase < 0.5;
  const legKick = pose === "run" ? (runAlt ? 4 : -3) : pose === "jump" ? 8 : 0;
  const armSwing =
    pose === "run" ? (runAlt ? -3 : 3) : pose === "jump" ? -6 : 0;
  const bob =
    pose === "run"
      ? Math.sin(runPhase * Math.PI * 2) * 1.5
      : pose === "jump"
        ? -2
        : 0;
  const hx = px - 4;
  const hy = py + bob;

  // --- Glass cube (3/4): top + front + right faces ---
  ctx.fillStyle = "rgba(252,254,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(hx + 18, hy + 2);
  ctx.lineTo(hx + 40, hy + 10);
  ctx.lineTo(hx + 34, hy + 22);
  ctx.lineTo(hx + 10, hy + 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(247,247,244,0.12)";
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy + 14);
  ctx.lineTo(hx + 34, hy + 22);
  ctx.lineTo(hx + 34, hy + 48);
  ctx.lineTo(hx + 6, hy + 40);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(38,37,30,0.2)";
  ctx.beginPath();
  ctx.moveTo(hx + 34, hy + 22);
  ctx.lineTo(hx + 50, hy + 12);
  ctx.lineTo(hx + 50, hy + 38);
  ctx.lineTo(hx + 34, hy + 48);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(237,236,236,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cursor wedge on front face (~50% of face)
  ctx.fillStyle = CURSOR_BLACK;
  ctx.beginPath();
  ctx.moveTo(hx + 12, hy + 18);
  ctx.lineTo(hx + 30, hy + 22);
  ctx.lineTo(hx + 18, hy + 34);
  ctx.closePath();
  ctx.fill();

  // Two vertical-oval eyes (front-facing)
  ctx.fillStyle = CURSOR_BLACK;
  ctx.beginPath();
  ctx.ellipse(hx + 14, hy + 28, 1.05, 2.9, 0, 0, Math.PI * 2);
  ctx.ellipse(hx + 26, hy + 30, 1.05, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = CURSOR_BLACK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy + 38);
  ctx.quadraticCurveTo(hx + 20, hy + 44, hx + 30, hy + 38);
  ctx.stroke();

  // Tiny two-tone torso
  const bx = hx + 12;
  const by = hy + 48;
  const bw = 18;
  const bh = 12;
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw / 2, bh);
  ctx.clip();
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 5);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx + bw / 2, by, bw / 2, bh);
  ctx.clip();
  ctx.fillStyle = CURSOR_BLACK;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(237,236,236,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);

  // Left arm (white) + magnifier held in front
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.beginPath();
  ctx.roundRect(hx + 2, hy + 50 + armSwing * 0.4, 7, 10, 2);
  ctx.fill();

  const mx = hx - 2;
  const my = hy + 52 + armSwing * 0.35;
  ctx.strokeStyle = CURSOR_BLACK;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(mx, my, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(232,239,255,0.12)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(mx + 6, my + 7);
  ctx.lineTo(mx + 16, hy + 62 + armSwing * 0.25);
  ctx.lineTo(mx + 13, hy + 60 + armSwing * 0.25);
  ctx.closePath();
  ctx.fillStyle = CURSOR_ORANGE;
  ctx.fill();

  const ly = hy + 62 + legKick;
  const ry = hy + 62 - legKick;
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.beginPath();
  ctx.roundRect(hx + 12, ly, 7, 9, 2);
  ctx.fill();
  ctx.fillStyle = CURSOR_BLACK;
  ctx.beginPath();
  ctx.roundRect(hx + 22, ry, 7, 9, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(192,133,50,0.35)";
  ctx.fillRect(hx + 12, ly + 7, 7, 2);
  ctx.fillRect(hx + 22, ry + 7, 7, 2);
}

/**
 * Lays out token chips on the right, then fits the case hint in the center with ellipses.
 */
function drawClueStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  clueSet: RunnerClueSet,
  tooltipHint: string,
  activeTokens: readonly string[],
  hintOverride: string | null,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(22, 20, 16, 0.94)";
  ctx.fillRect(0, RUNNER_HUD_TOP_PX, w, CLUE_STRIP_H);
  ctx.strokeStyle = "rgba(192,133,50,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RUNNER_HUD_TOP_PX + CLUE_STRIP_H);
  ctx.lineTo(w, RUNNER_HUD_TOP_PX + CLUE_STRIP_H);
  ctx.stroke();

  const midY = RUNNER_HUD_TOP_PX + CLUE_STRIP_H / 2;
  const n = Math.min(activeTokens.length, clueSet.tokens.length);
  const pad = 5;
  type Chip = { x: number; w: number; tok: string; col: string };
  const chips: Chip[] = [];
  let rx = w - 10;
  for (let i = n - 1; i >= 0; i--) {
    const tok = activeTokens[i]!;
    const col = clueSet.palette[i % clueSet.palette.length]!;
    ctx.font = FONT_CLUE_CHIP;
    const tw = ctx.measureText(tok).width;
    const chipW = tw + pad * 2;
    const x = rx - chipW;
    if (x < 120) break;
    chips.push({ x, w: chipW, tok, col });
    rx = x - 5;
  }
  const chipBlockLeft = rx;

  ctx.font = FONT_HUD_SM;
  ctx.textBaseline = "middle";
  ctx.fillStyle = CURSOR_GOLD;
  ctx.textAlign = "left";
  ctx.fillText("CLUE", 10, midY);
  const hintX = 48;
  const rawHint = hintOverride ?? tooltipHint;
  ctx.fillStyle = hintOverride ? CURSOR_ORANGE : CURSOR_TEXT_HI;
  const maxHintW = Math.max(80, chipBlockLeft - hintX - 12);
  let shortened = rawHint;
  while (
    shortened.length > 0 &&
    ctx.measureText(`› ${shortened}`).width > maxHintW
  ) {
    shortened = shortened.slice(0, -1);
  }
  const hint =
    shortened.length < rawHint.length ? `› ${shortened}…` : `› ${shortened}`;
  ctx.textAlign = "left";
  ctx.fillText(hint, hintX, midY);

  for (const c of chips) {
    ctx.fillStyle = c.col;
    ctx.beginPath();
    ctx.roundRect(c.x, RUNNER_HUD_TOP_PX + 4, c.w, CLUE_STRIP_H - 8, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(245,78,0,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = CURSOR_TEXT_HI;
    ctx.font = FONT_CLUE_CHIP;
    ctx.textAlign = "left";
    ctx.fillText(c.tok, c.x + pad, midY);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Shadow glow + solid pass — same pattern for full line or single glyph. */
function fillMonoGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baselineY: number,
  shadowBlur: number,
  shadowColor: string,
): void {
  ctx.font = FONT_MONO;
  ctx.fillStyle = CURSOR_TEXT;
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = shadowBlur;
  ctx.fillText(text, x, baselineY);
  ctx.shadowBlur = 0;
  ctx.fillStyle = CURSOR_TEXT;
  ctx.fillText(text, x, baselineY);
}

function drawRunnerProjectiles(
  ctx: CanvasRenderingContext2D,
  scroll: number,
  cameraY: number,
  projectiles: readonly RunnerProjectile[] | undefined,
  viewW: number,
): void {
  if (!projectiles || projectiles.length === 0) return;
  ctx.save();
  ctx.font = "600 10px 'Berkeley Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (const p of projectiles) {
    const sx = p.x - scroll;
    if (sx < -90 || sx > viewW + 50) continue;
    const sy = p.y + cameraY;
    const tw = ctx.measureText(p.text).width + 10;
    const th = RUNNER_PROJECTILE_H + 6;
    ctx.fillStyle = "rgba(20,8,0,0.45)";
    ctx.strokeStyle = "rgba(245,78,0,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(sx, sy - th / 2, tw, th, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CURSOR_GOLD;
    ctx.fillText(p.text, sx + 5, sy);
  }
  ctx.restore();
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  px: number,
  feetY: number,
  grounded: boolean,
): void {
  if (!grounded) return;
  ctx.save();
  ctx.fillStyle = "rgba(20,18,11,0.35)";
  ctx.beginPath();
  ctx.ellipse(px + 22, feetY + 1, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlainSnippetRow(
  ctx: CanvasRenderingContext2D,
  snippet: string,
  sx: number,
  baselineY: number,
): void {
  fillMonoGlowText(ctx, snippet, sx, baselineY, 6, "rgba(245,78,0,0.25)");
}

function drawClueSnippetLine(
  ctx: CanvasRenderingContext2D,
  snippet: string,
  sx: number,
  baselineY: number,
  activeTokens: readonly string[],
  palette: readonly string[],
  onTokenSeen: ((token: string) => void) | undefined,
): void {
  let x = sx;
  let i = 0;
  while (i < snippet.length) {
    const m = matchTokenAt(snippet, i, activeTokens);
    if (m) {
      const col = palette[m.tokenIdx % palette.length]!;
      ctx.font = FONT_MONO;
      const w = ctx.measureText(m.token).width;
      ctx.fillStyle = col;
      ctx.fillRect(x - 1, baselineY - 12, w + 2, 16);
      ctx.strokeStyle = "rgba(245,78,0,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, baselineY - 12, w + 2, 16);
      ctx.font = FONT_MONO_HI;
      ctx.fillStyle = CURSOR_TEXT_HI;
      ctx.fillText(m.token, x, baselineY);
      const canonical = activeTokens[m.tokenIdx];
      if (canonical && onTokenSeen) onTokenSeen(canonical);
      x += w;
      i += m.len;
    } else {
      const ch = snippet[i]!;
      ctx.font = FONT_MONO;
      const w = ctx.measureText(ch).width;
      fillMonoGlowText(ctx, ch, x, baselineY, 4, "rgba(245,78,0,0.15)");
      x += w;
      i += 1;
    }
  }
}

export function drawGameOverCard(
  ctx: CanvasRenderingContext2D,
  opts: {
    w: number;
    h: number;
    peakHeightM: number;
    cluesSeen: readonly string[];
    mode: RunnerMode;
  },
): void {
  const { w, h, peakHeightM, cluesSeen, mode } = opts;
  ctx.save();
  ctx.fillStyle = "rgba(5, 4, 2, 0.78)";
  ctx.fillRect(0, 0, w, h);

  const cw = Math.min(380, w - 32);
  const clueLine = cluesSeen.length > 0 ? cluesSeen.join(", ") : "—";
  const ch = 230;
  const x0 = (w - cw) / 2;
  const y0 = (h - ch) / 2;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 32;
  ctx.fillStyle = "rgba(32, 30, 24, 0.98)";
  ctx.beginPath();
  ctx.roundRect(x0, y0, cw, ch, 14);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(245, 78, 0, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x0, y0, cw, ch, 14);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.fillStyle = CURSOR_ORANGE;
  ctx.font = "700 20px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("GAME OVER", w / 2, y0 + 22);

  ctx.font = "600 9px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(192, 133, 50, 0.95)";
  const labelPeakY = y0 + 52;
  ctx.fillText("PEAK HEIGHT", w / 2, labelPeakY);

  ctx.font = "600 20px 'Berkeley Mono', ui-monospace, monospace";
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.fillText(`${Math.floor(peakHeightM)} m`, w / 2, y0 + 66);

  ctx.font = "600 9px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(237, 236, 236, 0.55)";
  ctx.fillText("CLUES SEEN", w / 2, y0 + 100);

  ctx.font = "13px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = CURSOR_TEXT;
  const maxW = cw - 40;
  wrapFillText(ctx, clueLine, w / 2, y0 + 116, maxW, 16);

  ctx.font = "12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(237, 236, 236, 0.55)";
  if (mode === "endless") {
    ctx.fillText("R retry   ·   Esc to leave the monitor", w / 2, y0 + 200);
  } else {
    ctx.fillText("R retry   ·   Esc back to the desk", w / 2, y0 + 200);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Right-aligned stat chips for the top HUD (height, goal, boost meter). */
function drawHudStatChips(
  ctx: CanvasRenderingContext2D,
  w: number,
  opts: {
    maxClimbM: number;
    isDaily: boolean;
    scroll: number;
    dailyGoalScroll: number | undefined;
    boost01: number;
  },
): void {
  const { maxClimbM, isDaily, scroll, dailyGoalScroll, boost01 } = opts;
  const padX = 6;
  const chipH = 28;
  const topY = 4;
  const rightMargin = 10;
  const gap = 6;
  const hVal = `${Math.floor(maxClimbM)}m`;
  const goalPct =
    isDaily && dailyGoalScroll
      ? Math.min(100, Math.round((scroll / dailyGoalScroll) * 100))
      : 0;
  const showBoost = boost01 > 0.02;
  const boostPct = Math.floor(boost01 * 100);
  const boostAccent = boost01 >= 0.5 ? CURSOR_ORANGE : CURSOR_GOLD;

  type Chip = { w: number; draw: (x: number) => void };
  const chips: Chip[] = [];

  ctx.font = "600 11px 'Berkeley Mono', ui-monospace, monospace";
  const hw = Math.max(44, ctx.measureText(hVal).width) + padX * 2;
  chips.push({
    w: hw,
    draw: (x) => {
      ctx.fillStyle = "rgba(28, 26, 20, 0.95)";
      ctx.strokeStyle = "rgba(192, 133, 50, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, topY, hw, chipH, 5);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font =
        "600 8px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = CURSOR_GOLD;
      ctx.fillText("HEIGHT", x + hw / 2, topY + 3);
      ctx.font = "600 11px 'Berkeley Mono', ui-monospace, monospace";
      ctx.fillStyle = CURSOR_TEXT_HI;
      ctx.fillText(hVal, x + hw / 2, topY + 14);
    },
  });

  if (isDaily) {
    const gv = `${goalPct}%`;
    ctx.font = "600 11px 'Berkeley Mono', ui-monospace, monospace";
    const gw = Math.max(40, ctx.measureText(gv).width) + padX * 2;
    chips.push({
      w: gw,
      draw: (x) => {
        ctx.fillStyle = "rgba(28, 26, 20, 0.95)";
        ctx.strokeStyle = "rgba(192, 133, 50, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, topY, gw, chipH, 5);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.font =
          "600 8px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = CURSOR_GOLD;
        ctx.fillText("GOAL", x + gw / 2, topY + 3);
        ctx.font = "600 11px 'Berkeley Mono', ui-monospace, monospace";
        ctx.fillStyle = CURSOR_TEXT_HI;
        ctx.fillText(gv, x + gw / 2, topY + 14);
      },
    });
  }

  const boostW = 78;
  chips.push({
    w: boostW,
    draw: (x) => {
      ctx.fillStyle = "rgba(28, 26, 20, 0.95)";
      ctx.strokeStyle = "rgba(192, 133, 50, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, topY, boostW, chipH, 5);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font =
        "600 8px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = CURSOR_GOLD;
      ctx.fillText("BOOST", x + boostW / 2, topY + 3);
      ctx.font = "600 10px 'Berkeley Mono', ui-monospace, monospace";
      ctx.fillStyle = showBoost ? CURSOR_TEXT_HI : "rgba(237,236,236,0.45)";
      ctx.fillText(showBoost ? `${boostPct}%` : "—", x + boostW / 2, topY + 14);
      if (showBoost) {
        const barX = x + 8;
        const barY = topY + chipH - 5;
        const barW = boostW - 16;
        const barH = 3;
        ctx.fillStyle = "rgba(20, 18, 11, 0.95)";
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 1);
        ctx.fill();
        ctx.fillStyle = boostAccent;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * boost01, barH, 1);
        ctx.fill();
      }
    },
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  let x = w - rightMargin;
  for (let i = chips.length - 1; i >= 0; i--) {
    const c = chips[i]!;
    x -= c.w;
    c.draw(x);
    x -= i > 0 ? gap : 0;
  }
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineGap: number,
): void {
  let yy = y;
  for (const line of wrapLines(ctx, text, maxW)) {
    ctx.fillText(line, cx - ctx.measureText(line).width / 2, yy);
    yy += lineGap;
  }
}

/** Draw one frame of the code-runner to a 2D canvas (logical 512×320 space). */
export function drawRunnerFrame(
  ctx: CanvasRenderingContext2D,
  opts: DrawRunnerOpts,
): void {
  const W = RUNNER_DRAW.canvasW;
  const H = RUNNER_DRAW.canvasH;
  const {
    scroll,
    playerY,
    planks,
    modeLabel,
    grounded,
    elapsedMs,
    gameOver,
    maxClimbM,
    boost01,
    boostActive,
    clueSet,
    anomalyId,
    clueTooltipHint,
    onClueTokenSeen,
    tierRibbon,
    projectiles,
    dailyCleared,
    dailyGoalScroll,
  } = opts;

  const feetW = playerY + RUNNER_DRAW.playerH;
  /** Follow climb and falls — no upper clamp so high yTop courses stay on-screen. */
  const cameraY = Math.max(-220, H * 0.55 - feetW);

  const failAnim = gameOver?.failureAnimMs;
  const shakeT =
    failAnim !== undefined && failAnim < 180 ? 1 - failAnim / 180 : 0;
  const shakeX =
    failAnim !== undefined && shakeT > 0
      ? (Math.sin(failAnim * 0.37) * 5 + Math.cos(failAnim * 0.21) * 3) * shakeT
      : 0;
  const shakeY =
    failAnim !== undefined && shakeT > 0
      ? (Math.cos(failAnim * 0.29) * 4 + Math.sin(failAnim * 0.33) * 2) * shakeT
      : 0;

  const hintFlash =
    failAnim !== undefined && failAnim < 1500
      ? "missed jump — hold → or D to boost over death gaps"
      : null;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, CURSOR_BG_TOP);
  bg.addColorStop(1, CURSOR_BG_BOT);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = CURSOR_GRID;
  ctx.lineWidth = 1;
  const off = (scroll * 0.15) % 40;
  for (let x = -off; x < W + 40; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  const activeToks = activeTokensForHeight(clueSet, maxClimbM);
  // Fade uses current climb tier (matches sim’s ramp), not per-plank gen tier.
  const tier = endlessTierFromMaxClimbM(maxClimbM);
  const pristineLife = pristineLifeMsForTier(
    tier,
    modeLabel.includes("endless") ? "endless" : undefined,
    modeLabel.includes("endless") ? maxClimbM : 0,
  );

  // Clip world content (planks + snippets + player + projectiles) to the
  // playfield rect below the HUD + clue strip. Without this, plank text
  // bleeds into the HUD when the camera scrolls high. R-7.
  const playfield = {
    x: 0,
    y: RUNNER_HUD_TOP_PX + CLUE_STRIP_H,
    w: W,
    h: H - (RUNNER_HUD_TOP_PX + CLUE_STRIP_H),
  };
  clipToRect(ctx, playfield, () => {
    for (const p of planks) {
      const sx0 = p.x0 - scroll;
      const sx1 = p.x1 - scroll;
      if (sx1 < -20 || sx0 > W + 20) continue;

      const lifeT =
        p.touchedAtMs === null
          ? (elapsedMs - p.bornAtMs) / pristineLife
          : (elapsedMs - p.touchedAtMs) / PLANK_LIFE_MS;
      const alpha = Math.max(0, 1 - lifeT);
      // R-3: pulse red when the plank is about to disappear so the player
      // sees "leave NOW" instead of the floor silently fading.
      const warning = lifeT > 0.65 && lifeT < 1;
      ctx.save();
      ctx.globalAlpha = alpha;

      const yTop = p.yTop + cameraY;
      const baselineY = yTop + SNIPPET_BASELINE_OFFSET;
      const snippet = snippetTextForPlankId(p.id, anomalyId);
      const showClue =
        activeToks.length > 0 &&
        plankHasClueToken(p.id) &&
        clueSet.tokens.length > 0;

      if (showClue) {
        drawClueSnippetLine(
          ctx,
          snippet,
          sx0 + 4,
          baselineY,
          activeToks,
          clueSet.palette,
          onClueTokenSeen,
        );
      } else {
        drawPlainSnippetRow(ctx, snippet, sx0 + 4, baselineY);
      }

      // Underline — pulses red and shakes 1px while the plank is about to
      // disappear (R-3 warning).
      const pulse = warning
        ? 0.55 + 0.35 * Math.abs(Math.sin(elapsedMs / 90))
        : 0;
      const wobble = warning ? Math.round(Math.sin(elapsedMs / 60) * 1) : 0;
      ctx.strokeStyle = warning
        ? `rgba(245, 78, 0, ${pulse})`
        : "rgba(192,133,50,0.55)";
      ctx.lineWidth = warning ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(sx0, baselineY + 1 + wobble);
      ctx.lineTo(sx1, baselineY + 1 + wobble);
      ctx.stroke();

      ctx.restore();
    }

    if (!gameOver) {
      drawRunnerProjectiles(ctx, scroll, cameraY, projectiles, W);
    }

    const px = PLAYER_SCREEN_X;
    const py = playerY + cameraY;
    const pose = pickPose(scroll, grounded);
    const runPhase = (scroll * 0.012) % 1;
    drawGroundShadow(ctx, px, feetW + cameraY, grounded);
    const tumble01 = failAnim !== undefined ? Math.min(1, failAnim / 280) : 0;
    const mascAlpha = failAnim !== undefined ? 1 - 0.7 * tumble01 : 1;
    const feetPivotX = px + 22;
    const feetPivotY = feetW + cameraY;
    ctx.save();
    ctx.globalAlpha = mascAlpha;
    if (tumble01 > 0.001) {
      ctx.translate(feetPivotX, feetPivotY);
      ctx.rotate(tumble01 * (Math.PI / 3));
      ctx.translate(-feetPivotX, -feetPivotY);
    }
    drawChibiThreeQuarterMascot(ctx, px, py, pose, runPhase);
    ctx.restore();

    // R-4: speed-line FX while boost is being burned. Six horizontal lines
    // at varying y/length, scrolling fast off the right edge so the eye
    // reads a sense of motion. Only paints in the playfield (clipped).
    if (boostActive) {
      ctx.save();
      const lines = 6;
      for (let i = 0; i < lines; i++) {
        const seedY = (i * 53 + 17) % 100;
        const ly = playfield.y + 16 + (seedY * (playfield.h - 32)) / 100;
        const phase = (elapsedMs * 0.9 + i * 47) % W;
        const lineLen = 70 + ((i * 23) % 60);
        const startX = W - phase;
        ctx.strokeStyle = "rgba(255, 215, 199, 0.55)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(startX, ly);
        ctx.lineTo(startX + lineLen, ly);
        ctx.stroke();
      }
      ctx.restore();
    }
  }); // end clipToRect(playfield)

  drawClueStrip(ctx, W, clueSet, clueTooltipHint, activeToks, hintFlash);

  ctx.fillStyle = HUD_BAR;
  ctx.fillRect(0, 0, W, RUNNER_HUD_TOP_PX);
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.font = FONT_MODE;
  ctx.fillText(modeLabel, 12, 23);
  drawHudStatChips(ctx, W, {
    maxClimbM,
    isDaily: modeLabel.includes("daily"),
    scroll,
    dailyGoalScroll,
    boost01,
  });

  if (tierRibbon && tierRibbon.ageMs < 1200 && tierRibbon.tier > 0) {
    const fade = 1 - tierRibbon.ageMs / 1200;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = "600 11px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = CURSOR_GOLD;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const rib = `${tierRibbon.tier * 100}m · tier ${tierRibbon.tier}`;
    ctx.fillText(rib, W / 2, 30);
    ctx.textAlign = "left";
    ctx.restore();
  }

  if (dailyCleared && !gameOver) {
    const barH = 34;
    const barY = H - barH - 8;
    const pad = 10;
    ctx.fillStyle = "rgba(24, 22, 17, 0.96)";
    ctx.beginPath();
    ctx.roundRect(pad, barY, W - pad * 2, barH, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(192, 133, 50, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pad + 0.5, barY + 0.5, W - pad * 2 - 1, barH - 1, 8);
    ctx.stroke();
    ctx.fillStyle = CURSOR_GOLD;
    ctx.font = FONT_HUD_SM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Daily clear — clue locked  ·  keep going or Esc to desk  ·  R to retry",
      W / 2,
      barY + barH / 2,
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();

  if (gameOver) {
    const fa = gameOver.failureAnimMs;
    const showCard = fa === undefined || fa >= 280;
    if (!showCard) {
      ctx.save();
      ctx.fillStyle = "rgba(20,18,11,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else {
      drawGameOverCard(ctx, {
        w: W,
        h: H,
        peakHeightM: gameOver.peakHeightM,
        cluesSeen: gameOver.cluesSeen,
        mode: gameOver.mode,
      });
    }
  }
}

/**
 * Pre-run intro overlay — "READY → GO!" with a key legend so a brand-new
 * player learns SPACE/→ before the floor starts disappearing. progress01
 * goes 0→1 over the intro duration; we fade out near the end.
 */
export function drawRunnerIntroOverlay(
  ctx: CanvasRenderingContext2D,
  progress01: number,
): void {
  const W = RUNNER_DRAW.canvasW;
  const H = RUNNER_DRAW.canvasH;
  const fade = progress01 < 0.7 ? 1 : 1 - (progress01 - 0.7) / 0.3;

  ctx.save();
  // Soft scrim — keeps the playfield readable behind the intro.
  ctx.fillStyle = `rgba(8, 7, 5, ${0.55 * fade})`;
  ctx.fillRect(0, 0, W, H);

  // Headline: READY for first 60% of intro, then GO! pops bigger.
  const showGo = progress01 >= 0.55;
  const headline = showGo ? "GO!" : "READY";
  const popScale = showGo ? 1 + Math.min(1, (progress01 - 0.55) * 6) * 0.18 : 1;
  ctx.fillStyle = `rgba(255, 215, 199, ${fade})`;
  ctx.font = `700 ${Math.round(48 * popScale)}px 'Cursor Gothic', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(headline, W / 2, H / 2 - 16);

  // Key legend row.
  ctx.fillStyle = `rgba(231, 250, 255, ${0.85 * fade})`;
  ctx.font = "600 13px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("SPACE jump   ·   → boost   ·   ESC desk", W / 2, H / 2 + 28);

  ctx.fillStyle = `rgba(231, 250, 255, ${0.5 * fade})`;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("press anything to start", W / 2, H / 2 + 50);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
