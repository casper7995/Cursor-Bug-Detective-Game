/** Pure reagent color logic — tested without canvas. */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function targetRgbFromToken(token: string): Rgb {
  let h = 2166136261;
  const t = token.toUpperCase().replace(/[^A-Z0-9]/g, "") || "X";
  for (let i = 0; i < t.length; i++) {
    h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  }
  const u = h >>> 0;
  return {
    r: 0.15 + ((u & 255) / 255) * 0.75,
    g: 0.15 + (((u >> 8) & 255) / 255) * 0.75,
    b: 0.15 + (((u >> 16) & 255) / 255) * 0.75,
  };
}

export const DROP_STEP = 0.12;
export const RINSE_BASELINE = 0.12;

export function addDrop(rgb: Rgb, channel: 0 | 1 | 2): Rgb {
  const d = DROP_STEP;
  if (channel === 0) return { r: clamp01(rgb.r + d), g: rgb.g, b: rgb.b };
  if (channel === 1) return { r: rgb.r, g: clamp01(rgb.g + d), b: rgb.b };
  return { r: rgb.r, g: rgb.g, b: clamp01(rgb.b + d) };
}

export function removeDrop(rgb: Rgb, channel: 0 | 1 | 2): Rgb {
  const d = DROP_STEP;
  const floor = (v: number): number => Math.max(RINSE_BASELINE, v - d);
  if (channel === 0) return { r: floor(rgb.r), g: rgb.g, b: rgb.b };
  if (channel === 1) return { r: rgb.r, g: floor(rgb.g), b: rgb.b };
  return { r: rgb.r, g: rgb.g, b: floor(rgb.b) };
}

export function rinse(): Rgb {
  return { r: RINSE_BASELINE, g: RINSE_BASELINE, b: RINSE_BASELINE };
}

export function dropCount(channelValue: number): number {
  return Math.max(0, Math.round((channelValue - RINSE_BASELINE) / DROP_STEP));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Match within this L2 distance to lock the clue. */
export const MATCH_TOLERANCE = 0.18;

export function isMixCloseEnough(mix: Rgb, target: Rgb): boolean {
  return colorDistance(mix, target) <= MATCH_TOLERANCE;
}
