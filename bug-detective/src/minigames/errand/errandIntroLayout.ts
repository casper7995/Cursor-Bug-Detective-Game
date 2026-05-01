/**
 * Layout for `drawErrandIntro` — keeps wrapped body copy above the progress line
 * on 512×320 desk canvas.
 */

/** Body copy for intro card — keep in sync with `drawErrandIntro` wrapping. */
export const ERRAND_INTRO_BODY_PARAS = [
  "Q / W / E pick hero. 1 / 2 / 3 deploy lane. Ring = uptime — redeploy.",
  "Fixer = cheap sustained; Reviewer slows + chips; Firewall = burst, short window.",
  "Clue locks at wave 3 or 60s survived; then score until overrun.",
] as const;

/** Pessimistic stub `measureText` for tests (no DOM); wider = more lines → safer bound. */
export function errandIntroLineTestContext(): CanvasRenderingContext2D {
  const cpw = 8.4;
  const spaceW = 4.2;
  return {
    measureText(s: string) {
      return { width: s === " " ? spaceW : s.length * cpw };
    },
  } as unknown as CanvasRenderingContext2D;
}

export const ERRAND_INTRO_CARD = {
  w: 392,
  h: 178,
  /** Title block: subtitle baseline from card top. */
  subtitleBaselineFromTop: 46,
  /** First body paragraph starts this many px below card top. */
  bodyStartOffsetFromCardTop: 60,
  /** `drawAiProgressLine` Y offset from card bottom. */
  progressLineOffsetFromBottom: 22,
  /** Minimum gap between last body line and progress line. */
  textBottomMarginAboveProgress: 8,
  /** Line height for 12px body copy. */
  bodyLineHeight: 14,
} as const;

export interface ErrandIntroLayoutMetrics {
  readonly cardTop: number;
  readonly cardLeft: number;
  readonly progressLineY: number;
  readonly bodyStartY: number;
  readonly maxBodyBottomY: number;
  readonly bodyTextMaxWidth: number;
}

export function errandIntroInstructionLayout(
  W: number,
  H: number,
): ErrandIntroLayoutMetrics {
  const { w, h, bodyStartOffsetFromCardTop, progressLineOffsetFromBottom } =
    ERRAND_INTRO_CARD;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  const progressLineY = y + h - progressLineOffsetFromBottom;
  const bodyStartY = y + bodyStartOffsetFromCardTop;
  const maxBodyBottomY =
    progressLineY - ERRAND_INTRO_CARD.textBottomMarginAboveProgress;
  const bodyTextMaxWidth = w - 44;
  return {
    cardTop: y,
    cardLeft: x,
    progressLineY,
    bodyStartY,
    maxBodyBottomY,
    bodyTextMaxWidth,
  };
}
