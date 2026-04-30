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
    opts.font ??
    "600 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
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

/**
 * Word-wrap `text` into lines that fit `width` pixels using the ctx's
 * current font. Returns just the lines — caller decides how to draw them.
 */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
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
  return lines;
}

/**
 * Count of wrapped lines for `text` at `width` pixels using ctx's font.
 * Cheaper than `wrapLines(...).length` for hot paths since it avoids the
 * intermediate array. Always returns at least 1.
 */
export function wrappedLineCount(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): number {
  const words = text.split(/\s+/);
  let lines = 1;
  let curW = 0;
  const spaceW = ctx.measureText(" ").width;
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    const wordW = ctx.measureText(word).width;
    if (i === 0) {
      curW = wordW;
      continue;
    }
    const tentative = curW + spaceW + wordW;
    if (tentative <= width) {
      curW = tentative;
    } else {
      lines++;
      curW = wordW;
    }
  }
  return lines;
}

/**
 * Word-wrap and draw `text` inside a width box. Returns the next baseline y
 * so callers can stack content below. Uses the ctx's current font/fillStyle.
 */
export function wrapAndDraw(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineH: number,
): number {
  const lines = wrapLines(ctx, text, width);
  let yy = y;
  for (const line of lines) {
    ctx.fillText(line, x, yy);
    yy += lineH;
  }
  return yy;
}

/**
 * Truncate `text` to fit within `maxW` pixels using the ctx's current font.
 * Prefers whitespace boundaries; falls back to a per-character cut only when
 * no space exists in the kept window. Appends an ellipsis when truncated.
 */
export function truncateOnWord(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = "…";
  const ellW = ctx.measureText(ell).width;
  const budget = Math.max(0, maxW - ellW);
  // Word-boundary search first.
  let lastSpace = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === " " || ch === "\t") {
      const slice = text.slice(0, i);
      if (ctx.measureText(slice).width <= budget) {
        lastSpace = i;
      } else {
        break;
      }
    }
  }
  if (lastSpace > 0) return text.slice(0, lastSpace) + ell;
  // No suitable space — character cut.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid)).width <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ell : ell;
}

/**
 * Run `drawFn` with the canvas clipped to the given rect. Restores state on
 * exit (including any path/clip set inside drawFn).
 */
export function clipToRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  drawFn: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  drawFn();
  ctx.restore();
}

/**
 * One stat in a result-card stat row.
 */
export interface ResultStat {
  /** Short label (e.g., "accuracy"). */
  readonly label: string;
  /** Pre-formatted value (e.g., "3 / 6", "+12 m"). */
  readonly value: string;
  /** Optional comparison delta line (e.g., "+5 vs best"). */
  readonly delta?: string;
  /** Optional accent color for the value (default ink). */
  readonly accent?: string;
}

export interface ResultStripOpts {
  /** Big headline number (or pre-formatted value like "1 000"). */
  readonly headline: string;
  /** Caption under the headline (default "score"). */
  readonly headlineCaption?: string;
  /** 2–4 stats in the right strip. */
  readonly stats: readonly ResultStat[];
  /** Footer hint shown at the bottom of the card (e.g., "click anywhere to close"). */
  readonly footer?: string;
  /** Optional teach line — what changed / what was correct (Tamper "the key was bent"). */
  readonly teach?: string;
}

/**
 * Shared layout primitive for end-of-round cards. Renders inside an existing
 * card rect drawn by `drawAiCard`. Caller owns the card box; this fills it
 * with a consistent score / stats / footer composition so every minigame
 * reads as the same shape.
 *
 * Layout (inside the card):
 *   y+22  HEADLINE label (small caps mono)
 *   y+58  HEADLINE value (36px mono, big)
 *   y+78  caption ("score")
 *   y+22  right-side stat strip (label + value rows)
 *   y+H-?? optional teach line
 *   y+H-16 footer hint
 */
export function drawAiResultStrip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: ResultStripOpts,
): void {
  ctx.save();
  // Headline label.
  ctx.fillStyle = CURSOR_AI.inkMute;
  ctx.font = "600 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText("RESULT", x + 24, y + 22);
  // Headline value (big).
  ctx.fillStyle = CURSOR_AI.ink;
  ctx.font = "700 36px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(opts.headline, x + 24, y + 64);
  // Caption.
  ctx.fillStyle = CURSOR_AI.inkSubtle;
  ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
  ctx.fillText(opts.headlineCaption ?? "score", x + 24, y + 80);

  // Stat strip (right aligned column).
  const stripX = x + w - 152;
  let sy = y + 24;
  for (const stat of opts.stats) {
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 11px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(stat.label, stripX, sy);
    ctx.fillStyle = stat.accent ?? CURSOR_AI.ink;
    ctx.font = "700 12px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(stat.value, stripX + 86, sy);
    if (stat.delta) {
      ctx.fillStyle = CURSOR_AI.inkSubtle;
      ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
      ctx.fillText(stat.delta, stripX + 86, sy + 12);
      sy += 28;
    } else {
      sy += 18;
    }
  }

  // Optional teach line near the bottom (above footer).
  if (opts.teach) {
    ctx.fillStyle = CURSOR_AI.inkMute;
    ctx.font = "500 11px 'Cursor Gothic', sans-serif";
    wrapAndDraw(ctx, opts.teach, x + 24, y + h - 36, w - 48, 14);
  }

  // Footer hint.
  if (opts.footer) {
    ctx.fillStyle = CURSOR_AI.inkSubtle;
    ctx.font = "10px 'Cursor Mono', ui-monospace, monospace";
    ctx.fillText(opts.footer, x + 24, y + h - 16);
  }
  ctx.restore();
}

/**
 * Draw a session-title pair: a primary `main` string at (x, y), then a
 * subtle `sub` string immediately after it with a gap. Measures `main` so
 * the subtitle never collides regardless of length. Uses two distinct
 * fonts/styles passed in, and resets to the previous baseline on exit.
 */
export interface AiCardTitleOpts {
  /** Font for the main title. */
  readonly mainFont?: string;
  /** Font for the subtitle. */
  readonly subFont?: string;
  /** Fill for the main title. */
  readonly mainFill?: string;
  /** Fill for the subtitle. */
  readonly subFill?: string;
  /** Pixel gap between main and subtitle (default 6). */
  readonly gap?: number;
}
export function drawAiCardTitle(
  ctx: CanvasRenderingContext2D,
  main: string,
  sub: string,
  x: number,
  y: number,
  opts: AiCardTitleOpts = {},
): void {
  const mainFont =
    opts.mainFont ??
    "700 12px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
  const subFont = opts.subFont ?? "11px 'Cursor Mono', ui-monospace, monospace";
  const mainFill = opts.mainFill ?? CURSOR_AI.ink;
  const subFill = opts.subFill ?? CURSOR_AI.inkSubtle;
  const gap = opts.gap ?? 6;
  ctx.save();
  ctx.font = mainFont;
  ctx.fillStyle = mainFill;
  ctx.fillText(main, x, y);
  const mainW = ctx.measureText(main).width;
  ctx.font = subFont;
  ctx.fillStyle = subFill;
  ctx.fillText(sub, x + mainW + gap, y);
  ctx.restore();
}
