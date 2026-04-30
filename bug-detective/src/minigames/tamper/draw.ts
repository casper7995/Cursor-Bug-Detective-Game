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
  drawAiResultStrip,
  truncateOnWord,
  wrapAndDraw,
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

/** One-line label for the Bugbot call (plain language, names the prop). */
export function bugbotRowClaimLine(
  call: TamperCall,
  scene: TamperScene,
): string {
  const spot = scene.spots.find((s) => s.id === call.bugbotPointsAtSpotId);
  const name = spot?.label ?? "this prop";
  return call.bugbotClaim === "tampered"
    ? `Bugbot says: the ${name} changed`
    : `Bugbot says: the ${name} is clean`;
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

/**
 * Source coordinate space for `TamperSpot.(x, y, r)`. Spots in scenes.ts are
 * authored against this grid; both the panel renderer and the hit-tester
 * project from this space into screen pixels via {@link panelRect}.
 */
const SCENE_SOURCE = { w: 256, h: 200 } as const;

/** Geometry of one ORIGINAL/TONIGHT panel inside the diff card. */
export interface PanelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Uniform scale from `SCENE_SOURCE` → panel pixels. */
  readonly scale: number;
}

/**
 * Geometry of the two scene panels inside the diff card. Computed once at
 * module load — inputs are compile-time constants (`TAMPER_LAYOUT` /
 * `SCENE_SOURCE`).
 */
const TAMPER_PANEL_RECTS: {
  original: PanelRect;
  tonight: PanelRect;
} = (() => {
  const L = TAMPER_LAYOUT;
  const innerX = L.diffX + 10;
  const innerY = L.diffY + 30; // below filename strip
  const innerW = L.diffW - 20;
  const innerH = L.diffH - 40;
  const gutter = 8;
  const panelW = (innerW - gutter) / 2;
  const panelH = innerH;
  const scale = Math.min(panelW / SCENE_SOURCE.w, panelH / SCENE_SOURCE.h);
  return {
    original: { x: innerX, y: innerY, w: panelW, h: panelH, scale },
    tonight: {
      x: innerX + panelW + gutter,
      y: innerY,
      w: panelW,
      h: panelH,
      scale,
    },
  };
})();

/** Public accessor preserved for the tests that import it. */
export function getTamperPanelRects(): {
  original: PanelRect;
  tonight: PanelRect;
} {
  return TAMPER_PANEL_RECTS;
}

/** Project a spot's (x, y) from source space into a panel's pixel space. */
function projectSpot(
  spot: TamperSpot,
  panel: PanelRect,
): { cx: number; cy: number; r: number } {
  // Center the source grid inside the panel (spots author near the top of
  // their grid, so a small Y nudge keeps them inside the visible scene).
  const drawnW = SCENE_SOURCE.w * panel.scale;
  const drawnH = SCENE_SOURCE.h * panel.scale;
  const ox = panel.x + (panel.w - drawnW) / 2;
  const oy = panel.y + (panel.h - drawnH) / 2;
  return {
    cx: ox + spot.x * panel.scale,
    cy: oy + spot.y * panel.scale,
    r: Math.max(10, spot.r * panel.scale),
  };
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
  hoveredSpotId: string | null = null,
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
    `${scene.displayName.toLowerCase().replace(/\s+/g, "-")}.scene`,
    L.diffX + 12,
    L.diffY + 12,
  );
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText("ORIGINAL ↔ TONIGHT", L.diffX + L.diffW - 12, L.diffY + 12);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();

  const { original, tonight } = getTamperPanelRects();
  drawScenePanel(ctx, scene, original, "original", null, false, false, null);
  drawScenePanel(
    ctx,
    scene,
    tonight,
    "tonight",
    pointAtSpotId,
    showRealTamper,
    pickingSpot,
    hoveredSpotId,
  );
}

function drawScenePanel(
  ctx: CanvasRenderingContext2D,
  scene: TamperScene,
  panel: PanelRect,
  half: "original" | "tonight",
  pointAtSpotId: string | null,
  showRealTamper: boolean,
  pickingSpot: boolean,
  hoveredSpotId: string | null,
): void {
  // Panel background — slightly different paper for ORIGINAL vs TONIGHT so
  // the eye registers them as two separate scenes at a glance.
  ctx.save();
  ctx.fillStyle =
    half === "original"
      ? "rgba(244, 240, 226, 0.9)"
      : "rgba(238, 232, 218, 0.9)";
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

  // Faint grid for "scene" feel.
  ctx.strokeStyle = "rgba(20, 18, 11, 0.06)";
  ctx.lineWidth = 1;
  const grid = 16;
  ctx.beginPath();
  for (let gx = panel.x + grid; gx < panel.x + panel.w; gx += grid) {
    ctx.moveTo(gx, panel.y);
    ctx.lineTo(gx, panel.y + panel.h);
  }
  for (let gy = panel.y + grid; gy < panel.y + panel.h; gy += grid) {
    ctx.moveTo(panel.x, gy);
    ctx.lineTo(panel.x + panel.w, gy);
  }
  ctx.stroke();

  // Panel border + header pill.
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);

  const accent = half === "original" ? CURSOR_AI.green : CURSOR_AI.accent;
  drawHalfLabel(
    ctx,
    panel.x + 8,
    panel.y + 14,
    half === "original" ? "ORIGINAL" : "TONIGHT",
    accent,
  );
  ctx.restore();

  // Pick-mode dashed accent border on TONIGHT.
  if (pickingSpot && half === "tonight") {
    ctx.save();
    ctx.strokeStyle = CURSOR_AI.accent;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panel.x + 1, panel.y + 1, panel.w - 2, panel.h - 2);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Props.
  for (const spot of scene.spots) {
    const isTamperHere = half === "tonight" && spot.tampered;
    const sketchKey =
      isTamperHere && spot.tonightSketchKey
        ? spot.tonightSketchKey
        : spot.sketchKey;
    const { cx, cy, r } = projectSpot(spot, panel);
    const sketchSize = Math.max(14, Math.min(22, r * 0.95));

    // Pick-mode hover halo on TONIGHT props. The hovered prop is brighter
    // and gets a solid ring so the player sees which one will land.
    if (pickingSpot && half === "tonight") {
      const isHot = hoveredSpotId === spot.id;
      ctx.save();
      ctx.fillStyle = isHot ? "rgba(245,78,0,0.22)" : "rgba(245,78,0,0.08)";
      ctx.beginPath();
      ctx.arc(cx, cy, isHot ? r + 2 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isHot ? "rgba(245,78,0,0.95)" : "rgba(245,78,0,0.5)";
      ctx.lineWidth = isHot ? 2 : 1;
      if (!isHot) ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(cx, cy, isHot ? r + 2 : r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Real-tamper reveal (post-verdict miss): pulse halo + "real" tag.
    if (showRealTamper && isTamperHere) {
      ctx.save();
      ctx.fillStyle = "rgba(60, 145, 80, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CURSOR_AI.green;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawPropSketch(ctx, sketchKey, cx, cy, sketchSize);

    // Bugbot pointer arrow on the prop in TONIGHT.
    if (pointAtSpotId === spot.id && half === "tonight") {
      drawBugbotPointer(ctx, cx, cy, r, panel);
    }

    // Small label badge under the prop — text stays as a secondary signal.
    if (showRealTamper && isTamperHere) {
      ctx.save();
      ctx.fillStyle = CURSOR_AI.green;
      ctx.font = "700 8px 'Cursor Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("real", cx, cy + r + 9);
      ctx.textAlign = "left";
      ctx.restore();
    }
  }
}

function drawBugbotPointer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  panel: PanelRect,
): void {
  ctx.save();
  // Halo ring around the prop.
  ctx.strokeStyle = "rgba(245,78,0,0.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.stroke();
  // Arrow tail anchored above-left of the prop, but clamped to stay inside
  // the panel so edge spots don't draw the "bot" tag in the gutter.
  const tagW = 18; // approximate width of " bot" text run + arrow body
  const minAx = panel.x + tagW;
  const maxAx = panel.x + panel.w - 12;
  const minAy = panel.y + 8;
  const maxAy = panel.y + panel.h - 12;
  const ax = Math.max(minAx, Math.min(maxAx, cx - r - 10));
  const ay = Math.max(minAy, Math.min(maxAy, cy - r - 10));
  ctx.fillStyle = "rgba(245,78,0,0.95)";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax + 8, ay + 2);
  ctx.lineTo(ax + 4, ay + 4);
  ctx.lineTo(cx - r * 0.7, cy - r * 0.7);
  ctx.lineTo(ax + 2, ay + 8);
  ctx.lineTo(ax + 4, ay + 4);
  ctx.closePath();
  ctx.fill();
  // "bot" tag near the arrow tail.
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "700 7px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("bot", ax - 14, ay + 4);
  ctx.restore();
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
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.textAlign = "left";
  ctx.fillText(truncateOnWord(ctx, line, maxW), x, y);
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
    wrapAndDraw(ctx, claim, L.chatX + 14, L.chatY + 60, L.chatW - 28, 14);
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
      "Click the changed prop in TONIGHT.",
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
  const bodyY = wrapAndDraw(
    ctx,
    "Compare ORIGINAL vs TONIGHT. One prop really changed. Bugbot can be wrong about a prop.",
    x + 24,
    y + 82,
    w - 48,
    16,
  );
  ctx.fillStyle = CURSOR_AI.inkMute;
  wrapAndDraw(
    ctx,
    "If Bugbot is wrong, use Point to real change, then click the true changed prop.",
    x + 24,
    bodyY + 4,
    w - 48,
    16,
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
    "Then: Bugbot will call out props. Say if Bugbot is right.",
    "If Bugbot is wrong, click the real changed prop in TONIGHT.",
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

export interface TamperResultCardInfo {
  readonly score: number;
  readonly rightCalls: number;
  readonly caughtLies: number;
  /** True when the round earned a desk clue token. */
  readonly earnedClue: boolean;
  /** TONIGHT variant text for the tampered prop ("key (bent)"). */
  readonly tamperedVariant: string;
}

export function drawResultCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  info: TamperResultCardInfo,
  total: number,
): void {
  ctx.save();
  ctx.fillStyle = CURSOR_AI.scrim;
  ctx.fillRect(0, 0, W, H);
  const w = 380;
  const h = 196;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  drawAiCard(ctx, x, y, w, h, { radius: 14 });

  const teach = info.earnedClue
    ? `Real change: ${info.tamperedVariant}.`
    : `Real change: ${info.tamperedVariant}. Need 3+ correct AND 1+ caught lie for a clue.`;

  drawAiResultStrip(ctx, x, y, w, h, {
    headline: String(info.score),
    headlineCaption: "score",
    stats: [
      {
        label: "accuracy",
        value: `${info.rightCalls} / ${total}`,
        accent: info.rightCalls >= 3 ? CURSOR_AI.green : CURSOR_AI.ink,
      },
      {
        label: "caught lies",
        value: String(info.caughtLies),
        accent: info.caughtLies > 0 ? CURSOR_AI.green : CURSOR_AI.inkMute,
      },
    ],
    teach,
    footer: "click anywhere to close",
  });
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
  // Touch the layout helper so its geometry stays exercised — tests assert
  // the layout maths, but the visualisation is two mini-panels showing one
  // prop changed between ORIGINAL and TONIGHT.
  void getTamperTutorialDiagramLayout(x, y, w, h, TAMPER_TUTORIAL_LABEL_WIDTH);

  ctx.save();
  const gutter = 12;
  const panelW = Math.min(120, (w - gutter) / 2);
  const panelH = Math.min(64, h - 8);
  const totalW = panelW * 2 + gutter;
  const px = x + (w - totalW) / 2;
  const py = y + (h - panelH) / 2;

  drawTutorialMiniPanel(ctx, px, py, panelW, panelH, "ORIGINAL", false);
  drawTutorialMiniPanel(
    ctx,
    px + panelW + gutter,
    py,
    panelW,
    panelH,
    "TONIGHT",
    true,
  );

  // Connector + caption between the panels.
  ctx.strokeStyle = CURSOR_AI.inkSubtle;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(px + panelW + 1, py + panelH / 2);
  ctx.lineTo(px + panelW + gutter - 1, py + panelH / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("spot the one prop that changed", x + w / 2, py + panelH + 6);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawTutorialMiniPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  changed: boolean,
): void {
  ctx.save();
  ctx.fillStyle =
    label === "ORIGINAL"
      ? "rgba(244, 240, 226, 0.95)"
      : "rgba(238, 232, 218, 0.95)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = CURSOR_AI.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Tiny header badge.
  const accent = label === "ORIGINAL" ? CURSOR_AI.green : CURSOR_AI.accent;
  ctx.fillStyle = accent;
  ctx.fillRect(x + 6, y + 6, 5, 5);
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "700 8px 'Cursor Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 14, y + 8);
  ctx.textBaseline = "alphabetic";

  // Three demo props — second one swaps to a "changed" sketch in TONIGHT.
  const cy = y + h * 0.62;
  const xs = [x + w * 0.25, x + w * 0.5, x + w * 0.75];
  drawPropSketch(ctx, "key", xs[0]!, cy, 9);
  drawPropSketch(ctx, changed ? "key_bent" : "key", xs[1]!, cy, 9);
  drawPropSketch(ctx, "stamp", xs[2]!, cy, 9);

  if (changed) {
    ctx.strokeStyle = CURSOR_AI.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(xs[1]!, cy, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
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
    case "stamp_offset": {
      const offset = sketchKey === "stamp_offset";
      if (offset) {
        ctx.save();
        ctx.rotate(0.18);
      }
      ctx.strokeRect(-size * 0.5, -size * 0.4, size, size * 0.8);
      ctx.fillStyle = CURSOR_AI.accent;
      ctx.beginPath();
      ctx.arc(offset ? size * 0.32 : 0, 0, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      if (offset) ctx.restore();
      break;
    }
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
        // Bigger second loop + redder ink so the change reads at 16px.
        ctx.strokeStyle = CURSOR_AI.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(-size * 0.15, size * 0.05, size * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = CURSOR_AI.ink;
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
        // Big triangular fold filled with shadow tint — visible at 16px.
        ctx.fillStyle = "rgba(20,18,11,0.35)";
        ctx.beginPath();
        ctx.moveTo(size * 0.4, -size * 0.4);
        ctx.lineTo(size * 0.05, -size * 0.4);
        ctx.lineTo(size * 0.4, -size * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(size * 0.05, -size * 0.4);
        ctx.lineTo(size * 0.4, -size * 0.05);
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
        // Wide orange tape strip spanning the rim — unmistakable at 16px.
        ctx.fillStyle = "rgba(245,78,0,0.85)";
        ctx.fillRect(-size * 0.4, -size * 0.45, size * 0.8, size * 0.18);
        ctx.strokeStyle = CURSOR_AI.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(-size * 0.4, -size * 0.45, size * 0.8, size * 0.18);
        ctx.strokeStyle = CURSOR_AI.ink;
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
      if (sketchKey === "puddle_oil") {
        // Iridescent oil sheen — three concentric rings, blue/orange/yellow.
        ctx.fillStyle = "rgba(40, 30, 20, 0.7)";
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.55, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245, 78, 0, 0.55)";
        ctx.beginPath();
        ctx.ellipse(
          -size * 0.05,
          size * 0.05,
          size * 0.4,
          size * 0.18,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = "rgba(140, 200, 255, 0.45)";
        ctx.beginPath();
        ctx.ellipse(
          size * 0.1,
          size * 0.0,
          size * 0.22,
          size * 0.1,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = "rgba(255, 240, 120, 0.55)";
        ctx.beginPath();
        ctx.ellipse(
          -size * 0.15,
          size * 0.12,
          size * 0.12,
          size * 0.06,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(20,18,11,0.55)";
        ctx.beginPath();
        ctx.ellipse(0, size * 0.1, size * 0.55, size * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "book":
    case "book_shifted":
      if (sketchKey === "book_shifted") {
        // Ghost outline at the original position.
        ctx.save();
        ctx.strokeStyle = "rgba(20,18,11,0.25)";
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(-size * 0.4, -size * 0.3, size * 0.8, size * 0.6);
        ctx.setLineDash([]);
        ctx.restore();
        ctx.translate(size * 0.18, -size * 0.1);
        ctx.rotate(0.22);
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

/**
 * Hit-test a click against props in the TONIGHT panel. Uses the same
 * `projectSpot` transform the renderer uses, so click accuracy matches
 * what the player sees.
 */
export function spotPropAt(
  scene: TamperScene,
  x: number,
  y: number,
): SpotRowHit | null {
  const { tonight } = getTamperPanelRects();
  // Cheap bounds reject — outside the TONIGHT panel never hits.
  if (
    x < tonight.x ||
    x > tonight.x + tonight.w ||
    y < tonight.y ||
    y > tonight.y + tonight.h
  ) {
    return null;
  }
  let best: { spotId: string; distSq: number } | null = null;
  for (const spot of scene.spots) {
    const { cx, cy, r } = projectSpot(spot, tonight);
    const dx = x - cx;
    const dy = y - cy;
    const distSq = dx * dx + dy * dy;
    if (distSq <= r * r && (best === null || distSq < best.distSq)) {
      best = { spotId: spot.id, distSq };
    }
  }
  return best ? { spotId: best.spotId } : null;
}

/** Back-compat shim — old call sites keep working while we rename. */
export function spotRowAt(
  scene: TamperScene,
  x: number,
  y: number,
): SpotRowHit | null {
  return spotPropAt(scene, x, y);
}

export { spotById };
