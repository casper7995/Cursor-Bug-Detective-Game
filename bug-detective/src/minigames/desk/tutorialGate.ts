/**
 * First-open tutorial card for desk minigames — drawn in internal canvas space,
 * localStorage-gated per game type (`bd:miniTutorial:*`).
 */

import { CURSOR } from "../../ui/cursorTheme";
import { wrapAndDraw, wrappedLineCount } from "./aiCard";

export interface TutorialContent {
  readonly title: string;
  readonly tagline: string;
  readonly howToLines: readonly string[];
  readonly drawDiagram?: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  /**
   * Pixels reserved below the bullet list when `drawDiagram` is set.
   * Must fit the diagram; Start is drawn beneath this band.
   */
  readonly diagramHeight?: number;
  readonly storageKey: string;
}

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Small [?] next to the desk close control — same row, left of ✕. */
export function getDeskHelpButtonRect(W: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return { x: W - 82, y: 10, w: 30, h: 26 };
}

export function hitDeskHelpButton(
  gameX: number,
  gameY: number,
  W: number,
): boolean {
  const r = getDeskHelpButtonRect(W);
  return inRect(gameX, gameY, r);
}

/** Room above card bottom for footer line + padding (matches draw baseline ~h-13). */
const TUTORIAL_FOOTER_RESERVE = 28;
const TUTORIAL_MIN_DIAGRAM_H = 36;

export interface TutorialLayoutResult {
  readonly cardRect: { x: number; y: number; w: number; h: number };
  readonly startRect: { x: number; y: number; w: number; h: number };
  readonly diagramBounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
}

/**
 * Pure layout for tests and TutorialGate: bottom-anchors Start + footer inside the card
 * and shrinks or omits the diagram when the canvas is short (e.g. 320px-tall minigame).
 */
export function computeTutorialLayout(
  W: number,
  H: number,
  cardW: number,
  content: Pick<TutorialContent, "drawDiagram" | "diagramHeight">,
  bulletsBlock: number,
): TutorialLayoutResult {
  const padTop = 22;
  const titleBlock = 28;
  const taglineBlock = 24;
  const headerH = padTop + titleBlock + taglineBlock;
  const maxCardH = H - 24;
  const btnW = 176;
  const btnH = 38;
  const gapDiagramToBtn = 14;
  const diagramGap = 12;

  const bulletEndU = headerH + bulletsBlock;
  const desiredDiagram =
    typeof content.drawDiagram === "function"
      ? (content.diagramHeight ?? 92)
      : 0;

  const stackNoDiagram =
    bulletEndU + 8 + gapDiagramToBtn + btnH + TUTORIAL_FOOTER_RESERVE;

  const maxDiagramEnvelope = Math.max(
    0,
    maxCardH -
      bulletEndU -
      diagramGap -
      gapDiagramToBtn -
      btnH -
      TUTORIAL_FOOTER_RESERVE,
  );

  let gapAfterBullets: 8 | 12 = 8;
  let diagramH = 0;
  if (desiredDiagram > 0) {
    diagramH = Math.min(desiredDiagram, maxDiagramEnvelope);
    if (diagramH >= TUTORIAL_MIN_DIAGRAM_H) gapAfterBullets = diagramGap;
    else diagramH = 0;
  }

  const stackWithDiagram =
    bulletEndU +
    gapAfterBullets +
    diagramH +
    gapDiagramToBtn +
    btnH +
    TUTORIAL_FOOTER_RESERVE;
  const ch = Math.min(maxCardH, Math.max(stackNoDiagram, stackWithDiagram));

  const cardX = (W - cardW) / 2;
  const cardY = (H - ch) / 2;

  const startY = cardY + ch - TUTORIAL_FOOTER_RESERVE - btnH;
  const diagramBottom = startY - gapDiagramToBtn;

  const clampDiagram = (): void => {
    const topMin = cardY + bulletEndU + gapAfterBullets;
    diagramH = Math.min(diagramH, Math.max(0, diagramBottom - topMin));
    if (diagramH < TUTORIAL_MIN_DIAGRAM_H) {
      diagramH = 0;
      gapAfterBullets = 8;
      const topMin2 = cardY + bulletEndU + gapAfterBullets;
      diagramH = Math.min(desiredDiagram, Math.max(0, diagramBottom - topMin2));
      if (diagramH < TUTORIAL_MIN_DIAGRAM_H) diagramH = 0;
      else gapAfterBullets = diagramGap;
    }
  };
  clampDiagram();

  const diagramTop =
    diagramH > 0
      ? diagramBottom - diagramH
      : cardY + bulletEndU + gapAfterBullets;

  const diagramBounds =
    diagramH > 0
      ? {
          x: cardX + 18,
          y: diagramTop,
          w: cardW - 36,
          h: diagramH,
        }
      : null;

  return {
    cardRect: { x: cardX, y: cardY, w: cardW, h: ch },
    startRect: {
      x: cardX + (cardW - btnW) / 2,
      y: startY,
      w: btnW,
      h: btnH,
    },
    diagramBounds,
  };
}

export class TutorialGate {
  private static readonly BULLET_LINE_SKIP = 17;
  private static readonly BULLET_GAP_AFTER = 4;
  /** Space from bullet-area top to first bullet baseline (matches draw). */
  private static readonly BULLET_FIRST_BASELINE_OFFSET = 12;

  /** When true, puzzle input is blocked and the tutorial card is shown. */
  visible: boolean;
  private readonly content: TutorialContent;
  private cardRect = { x: 0, y: 0, w: 0, h: 0 };
  private startRect = { x: 0, y: 0, w: 0, h: 0 };
  private innerCloseRect = { x: 0, y: 0, w: 0, h: 0 };
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };
  /** Allocated diagram slot (game coords); null when no diagram. */
  private diagramBounds: { x: number; y: number; w: number; h: number } | null =
    null;

  constructor(content: TutorialContent) {
    this.content = content;
    try {
      this.visible = localStorage.getItem(content.storageKey) !== "1";
    } catch {
      this.visible = true;
    }
  }

  isBlocking(): boolean {
    return this.visible;
  }

  reopen(): void {
    this.visible = true;
  }

  /**
   * Memo for `estimateBulletsBlock` keyed on card width. Wiped if the
   * bullets ever change (they're set once at construction so this is a
   * no-op in practice, but defensive).
   */
  private bulletsBlockMemo: { cw: number; height: number } | null = null;

  /**
   * Bullets-block height in pixels for a given card width. Uses real
   * `measureText` via an offscreen canvas with the same font the renderer
   * uses, so layout matches draw exactly. Memoized per `cw`.
   */
  private estimateBulletsBlock(cw: number): number {
    if (this.bulletsBlockMemo && this.bulletsBlockMemo.cw === cw) {
      return this.bulletsBlockMemo.height;
    }
    const ctx = TutorialGate.measureCtx();
    ctx.font = "12px 'Cursor Gothic', sans-serif";
    const innerW = cw - 36;
    let totalLines = 0;
    for (const line of this.content.howToLines) {
      const lines = wrappedLineCount(ctx, `• ${line}`, innerW);
      totalLines += lines;
    }
    // Mirrors draw loop: lead + lineSkip per wrapped line + gap after each bullet + tail.
    const height =
      TutorialGate.BULLET_FIRST_BASELINE_OFFSET +
      totalLines * TutorialGate.BULLET_LINE_SKIP +
      this.content.howToLines.length * TutorialGate.BULLET_GAP_AFTER +
      8;
    this.bulletsBlockMemo = { cw, height };
    return height;
  }

  /** Lazy offscreen 2d ctx — one per browser document, reused by all gates. */
  private static _measureCtx: CanvasRenderingContext2D | null = null;
  private static measureCtx(): CanvasRenderingContext2D {
    if (TutorialGate._measureCtx) return TutorialGate._measureCtx;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2d");
    TutorialGate._measureCtx = ctx;
    return ctx;
  }

  private dismissWithoutSave(): void {
    this.visible = false;
  }

  private markSeen(): void {
    try {
      localStorage.setItem(this.content.storageKey, "1");
    } catch {
      /* ignore */
    }
    this.visible = false;
  }

  /** Esc / MenuBack: close tutorial without marking seen (minigame stays open). */
  dismissFromKey(): void {
    if (this.visible) this.dismissWithoutSave();
  }

  private layout(W: number, H: number): void {
    this.panelRect = { x: 0, y: 0, w: W, h: H };
    const cw = Math.min(460, W - 48);
    const bulletsBlock = this.estimateBulletsBlock(cw);
    const laid = computeTutorialLayout(W, H, cw, this.content, bulletsBlock);
    this.cardRect = laid.cardRect;
    this.diagramBounds = laid.diagramBounds;
    this.startRect = laid.startRect;
    this.innerCloseRect = {
      x: this.cardRect.x + this.cardRect.w - 36,
      y: this.cardRect.y + 10,
      w: 28,
      h: 24,
    };
  }

  /**
   * Pointer in internal game coords. Returns action if consumed.
   * "start" = marked seen and closed; "close" = dismissed without persisting.
   */
  handlePointer(
    gameX: number,
    gameY: number,
    W: number,
    H: number,
  ): "start" | "close" | null {
    if (!this.visible) return null;
    this.layout(W, H);
    if (inRect(gameX, gameY, this.startRect)) {
      this.markSeen();
      return "start";
    }
    if (inRect(gameX, gameY, this.innerCloseRect)) {
      this.dismissWithoutSave();
      return "close";
    }
    const { cardRect, panelRect } = this;
    const inCard =
      gameX >= cardRect.x &&
      gameX <= cardRect.x + cardRect.w &&
      gameY >= cardRect.y &&
      gameY <= cardRect.y + cardRect.h;
    if (!inCard) {
      const inPanel =
        gameX >= panelRect.x &&
        gameX <= panelRect.x + panelRect.w &&
        gameY >= panelRect.y &&
        gameY <= panelRect.y + panelRect.h;
      if (inPanel) {
        this.dismissWithoutSave();
        return "close";
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.visible) return;
    this.layout(W, H);
    const { cardRect, startRect, innerCloseRect } = this;
    const c = this.content;

    ctx.save();
    ctx.fillStyle = "rgba(8,7,5,0.78)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#1a1812";
    ctx.strokeStyle = "rgba(245,78,0,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cardRect.x, cardRect.y, cardRect.w, cardRect.h, 12);
    ctx.fill();
    ctx.stroke();

    const padTop = 22;
    const titleBlock = 28;
    const taglineBlock = 24;
    const bulletAreaTop = cardRect.y + padTop + titleBlock + taglineBlock;

    ctx.fillStyle = CURSOR.gold;
    ctx.font = "600 13px 'Cursor Gothic', ui-sans-serif, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      c.title.toUpperCase(),
      cardRect.x + 18,
      bulletAreaTop - taglineBlock - 8,
    );

    ctx.fillStyle = CURSOR.textHi;
    ctx.font = "12px 'Cursor Gothic', sans-serif";
    ctx.fillText(c.tagline, cardRect.x + 18, bulletAreaTop - 12);

    ctx.font = "12px 'Cursor Gothic', sans-serif";
    ctx.fillStyle = "rgba(247,247,244,0.94)";
    const bulletMaxW = cardRect.w - 36;
    let ly = bulletAreaTop + TutorialGate.BULLET_FIRST_BASELINE_OFFSET;
    const skip = TutorialGate.BULLET_LINE_SKIP;
    const afterBullet = TutorialGate.BULLET_GAP_AFTER;
    for (const line of c.howToLines) {
      ly = wrapAndDraw(
        ctx,
        `\u2022 ${line}`,
        cardRect.x + 18,
        ly,
        bulletMaxW,
        skip,
      );
      ly += afterBullet;
    }
    ly += 8;

    if (c.drawDiagram && this.diagramBounds) {
      const b = this.diagramBounds;
      c.drawDiagram(ctx, b.x, b.y, b.w, b.h);
    }

    ctx.fillStyle = "rgba(245,78,0,0.95)";
    ctx.beginPath();
    ctx.roundRect(startRect.x, startRect.y, startRect.w, startRect.h, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 14px 'Cursor Gothic', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Start",
      startRect.x + startRect.w / 2,
      startRect.y + startRect.h / 2,
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeRect(
      innerCloseRect.x,
      innerCloseRect.y,
      innerCloseRect.w,
      innerCloseRect.h,
    );
    ctx.fillStyle = CURSOR.textHi;
    ctx.font = "700 14px 'Cursor Gothic', ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "\u00d7",
      innerCloseRect.x + innerCloseRect.w / 2,
      innerCloseRect.y + innerCloseRect.h / 2 + 1,
    );
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = "rgba(237,236,236,0.82)";
    ctx.font = "600 11px 'Cursor Gothic', ui-sans-serif, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "Esc closes · Start hides this sheet next time",
      cardRect.x + cardRect.w / 2,
      cardRect.y + cardRect.h - 13,
    );
    ctx.textAlign = "left";
    ctx.restore();
  }
}

/* Old envelope/reagent/lamp diagrams removed; new minis define their own. */
