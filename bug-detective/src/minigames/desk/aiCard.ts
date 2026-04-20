/**
 * Reusable Cursor-AI canvas widgets — surface card, button pill, mascot
 * avatar. Imported by the three desk-mini draw modules. Pure draw helpers,
 * no game state.
 */

import { CURSOR_AI } from "../../ui/cursorAiTheme";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AiCardOpts {
  /** Border radius (default 10). */
  readonly radius?: number;
  /** Override fill (default `CURSOR_AI.surface`). */
  readonly fill?: string;
  /** Override stroke (default `CURSOR_AI.border`). */
  readonly stroke?: string;
  /** Stroke width (default 1). */
  readonly strokeWidth?: number;
  /** Show a soft drop shadow under the card (default true). */
  readonly shadow?: boolean;
}

/** Filled rounded surface card with subtle border + drop shadow. */
export function drawAiCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: AiCardOpts = {},
): void {
  const r = opts.radius ?? 10;
  const fill = opts.fill ?? CURSOR_AI.surface;
  const stroke = opts.stroke ?? CURSOR_AI.border;
  const strokeWidth = opts.strokeWidth ?? 1;
  const shadow = opts.shadow ?? true;
  ctx.save();
  if (shadow) {
    ctx.fillStyle = CURSOR_AI.shadow;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 4, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export type AiButtonTone =
  | "primary" // blue, recommended action
  | "secondary" // ghost outline, neutral
  | "approve" // green, positive
  | "reject" // red, destructive
  | "ghost"; // text-only

export interface AiButtonOpts {
  readonly tone?: AiButtonTone;
  /** Optional leading icon (single character, rendered before the label). */
  readonly leading?: string | null;
  /** Optional trailing chip text (rendered right-aligned, smaller). */
  readonly trailing?: string | null;
  readonly hovered?: boolean;
  readonly disabled?: boolean;
  readonly font?: string;
}

interface ToneSpec {
  readonly bg: string;
  readonly bgHover: string;
  readonly border: string;
  readonly text: string;
  readonly leading: string;
}

const TONE_SPECS: Record<AiButtonTone, ToneSpec> = {
  primary: {
    bg: CURSOR_AI.blue,
    bgHover: "#1858c9",
    border: CURSOR_AI.blue,
    text: "#ffffff",
    leading: "#ffffff",
  },
  secondary: {
    bg: CURSOR_AI.surface,
    bgHover: CURSOR_AI.surfaceMute,
    border: CURSOR_AI.border,
    text: CURSOR_AI.ink,
    leading: CURSOR_AI.inkMute,
  },
  approve: {
    bg: CURSOR_AI.greenMute,
    bgHover: CURSOR_AI.green,
    border: CURSOR_AI.green,
    text: CURSOR_AI.green,
    leading: CURSOR_AI.green,
  },
  reject: {
    bg: CURSOR_AI.redMute,
    bgHover: CURSOR_AI.red,
    border: CURSOR_AI.red,
    text: CURSOR_AI.red,
    leading: CURSOR_AI.red,
  },
  ghost: {
    bg: "transparent",
    bgHover: CURSOR_AI.surfaceMute,
    border: CURSOR_AI.border,
    text: CURSOR_AI.inkMute,
    leading: CURSOR_AI.inkMute,
  },
};

/** Pill button with optional leading icon + trailing badge. */
export function drawAiButton(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  opts: AiButtonOpts = {},
): void {
  const tone = opts.tone ?? "secondary";
  const spec = TONE_SPECS[tone];
  const hovered = opts.hovered === true && !opts.disabled;
  const font =
    opts.font ?? "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  ctx.save();
  if (opts.disabled) ctx.globalAlpha = 0.5;
  // Background
  if (spec.bg !== "transparent") {
    ctx.fillStyle = hovered ? spec.bgHover : spec.bg;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
  } else if (hovered) {
    ctx.fillStyle = spec.bgHover;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();
  }
  // Border
  ctx.strokeStyle = spec.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.stroke();
  // Text — adjust color when hovered for tones that fill on hover.
  const filledOnHover =
    hovered && (tone === "approve" || tone === "reject" || tone === "primary");
  ctx.fillStyle = filledOnHover ? "#ffffff" : spec.text;
  ctx.font = font;
  ctx.textBaseline = "middle";
  let textX = rect.x + 12;
  if (opts.leading) {
    ctx.fillStyle = filledOnHover ? "#ffffff" : spec.leading;
    ctx.fillText(opts.leading, textX, rect.y + rect.h / 2);
    textX += ctx.measureText(opts.leading).width + 6;
    ctx.fillStyle = filledOnHover ? "#ffffff" : spec.text;
  }
  ctx.textAlign = "left";
  ctx.fillText(label, textX, rect.y + rect.h / 2 + 1);
  if (opts.trailing) {
    ctx.fillStyle = filledOnHover
      ? "rgba(255,255,255,0.85)"
      : CURSOR_AI.inkSubtle;
    ctx.font = "500 10px 'Cursor Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(opts.trailing, rect.x + rect.w - 10, rect.y + rect.h / 2 + 1);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/** Hit-test helper. */
export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export interface AiAvatarOpts {
  /** Size of the cube head in px (default 18). */
  readonly size?: number;
  /** Override the cube fill (default white). */
  readonly fill?: string;
  /** Wedge color (default near-black). */
  readonly wedge?: string;
  /** Outline color (default `border`). */
  readonly outline?: string;
}

/**
 * Cursor-mascot avatar — tilted glass cube head with a black down-pointing
 * cursor wedge. Used for "AI says…" voices (Bugbot, Cloud Agent, Tab).
 */
export function drawAiAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: AiAvatarOpts = {},
): void {
  const s = opts.size ?? 18;
  const fill = opts.fill ?? "#ffffff";
  const wedge = opts.wedge ?? "#0d0c08";
  const outline = opts.outline ?? CURSOR_AI.border;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.14);
  ctx.fillStyle = fill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.fillStyle = wedge;
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, -s * 0.18);
  ctx.lineTo(s * 0.32, -s * 0.18);
  ctx.lineTo(-s * 0.05, s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Tiny status pill (used in agent rows). */
export function drawAiStatusPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  tone: "neutral" | "active" | "alert" | "done" | "lost" = "neutral",
): { width: number } {
  const colorMap: Record<string, { bg: string; text: string }> = {
    neutral: { bg: CURSOR_AI.surfaceMute, text: CURSOR_AI.inkMute },
    active: { bg: CURSOR_AI.blueMute, text: CURSOR_AI.blue },
    alert: { bg: CURSOR_AI.accentMute, text: CURSOR_AI.accent },
    done: { bg: CURSOR_AI.greenMute, text: CURSOR_AI.green },
    lost: { bg: CURSOR_AI.redMute, text: CURSOR_AI.red },
  };
  const c = colorMap[tone] ?? colorMap.neutral!;
  ctx.save();
  ctx.font = "600 10px 'Cursor Mono', ui-monospace, monospace";
  const tw = ctx.measureText(label).width;
  const w = tw + 14;
  const h = 18;
  ctx.fillStyle = c.bg;
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, 9);
  ctx.fill();
  ctx.fillStyle = c.text;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 7, y + 1);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
  return { width: w };
}

/** Slim horizontal progress line. */
export function drawAiProgressLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  frac01: number,
  opts: { tone?: "default" | "alert"; track?: string; thickness?: number } = {},
): void {
  const t = opts.thickness ?? 4;
  const track = opts.track ?? CURSOR_AI.border;
  const tone = opts.tone ?? "default";
  const fill = tone === "alert" ? CURSOR_AI.accent : CURSOR_AI.blue;
  ctx.save();
  ctx.fillStyle = track;
  ctx.beginPath();
  ctx.roundRect(x, y, w, t, t / 2);
  ctx.fill();
  const fw = w * Math.max(0, Math.min(1, frac01));
  if (fw > 0) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, fw, t, t / 2);
    ctx.fill();
  }
  ctx.restore();
}
