import type { AnomalyId } from "../../scene/anomalies";
import type { CodePlank } from "./sim";
import {
  endlessTierFromMaxClimbM,
  PLAYER_SCREEN_X,
  PLANK_LIFE_MS,
  pristineLifeMsForTier,
  RUNNER_DRAW,
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
const HUD_BAR = "rgba(20,18,11,0.55)";
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
  clueSet: RunnerClueSet;
  anomalyId: AnomalyId;
  clueTooltipHint: string;
  onClueTokenSeen?: (token: string) => void;
  /** ms since a new 100m tier — ribbon fades over 1.2s (endless ramp). */
  tierRibbon?: { tier: number; ageMs: number };
  gameOver?: {
    peakHeightM: number;
    cluesSeen: readonly string[];
    mode: RunnerMode;
    /** 0..1 endless auto-restart countdown. */
    restartProgress01: number;
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

function drawClueStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  clueSet: RunnerClueSet,
  tooltipHint: string,
  activeTokens: readonly string[],
  hintOverride: string | null,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(38,37,30,0.9)";
  ctx.fillRect(0, RUNNER_HUD_TOP_PX, w, CLUE_STRIP_H);
  ctx.strokeStyle = "rgba(192,133,50,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RUNNER_HUD_TOP_PX + CLUE_STRIP_H);
  ctx.lineTo(w, RUNNER_HUD_TOP_PX + CLUE_STRIP_H);
  ctx.stroke();

  ctx.font = FONT_HUD_SM;
  ctx.textBaseline = "middle";
  const midY = RUNNER_HUD_TOP_PX + CLUE_STRIP_H / 2;
  ctx.fillStyle = CURSOR_GOLD;
  ctx.textAlign = "left";
  ctx.fillText("CLUE", 10, midY);

  ctx.fillStyle = hintOverride ? CURSOR_ORANGE : CURSOR_TEXT_HI;
  const hintX = 52;
  const rawHint = hintOverride ?? tooltipHint;
  const hint = rawHint.length > 52 ? `${rawHint.slice(0, 49)}…` : rawHint;
  const hintLabel = `› ${hint}`;
  ctx.fillText(hintLabel, hintX, midY);
  const hintRightX = hintX + ctx.measureText(hintLabel).width;

  ctx.textAlign = "right";
  let rx = w - 10;
  const n = Math.min(activeTokens.length, clueSet.tokens.length);
  for (let i = n - 1; i >= 0; i--) {
    const tok = activeTokens[i]!;
    const col = clueSet.palette[i % clueSet.palette.length]!;
    ctx.font = FONT_CLUE_CHIP;
    const tw = ctx.measureText(tok).width;
    const pad = 6;
    const chipW = tw + pad * 2;
    rx -= chipW;
    if (rx < hintRightX + 20) break;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(rx, RUNNER_HUD_TOP_PX + 4, chipW, CLUE_STRIP_H - 8, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(245,78,0,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = CURSOR_TEXT_HI;
    ctx.fillText(tok, rx + pad, midY);
    rx -= 6;
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
    restartProgress01: number;
  },
): void {
  const { w, h, peakHeightM, cluesSeen, mode, restartProgress01 } = opts;
  ctx.save();
  ctx.fillStyle = "rgba(10,9,7,0.55)";
  ctx.fillRect(0, 0, w, h);

  const cw = 300;
  const ch = 184;
  const x0 = (w - cw) / 2;
  const y0 = (h - ch) / 2;
  ctx.fillStyle = "rgba(38,37,30,0.96)";
  ctx.strokeStyle = "rgba(245,78,0,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x0, y0, cw, ch, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = CURSOR_ORANGE;
  ctx.font = "700 22px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", w / 2, y0 + 44);

  ctx.font = "600 16px 'Berkeley Mono', ui-monospace, monospace";
  ctx.fillStyle = CURSOR_GOLD;
  ctx.fillText(`peak height: ${Math.floor(peakHeightM)}m`, w / 2, y0 + 78);

  const clueLine = cluesSeen.length > 0 ? cluesSeen.join(", ") : "(none yet)";
  ctx.font = "13px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = CURSOR_TEXT;
  const clueY = y0 + 108;
  const maxW = cw - 36;
  wrapFillText(ctx, `clues seen: ${clueLine}`, w / 2, clueY, maxW, 16);

  ctx.font = "13px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(237,236,236,0.65)";
  if (mode === "endless") {
    ctx.fillText("Restarting… Esc to exit", w / 2, y0 + 148);
    const barW = cw - 48;
    const bx = (w - barW) / 2;
    const by = y0 + 158;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, by, barW, 6);
    ctx.fillStyle = CURSOR_ORANGE;
    ctx.fillRect(bx, by, barW * restartProgress01, 6);
  } else {
    ctx.fillText("R retry · Esc exit", w / 2, y0 + 154);
  }
  ctx.textAlign = "left";
  ctx.restore();
}

function wrapFillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxW: number,
  lineGap: number,
): void {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (ctx.measureText(tryLine).width <= maxW) {
      line = tryLine;
    } else {
      if (line) {
        ctx.fillText(line, cx - ctx.measureText(line).width / 2, yy);
        yy += lineGap;
      }
      line = w;
    }
  }
  if (line) {
    ctx.fillText(line, cx - ctx.measureText(line).width / 2, yy);
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
    clueSet,
    anomalyId,
    clueTooltipHint,
    onClueTokenSeen,
    tierRibbon,
  } = opts;

  const feetW = playerY + RUNNER_DRAW.playerH;
  /** Follow falls: allow negative offset so the void read stays on-screen. */
  const cameraY = Math.min(280, Math.max(-200, H * 0.55 - feetW));

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
      ? "missed jump — boost (→) over death gaps"
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
  const pristineLife = pristineLifeMsForTier(tier);

  for (const p of planks) {
    const sx0 = p.x0 - scroll;
    const sx1 = p.x1 - scroll;
    if (sx1 < -20 || sx0 > W + 20) continue;

    const alpha =
      p.touchedAtMs === null
        ? Math.max(0, 1 - (elapsedMs - p.bornAtMs) / pristineLife)
        : Math.max(0, 1 - (elapsedMs - p.touchedAtMs) / PLANK_LIFE_MS);
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

    ctx.strokeStyle = "rgba(192,133,50,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx0, baselineY + 1);
    ctx.lineTo(sx1, baselineY + 1);
    ctx.stroke();

    ctx.restore();
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

  drawClueStrip(ctx, W, clueSet, clueTooltipHint, activeToks, hintFlash);

  ctx.fillStyle = HUD_BAR;
  ctx.fillRect(0, 0, W, RUNNER_HUD_TOP_PX);
  ctx.fillStyle = CURSOR_TEXT_HI;
  ctx.font = FONT_MODE;
  ctx.fillText(modeLabel, 12, 23);
  ctx.font = FONT_HUD_SM;
  const boostColor = boost01 >= 0.5 ? CURSOR_ORANGE : CURSOR_GOLD;
  ctx.fillStyle = boostColor;
  const rightParts = [`m ${Math.floor(maxClimbM)}`];
  if (boost01 > 0.02) {
    rightParts.push(`hold → ${Math.floor(boost01 * 100)}%`);
  }
  const rightText = rightParts.join(" · ");
  ctx.fillText(rightText, W - 12 - ctx.measureText(rightText).width, 22);

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
        restartProgress01: gameOver.restartProgress01,
      });
    }
  }
}
