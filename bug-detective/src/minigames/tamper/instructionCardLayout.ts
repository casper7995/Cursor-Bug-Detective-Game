/**
 * Layout for Tamper `drawIntroCard` — single source of truth for tests and draw.
 * Ensures body copy stays above the progress line on short desk canvases (512×320).
 */

export const TAMPER_INTRO_CARD = {
  w: 380,
  h: 178,
  /** Y offset from card top to first body line (below title block). */
  bodyStartOffsetFromCardTop: 82,
  /** `drawAiProgressLine` Y is this far above the card bottom. */
  progressLineOffsetFromBottom: 24,
  /** Minimum gap between last body line and progress line. */
  textBottomMarginAboveProgress: 10,
} as const;

export interface TamperIntroLayoutMetrics {
  readonly cardTop: number;
  readonly progressLineY: number;
  readonly bodyStartY: number;
  readonly maxBodyBottomY: number;
  readonly bodyHeightBudget: number;
}

export function tamperIntroInstructionLayout(
  _W: number,
  H: number,
): TamperIntroLayoutMetrics {
  const {
    h,
    bodyStartOffsetFromCardTop,
    progressLineOffsetFromBottom,
    textBottomMarginAboveProgress,
  } = TAMPER_INTRO_CARD;
  const y = (H - h) / 2;
  const progressLineY = y + h - progressLineOffsetFromBottom;
  const bodyStartY = y + bodyStartOffsetFromCardTop;
  const maxBodyBottomY = progressLineY - textBottomMarginAboveProgress;
  return {
    cardTop: y,
    progressLineY,
    bodyStartY,
    maxBodyBottomY,
    bodyHeightBudget: Math.max(0, maxBodyBottomY - bodyStartY),
  };
}
